use crate::db::models::{ChatMessage, ChatResponse, ReasoningBlock};
use crate::error::{ZenError, ZenResult};
use crate::llm::openai_compat::types::*;
use crate::llm::openai_compat::OpenAiCompatProvider;
use futures::StreamExt;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::RwLock;
use tracing::{debug, error, info};

impl OpenAiCompatProvider {
    fn provider_key(&self) -> String {
        self.provider_name.to_lowercase()
    }

    fn is_openrouter(&self) -> bool {
        self.provider_key() == "openrouter"
    }

    fn is_nine_router(&self) -> bool {
        matches!(
            self.provider_key().as_str(),
            "nine_router" | "nine-router" | "n9router" | "9router"
        )
    }

    fn model_supports_reasoning(&self, model: &str) -> bool {
        self.model_capabilities
            .read()
            .ok()
            .and_then(|cache| cache.get(model).map(|caps| caps.supports_reasoning))
            .unwrap_or(false)
    }

    fn is_gemini_compat(&self) -> bool {
        matches!(self.provider_key().as_str(), "google" | "gemini")
    }

    fn should_request_stream_usage(&self) -> bool {
        let provider = self.provider_key();
        matches!(
            provider.as_str(),
            "openai"
                | "openrouter"
                | "groq"
                | "mistral"
                | "deepseek"
                | "qwen"
                | "xai"
                | "together"
                | "kilocode"
                | "nine_router"
                | "nine-router"
                | "n9router"
                | "9router"
                | "opencode"
                | "opencode_free"
                | "aihubmix"
                | "nvidia"
        )
    }

    fn openrouter_reasoning_from_config(
        config: &crate::llm::ChatRequestConfig,
    ) -> Option<serde_json::Value> {
        if config.reasoning_effort.is_none() && config.thinking_budget.is_none() {
            return None;
        }

        let mut reasoning = serde_json::Map::new();
        if let Some(effort) = &config.reasoning_effort {
            reasoning.insert("effort".to_string(), Value::String(effort.clone()));
        }
        if let Some(budget) = config.thinking_budget {
            reasoning.insert("max_tokens".to_string(), Value::Number(budget.into()));
        }

        Some(Value::Object(reasoning))
    }

    fn gemini_extra_body_from_config(
        config: &crate::llm::ChatRequestConfig,
    ) -> Option<serde_json::Value> {
        if config.reasoning_effort.is_none() && config.thinking_budget.is_none() {
            return None;
        }

        let mut thinking_config = serde_json::Map::new();
        thinking_config.insert("include_thoughts".to_string(), Value::Bool(true));
        if let Some(budget) = config.thinking_budget {
            thinking_config.insert("thinking_budget".to_string(), Value::Number(budget.into()));
        }

        Some(serde_json::json!({
            "google": {
                "thinking_config": Value::Object(thinking_config)
            }
        }))
    }

    fn reasoning_value_to_string(value: &Value) -> Option<String> {
        match value {
            Value::String(text) if !text.is_empty() => Some(text.clone()),
            Value::Array(items) => {
                let text = items
                    .iter()
                    .filter_map(Self::reasoning_value_to_string)
                    .collect::<String>();
                (!text.is_empty()).then_some(text)
            }
            Value::Object(map) => [
                "content",
                "text",
                "reasoning",
                "reasoning_content",
                "thinking",
            ]
            .iter()
            .find_map(|key| map.get(*key).and_then(Self::reasoning_value_to_string)),
            _ => None,
        }
    }

    fn reasoning_block_from_value(
        &self,
        block_type: &str,
        value: &Value,
    ) -> Option<ReasoningBlock> {
        let text = Self::reasoning_value_to_string(value);
        if text.is_none() && value.is_null() {
            return None;
        }

        Some(ReasoningBlock {
            provider: self.provider_name.clone(),
            block_type: block_type.to_string(),
            text,
            raw: Some(value.clone()),
        })
    }

    fn emit_reasoning_value(
        &self,
        block_type: &str,
        value: Option<&Value>,
        on_chunk: &(dyn Fn(crate::llm::LlmChunk) + Send),
    ) -> Option<ReasoningBlock> {
        let block = value.and_then(|value| self.reasoning_block_from_value(block_type, value));
        if let Some(thought) = block.as_ref().and_then(|block| block.text.as_ref()) {
            on_chunk(crate::llm::LlmChunk::Thought(thought.clone()));
        }
        block
    }

    fn emit_reasoning_delta(
        &self,
        delta: &OpenAiDelta,
        on_chunk: &(dyn Fn(crate::llm::LlmChunk) + Send),
        reasoning_details: &mut Vec<ReasoningBlock>,
    ) {
        for block in [
            self.emit_reasoning_value("reasoning", delta.reasoning.as_ref(), on_chunk),
            self.emit_reasoning_value(
                "reasoning_content",
                delta.reasoning_content.as_ref(),
                on_chunk,
            ),
            self.emit_reasoning_value("thinking", delta.thinking.as_ref(), on_chunk),
        ]
        .into_iter()
        .flatten()
        {
            reasoning_details.push(block);
        }
    }

    fn emit_reasoning_message(
        &self,
        message: &OpenAiStreamMessage,
        on_chunk: &(dyn Fn(crate::llm::LlmChunk) + Send),
        reasoning_details: &mut Vec<ReasoningBlock>,
    ) {
        for block in [
            self.emit_reasoning_value("reasoning", message.reasoning.as_ref(), on_chunk),
            self.emit_reasoning_value(
                "reasoning_content",
                message.reasoning_content.as_ref(),
                on_chunk,
            ),
        ]
        .into_iter()
        .flatten()
        {
            reasoning_details.push(block);
        }
    }

    fn sanitize_outbound_messages(&self, messages: Vec<ChatMessage>) -> Vec<ChatMessage> {
        let mut sanitized = Vec::with_capacity(messages.len());
        let mut pending_tool_call_ids: HashSet<String> = HashSet::new();

        for (index, mut message) in messages.iter().cloned().enumerate() {
            // Provider-specific reasoning payloads are response metadata, not
            // portable chat-completions input. Some OpenAI-compatible upstreams
            // reject replayed reasoning_details because their schema differs.
            message.reasoning_details = None;

            if message.role == "tool" {
                let Some(tool_call_id) = message.tool_call_id.clone() else {
                    continue;
                };
                if pending_tool_call_ids.remove(&tool_call_id) {
                    sanitized.push(message);
                }
                continue;
            }

            if message.role == "assistant" {
                if let Some(tool_calls) =
                    message.tool_calls.clone().filter(|calls| !calls.is_empty())
                {
                    let required_ids: HashSet<String> =
                        tool_calls.iter().map(|call| call.id.clone()).collect();
                    let mut following_tool_ids = HashSet::new();

                    for following in messages.iter().skip(index + 1) {
                        if following.role != "tool" {
                            break;
                        }
                        if let Some(tool_call_id) = following.tool_call_id.as_ref() {
                            following_tool_ids.insert(tool_call_id.clone());
                        }
                    }

                    if required_ids.is_subset(&following_tool_ids) {
                        pending_tool_call_ids.extend(required_ids);
                        sanitized.push(message);
                    } else if !message.content.trim().is_empty() {
                        message.tool_calls = None;
                        sanitized.push(message);
                    }
                    continue;
                }
            }

            pending_tool_call_ids.clear();
            sanitized.push(message);
        }

        sanitized
    }

    pub async fn do_chat_stream(
        &self,
        model: &str,
        messages: Vec<ChatMessage>,
        tools: Option<Vec<crate::tools::ToolInfo>>,
        config: crate::llm::ChatRequestConfig,
        on_chunk: Box<dyn Fn(crate::llm::LlmChunk) + Send>,
        token: tokio_util::sync::CancellationToken,
    ) -> ZenResult<ChatResponse> {
        let url = self.url("/chat/completions");

        let oai_messages: Vec<OpenAiMessage> = self
            .sanitize_outbound_messages(messages)
            .into_iter()
            .map(|m| {
                let tool_calls_out = m.tool_calls.map(|tcs| {
                    tcs.into_iter()
                        .map(|tc| OpenAiToolCallOut {
                            id: tc.id,
                            call_type: "function".to_string(),
                            function: OpenAiFunctionOut {
                                name: tc.name,
                                arguments: tc.args.to_string(),
                            },
                        })
                        .collect()
                });

                // For assistant messages with tool calls but no text, content should be None
                let oauth_content =
                    if m.role == "assistant" && m.content.is_empty() && tool_calls_out.is_some() {
                        None
                    } else if let Some(images) = m.images {
                        let mut parts = vec![OpenAiContentPart::Text { text: m.content }];
                        for img in images {
                            parts.push(OpenAiContentPart::ImageUrl {
                                image_url: OpenAiImageUrl {
                                    url: img, // Assumes it's already a data URL
                                },
                            });
                        }
                        Some(OpenAiContent::Parts(parts))
                    } else {
                        Some(OpenAiContent::Text(m.content))
                    };

                let reasoning_details = m.reasoning_details.map(|blocks| {
                    blocks
                        .into_iter()
                        .map(|block| {
                            block.raw.unwrap_or_else(|| {
                                serde_json::json!({
                                    "type": block.block_type,
                                    "text": block.text.unwrap_or_default()
                                })
                            })
                        })
                        .collect()
                });

                OpenAiMessage {
                    role: m.role,
                    content: oauth_content,
                    reasoning_details,
                    tool_calls: tool_calls_out,
                    tool_call_id: m.tool_call_id,
                }
            })
            .collect();

        let oai_tools = tools.map(|ts| {
            ts.into_iter()
                .map(|t| {
                    serde_json::json!({
                        "type": "function",
                        "function": {
                            "name": t.name,
                            "description": t.description,
                            "parameters": t.parameters
                        }
                    })
                })
                .collect()
        });

        // Map model specific parameters from config
        let (max_tokens_mapped, max_completion_tokens) =
            if model.starts_with("o1") || model.starts_with("o3") {
                // OpenAI o1/o3 models require max_completion_tokens instead of max_tokens
                (None, config.max_tokens)
            } else {
                (config.max_tokens, None)
            };

        let response_format = config.json_schema.clone().map(|s| {
            serde_json::json!({
                "type": "json_schema",
                "json_schema": {
                    "name": "response_schema",
                    "strict": true,
                    "schema": s
                }
            })
        });

        let is_openrouter = self.is_openrouter();
        let is_gemini_compat = self.is_gemini_compat();
        let reasoning = if is_openrouter {
            Self::openrouter_reasoning_from_config(&config)
        } else {
            None
        };
        let extra_body = if is_gemini_compat {
            Self::gemini_extra_body_from_config(&config)
        } else {
            None
        };

        let allow_reasoning = !self.is_nine_router() || self.model_supports_reasoning(model);
        let request = OpenAiChatRequest {
            model: model.to_string(),
            messages: oai_messages,
            stream: true,
            temperature: config.temperature,
            max_tokens: max_tokens_mapped,
            max_completion_tokens,
            top_p: config.top_p,
            presence_penalty: config.presence_penalty,
            frequency_penalty: config.frequency_penalty,
            seed: config.seed,
            stop: config.stop.clone(),
            tools: oai_tools,
            response_format,
            reasoning_effort: if is_openrouter || !allow_reasoning {
                None
            } else {
                config.reasoning_effort.clone()
            },
            reasoning: None,
            extra_body: None,
        };
        let mut request_body = serde_json::to_value(&request)?;
        if let Some(reasoning) = reasoning {
            request_body["reasoning"] = reasoning;
        }
        if let Some(extra_body) = extra_body {
            request_body["extra_body"] = extra_body;
        }
        if self.should_request_stream_usage() {
            request_body["stream_options"] = serde_json::to_value(OpenAiStreamOptions {
                include_usage: true,
            })?;
        }

        info!(
            provider = %self.provider_name,
            model = model,
            "Starting chat stream"
        );

        let resp = self
            .send_with_retry(
                self.auth_post(&url)
                    .json(&request_body)
                    .timeout(std::time::Duration::from_secs(600)),
            )
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "Chat request failed");
            return Err(ZenError::Custom(format!(
                "{} returned {}: {}",
                self.provider_name, status, body
            )));
        }

        let mut full_content = String::new();
        let mut results_tool_calls: Vec<ToolCallAccumulator> = Vec::new();
        let mut reasoning_details: Vec<ReasoningBlock> = Vec::new();
        let mut tokens_in: Option<i64> = None;
        let mut tokens_out: Option<i64> = None;
        let mut stream = resp.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk_result) = tokio::select! {
            res = stream.next() => res,
            _ = token.cancelled() => {
                debug!("Stream cancelled by client via select!");
                None
            }
        } {
            if token.is_cancelled() {
                debug!("Stream cancelled by client");
                break;
            }
            let bytes = chunk_result?;
            buffer.push_str(&String::from_utf8_lossy(&bytes));

            // SSE format: lines starting with "data: " followed by JSON
            while let Some(newline_pos) = buffer.find('\n') {
                let line = buffer[..newline_pos].trim().to_string();
                buffer = buffer[newline_pos + 1..].to_string();

                if line.is_empty() || !line.starts_with("data: ") {
                    continue;
                }

                let json_str = &line[6..]; // Strip "data: " prefix

                // Stream end marker
                if json_str == "[DONE]" {
                    debug!("Stream complete");
                    continue;
                }

                match serde_json::from_str::<OpenAiStreamChunk>(json_str) {
                    Ok(chunk) => {
                        // Extract content delta
                        for choice in &chunk.choices {
                            self.emit_reasoning_delta(
                                &choice.delta,
                                on_chunk.as_ref(),
                                &mut reasoning_details,
                            );
                            if let Some(message) = &choice.message {
                                self.emit_reasoning_message(
                                    message,
                                    on_chunk.as_ref(),
                                    &mut reasoning_details,
                                );
                            }

                            if let Some(content) = &choice.delta.content {
                                if !content.is_empty() {
                                    on_chunk(crate::llm::LlmChunk::Text(content.clone()));
                                    full_content.push_str(content);
                                }
                            }
                            if let Some(message) = &choice.message {
                                if let Some(content) = &message.content {
                                    if !content.is_empty() {
                                        on_chunk(crate::llm::LlmChunk::Text(content.clone()));
                                        full_content.push_str(content);
                                    }
                                }
                            }

                            // Extract tool calls delta
                            if let Some(deltas) = &choice.delta.tool_calls {
                                for delta in deltas {
                                    let idx = delta.index.unwrap_or(0);

                                    // Ensure results_tool_calls has enough space
                                    while results_tool_calls.len() <= idx {
                                        results_tool_calls.push(ToolCallAccumulator::default());
                                    }

                                    let acc = &mut results_tool_calls[idx];
                                    if let Some(id) = &delta.id {
                                        acc.id.push_str(id);
                                    }
                                    if let Some(func) = &delta.function {
                                        if let Some(name) = &func.name {
                                            acc.name.push_str(name);
                                        }
                                        if let Some(args) = &func.arguments {
                                            acc.arguments.push_str(args);
                                        }
                                    }
                                    on_chunk(crate::llm::LlmChunk::ToolCallDelta {
                                        index: idx,
                                        id: if acc.id.is_empty() {
                                            None
                                        } else {
                                            Some(acc.id.clone())
                                        },
                                        name: if acc.name.is_empty() {
                                            None
                                        } else {
                                            Some(acc.name.clone())
                                        },
                                        arguments_delta: delta
                                            .function
                                            .as_ref()
                                            .and_then(|func| func.arguments.clone())
                                            .unwrap_or_default(),
                                        arguments_snapshot: acc.arguments.clone(),
                                    });
                                    if !acc.ready_emitted && !acc.name.is_empty() {
                                        if let Ok(arguments) =
                                            serde_json::from_str::<serde_json::Value>(
                                                &acc.arguments,
                                            )
                                        {
                                            acc.ready_emitted = true;
                                            on_chunk(crate::llm::LlmChunk::ToolCallReady {
                                                index: idx,
                                                id: if acc.id.is_empty() {
                                                    None
                                                } else {
                                                    Some(acc.id.clone())
                                                },
                                                name: acc.name.clone(),
                                                arguments,
                                            });
                                        }
                                    }
                                }
                            }
                        }

                        // Extract usage if present (some providers include on last chunk)
                        if let Some(usage) = &chunk.usage {
                            tokens_in = usage.prompt_tokens;
                            tokens_out = usage.completion_tokens;
                        }
                    }
                    Err(e) => {
                        debug!(json = %json_str, error = %e, "Failed to parse SSE chunk");
                    }
                }
            }
        }

        // Finalize tool calls
        let final_tool_calls = if results_tool_calls.is_empty() {
            None
        } else {
            let mut tcs = Vec::new();
            for acc in results_tool_calls {
                if !acc.name.is_empty() {
                    tcs.push(crate::db::models::ToolCall {
                        id: if acc.id.is_empty() {
                            format!("call_{}", uuid::Uuid::new_v4())
                        } else {
                            acc.id
                        },
                        name: acc.name,
                        args: serde_json::from_str(&acc.arguments)
                            .unwrap_or_else(|_| serde_json::json!({})),
                    });
                }
            }
            if tcs.is_empty() {
                None
            } else {
                Some(tcs)
            }
        };

        Ok(ChatResponse {
            content: full_content,
            model: model.to_string(),
            reasoning_details: if reasoning_details.is_empty() {
                None
            } else {
                Some(reasoning_details)
            },
            tokens_in,
            tokens_out,
            tool_calls: final_tool_calls,
            done: true,
        })
    }

    pub async fn do_embed(&self, model: &str, text: &str) -> ZenResult<Vec<f32>> {
        let url = self.url("/embeddings");
        let request = OpenAiEmbedRequest {
            model: model.to_string(),
            input: text.to_string(),
        };

        let resp = self
            .auth_post(&url)
            .json(&request)
            .timeout(std::time::Duration::from_secs(60))
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(ZenError::Custom(format!(
                "Embedding failed ({}): {}",
                status, body
            )));
        }

        let body: OpenAiEmbedResponse = resp.json().await?;
        body.data
            .into_iter()
            .next()
            .map(|d| d.embedding)
            .ok_or_else(|| ZenError::Custom("No embedding returned".into()))
    }

    pub async fn do_health_check(&self) -> bool {
        let url = self.url("/models");
        match self
            .auth_get(&url)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
        {
            Ok(resp) => resp.status().is_success(),
            Err(_) => {
                let base_str = self.base_url.read().unwrap().clone();
                if base_str.contains("localhost") {
                    let alt_base = base_str.replace("localhost", "127.0.0.1");
                    let alt_provider = Self {
                        client: self.client.clone(),
                        base_url: RwLock::new(alt_base.clone()),
                        api_key: self.api_key.clone(),
                        provider_name: self.provider_name.clone(),
                        extra_headers: self.extra_headers.clone(),
                        model_capabilities: RwLock::new(HashMap::new()),
                    };
                    let alt_url = alt_provider.url("/models");
                    debug!(url = %alt_url, "Trying 127.0.0.1 fallback for health check");
                    if let Ok(resp) = alt_provider
                        .auth_get(&alt_url)
                        .timeout(std::time::Duration::from_secs(10))
                        .send()
                        .await
                    {
                        if resp.status().is_success() {
                            self.update_base_url(&base_str, &alt_base);
                            return true;
                        }
                    }
                }
                false
            }
        }
    }

    pub fn do_supports_tools(&self, model: &str) -> bool {
        // 1. Check capability cache from list_models()
        if let Ok(cache) = self.model_capabilities.read() {
            if let Some(caps) = cache.get(model) {
                return caps.supports_tools;
            }
        }

        // 2. Provider-level policy for unknown models
        self.provider_tool_policy()
    }
}

impl OpenAiCompatProvider {
    /// Provider-level default policy for tool support.
    /// Used as a fallback when the model is not in the capability cache.
    fn provider_tool_policy(&self) -> bool {
        let p = self.provider_name.to_lowercase();
        match p.as_str() {
            // Curated / official catalogs — all models support tools
            "openai" | "groq" | "mistral" | "gemini" | "google" | "deepseek" | "qwen" | "xai"
            | "kilocode" | "opencode"
            | "opencode_free" | "aihubmix" | "nvidia" => true,

            // Mixed catalogs — many models lack tool support
            "openrouter" | "together" | "perplexity" => false,

            // Default: conservative (don't assume tools work)
            _ => false,
        }
    }
}

#[derive(Default)]
pub struct ToolCallAccumulator {
    id: String,
    name: String,
    arguments: String,
    ready_emitted: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::models::ChatMessage;
    use crate::llm::LlmChunk;
    use crate::llm::LlmProvider;
    use std::sync::{Arc, Mutex};
    use wiremock::{
        matchers::{method, path},
        Mock, MockServer, ResponseTemplate,
    };

    async fn mock_provider() -> (OpenAiCompatProvider, MockServer) {
        let server = MockServer::start().await;
        let provider = OpenAiCompatProvider::new(&server.uri(), "test-key-123", "openai");
        (provider, server)
    }

    fn user_message(content: &str) -> ChatMessage {
        ChatMessage {
            role: "user".to_string(),
            content: content.to_string(),
            reasoning_details: None,
            images: None,
            tool_calls: None,
            tool_call_id: None,
        }
    }

    const OPENAI_MODELS_RESPONSE: &str = r#"{
        "data": [
            {
                "id": "gpt-4o",
                "name": "GPT-4o",
                "description": "High-intelligence multimodal model",
                "context_length": 128000,
                "owned_by": "openai",
                "created": 1715368132
            },
            {
                "id": "gpt-4o-mini",
                "name": "GPT-4o Mini",
                "context_length": 128000,
                "owned_by": "openai",
                "created": 1715368132
            },
            {
                "id": "text-embedding-3-small",
                "context_length": 8192,
                "owned_by": "openai",
                "created": 1715368132
            },
            {
                "id": "claude-3-5-sonnet-20241022",
                "owned_by": "anthropic"
            },
            {
                "id": "gemini-1.5-flash"
            }
        ]
    }"#;

    #[tokio::test]
    async fn test_openai_compat_list_models_parses_all_fields() -> ZenResult<()> {
        let (provider, server) = mock_provider().await;

        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(
                OPENAI_MODELS_RESPONSE.as_bytes().to_vec(),
                "application/json",
            ))
            .mount(&server)
            .await;

        let models = provider.list_models().await?;
        assert_eq!(models.len(), 5);

        // gpt-4o — full fields
        assert_eq!(models[0].id, "gpt-4o");
        assert_eq!(models[0].name, "gpt-4o");
        assert_eq!(models[0].display_name.as_deref(), Some("GPT-4o"));
        assert_eq!(
            models[0].description.as_deref(),
            Some("High-intelligence multimodal model")
        );
        assert_eq!(models[0].max_context_length, Some(128000));
        assert_eq!(models[0].provider.as_deref(), Some("openai"));
        assert!(models[0].modified_at.is_some());
        // gpt-4 family -> vision & tools supported
        assert_eq!(models[0].supports_vision, Some(true));
        assert_eq!(models[0].supports_tools, Some(true));

        // text-embedding-3-small — minimal fields
        assert_eq!(models[2].id, "text-embedding-3-small");
        assert_eq!(
            models[2].display_name.as_deref(),
            Some("text-embedding-3-small")
        ); // falls back to id
        assert_eq!(models[2].max_context_length, Some(8192));

        // gemini-1.5-flash — no owned_by
        assert_eq!(models[4].id, "gemini-1.5-flash");
        assert_eq!(models[4].provider.as_deref(), Some("openai")); // falls back to provider_name
        assert!(models[4].max_context_length.is_none());
        Ok(())
    }

    #[tokio::test]
    async fn test_openai_compat_list_models_infers_capabilities() -> ZenResult<()> {
        let (provider, server) = mock_provider().await;

        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": [
                    {"id": "gpt-4-vision-preview"},
                    {"id": "llama-3.2-11b-vision-instruct"},
                    {"id": "claude-3-haiku-20240307"},
                    {"id": "llama-3.3-70b-versatile"},
                    {"id": "pixtral-large"}
                ]
            })))
            .mount(&server)
            .await;

        let models = provider.list_models().await?;

        // gpt-4-vision-preview — "vision" in name
        assert_eq!(models[0].supports_vision, Some(true));

        // llama-3.2-11b-vision-instruct — "vision" in name
        assert_eq!(models[1].supports_vision, Some(true));

        // claude-3-haiku — claude-3 family
        assert_eq!(models[2].supports_vision, Some(true));

        // llama-3.3-70b-versatile — no keywords
        assert_eq!(models[3].supports_vision, Some(false));

        // pixtral-large — known multimodal
        assert_eq!(models[4].supports_vision, Some(true));
        Ok(())
    }

    #[tokio::test]
    async fn test_openai_compat_list_models_empty_response() -> ZenResult<()> {
        let (provider, server) = mock_provider().await;

        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"data": []})))
            .mount(&server)
            .await;

        let models = provider.list_models().await?;
        assert!(models.is_empty());
        Ok(())
    }

    #[tokio::test]
    async fn test_openai_compat_list_models_unauthorized() -> ZenResult<()> {
        let (provider, server) = mock_provider().await;

        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(401).set_body_json(serde_json::json!({
                "error": {
                    "message": "Incorrect API key",
                    "type": "authentication_error"
                }
            })))
            .mount(&server)
            .await;

        let result = provider.list_models().await;
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("401")
                || err.contains("unauthorized")
                || err.contains("Incorrect")
                || err.contains("openai")
        );
        Ok(())
    }

    #[tokio::test]
    async fn test_openai_compat_list_models_sends_auth_header() -> ZenResult<()> {
        let (provider, server) = mock_provider().await;

        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .and(wiremock::matchers::header(
                "authorization",
                "Bearer test-key-123",
            ))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!({"data": [{"id": "gpt-4o"}]})),
            )
            .mount(&server)
            .await;

        let models = provider.list_models().await?;
        assert_eq!(models.len(), 1);
        Ok(())
    }

    #[tokio::test]
    async fn test_openai_compat_list_models_sends_extra_headers() -> ZenResult<()> {
        let server = MockServer::start().await;
        let provider = OpenAiCompatProvider::with_headers(
            &server.uri(),
            "test-key",
            "openrouter",
            vec![
                ("HTTP-Referer".to_string(), "https://zen.local".to_string()),
                ("X-Title".to_string(), "Zen AI".to_string()),
            ],
        );

        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .and(wiremock::matchers::header(
                "http-referer",
                "https://zen.local",
            ))
            .and(wiremock::matchers::header("x-title", "Zen AI"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!({"data": [{"id": "openai/gpt-4o"}]})),
            )
            .mount(&server)
            .await;

        let models = provider.list_models().await?;
        assert_eq!(models.len(), 1);
        Ok(())
    }

    #[tokio::test]
    async fn test_openai_compat_caches_capabilities() -> ZenResult<()> {
        let (provider, server) = mock_provider().await;

        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": [
                    {"id": "gpt-4o"},
                    {"id": "davinci-002"}
                ]
            })))
            .mount(&server)
            .await;

        let models = provider.list_models().await?;
        assert_eq!(models.len(), 2);

        // After list_models, the cache should be populated
        // gpt-4o should support tools
        assert!(provider.supports_tools("gpt-4o"));
        // davinci-002 should also support tools (OpenAI provider)
        assert!(provider.supports_tools("davinci-002"));
        Ok(())
    }

    #[tokio::test]
    async fn test_openrouter_capabilities_come_from_supported_parameters() -> ZenResult<()> {
        let server = MockServer::start().await;
        let provider = OpenAiCompatProvider::new(&server.uri(), "test-key", "openrouter");

        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": [
                    {
                        "id": "anthropic/claude-sonnet-4",
                        "supported_parameters": ["tools", "tool_choice", "reasoning"]
                    },
                    {
                        "id": "openai/gpt-4o-mini",
                        "supported_parameters": ["temperature", "max_tokens"]
                    },
                    {
                        "id": "deepseek/deepseek-r1",
                        "supported_parameters": ["include_reasoning"]
                    }
                ]
            })))
            .mount(&server)
            .await;

        let models = provider.list_models().await?;
        let claude = models
            .iter()
            .find(|model| model.id == "anthropic/claude-sonnet-4")
            .unwrap();
        assert_eq!(claude.supports_tools, Some(true));
        assert_eq!(claude.supports_reasoning, Some(true));
        assert_eq!(claude.reasoning_config_type.as_deref(), Some("budget"));

        let gpt = models
            .iter()
            .find(|model| model.id == "openai/gpt-4o-mini")
            .unwrap();
        assert_eq!(gpt.supports_tools, Some(false));
        assert_eq!(gpt.supports_reasoning, Some(false));
        assert_eq!(gpt.reasoning_config_type, None);

        let r1 = models
            .iter()
            .find(|model| model.id == "deepseek/deepseek-r1")
            .unwrap();
        assert_eq!(r1.supports_reasoning, Some(true));
        assert_eq!(r1.reasoning_config_type.as_deref(), Some("none"));

        assert!(provider.supports_tools("anthropic/claude-sonnet-4"));
        assert!(!provider.supports_tools("openai/gpt-4o-mini"));
        Ok(())
    }

    #[tokio::test]
    async fn test_mixed_router_without_metadata_stays_conservative() -> ZenResult<()> {
        let server = MockServer::start().await;
        let provider = OpenAiCompatProvider::new(&server.uri(), "test-key", "openrouter");

        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": [{"id": "unknown/router-model"}]
            })))
            .mount(&server)
            .await;

        let models = provider.list_models().await?;
        assert_eq!(models[0].supports_tools, Some(false));
        assert_eq!(models[0].supports_reasoning, None);
        assert!(!provider.supports_tools("unknown/router-model"));
        Ok(())
    }

    #[tokio::test]
    async fn test_nine_router_without_metadata_stays_conservative() -> ZenResult<()> {
        let server = MockServer::start().await;
        let provider = OpenAiCompatProvider::new(&server.uri(), "", "nine_router");

        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": [{"id": "nvidia/parakeet-ctc-1.1b-asr"}]
            })))
            .mount(&server)
            .await;

        let models = provider.list_models().await?;
        assert_eq!(models[0].supports_tools, Some(false));
        assert_eq!(models[0].supports_reasoning, None);
        assert!(!provider.supports_tools("nvidia/parakeet-ctc-1.1b-asr"));
        Ok(())
    }

    #[tokio::test]
    async fn test_nine_router_omits_reasoning_without_model_metadata() -> ZenResult<()> {
        let server = MockServer::start().await;
        let provider = OpenAiCompatProvider::new(&server.uri(), "", "nine_router");

        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(
                "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\ndata: [DONE]\n\n",
                "text/event-stream",
            ))
            .mount(&server)
            .await;

        provider
            .chat_stream(
                "unknown/routed-model",
                vec![user_message("hello")],
                None,
                crate::llm::ChatRequestConfig {
                    reasoning_effort: Some("high".to_string()),
                    ..crate::llm::ChatRequestConfig::default()
                },
                Box::new(|_| {}),
                tokio_util::sync::CancellationToken::new(),
            )
            .await?;

        let requests = server.received_requests().await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&requests[0].body)?;
        assert!(body.get("reasoning_effort").is_none());
        Ok(())
    }

    #[test]
    fn test_stream_usage_option_is_guarded_by_provider() {
        let openai = OpenAiCompatProvider::new("https://api.openai.com", "key", "openai");
        let openrouter =
            OpenAiCompatProvider::new("https://openrouter.ai/api", "key", "openrouter");
        let google =
            OpenAiCompatProvider::new("https://generativelanguage.googleapis.com", "key", "google");
        let custom = OpenAiCompatProvider::new("https://example.test", "key", "custom");

        assert!(openai.should_request_stream_usage());
        assert!(openrouter.should_request_stream_usage());
        assert!(!google.should_request_stream_usage());
        assert!(!custom.should_request_stream_usage());
    }

    #[tokio::test]
    async fn test_openrouter_sends_top_level_reasoning_object() -> ZenResult<()> {
        let server = MockServer::start().await;
        let provider = OpenAiCompatProvider::new(&server.uri(), "test-key", "openrouter");

        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(
                "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\ndata: [DONE]\n\n",
                "text/event-stream",
            ))
            .mount(&server)
            .await;

        provider
            .chat_stream(
                "anthropic/claude-sonnet-4",
                vec![user_message("think")],
                None,
                crate::llm::ChatRequestConfig {
                    reasoning_effort: Some("high".to_string()),
                    thinking_budget: Some(4096),
                    ..crate::llm::ChatRequestConfig::default()
                },
                Box::new(|_| {}),
                tokio_util::sync::CancellationToken::new(),
            )
            .await?;

        let requests = server.received_requests().await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&requests[0].body)?;
        assert_eq!(body["reasoning"]["effort"], "high");
        assert_eq!(body["reasoning"]["max_tokens"], 4096);
        assert!(body.get("reasoning_effort").is_none());
        Ok(())
    }

    #[tokio::test]
    async fn test_gemini_sends_include_thoughts_extra_body() -> ZenResult<()> {
        let server = MockServer::start().await;
        let provider = OpenAiCompatProvider::new(&server.uri(), "test-key", "google");

        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(
                "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\ndata: [DONE]\n\n",
                "text/event-stream",
            ))
            .mount(&server)
            .await;

        provider
            .chat_stream(
                "gemini-2.5-pro",
                vec![user_message("think")],
                None,
                crate::llm::ChatRequestConfig {
                    thinking_budget: Some(2048),
                    ..crate::llm::ChatRequestConfig::default()
                },
                Box::new(|_| {}),
                tokio_util::sync::CancellationToken::new(),
            )
            .await?;

        let requests = server.received_requests().await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&requests[0].body)?;
        assert_eq!(
            body["extra_body"]["google"]["thinking_config"]["include_thoughts"],
            true
        );
        assert_eq!(
            body["extra_body"]["google"]["thinking_config"]["thinking_budget"],
            2048
        );
        Ok(())
    }

    #[tokio::test]
    async fn test_openai_compat_streams_reasoning_fields_as_thoughts() -> ZenResult<()> {
        let (provider, server) = mock_provider().await;
        let sse = concat!(
            "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"deepseek \",\"content\":\"\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"reasoning\":\"generic \",\"content\":\"\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"thinking\":\"gemini \",\"content\":\"\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_1\",\"type\":\"function\",\"function\":{\"name\":\"lookup\",\"arguments\":\"{\\\"q\\\":\"}}]}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"\\\"zen\\\"}\"}}]}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"answer\"}}],\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":5}}\n\n",
            "data: [DONE]\n\n",
        );

        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(sse, "text/event-stream"))
            .mount(&server)
            .await;

        let chunks = Arc::new(Mutex::new(Vec::new()));
        let chunks_for_callback = chunks.clone();
        let response = provider
            .chat_stream(
                "reasoning-model",
                vec![user_message("think")],
                None,
                crate::llm::ChatRequestConfig::default(),
                Box::new(move |chunk| {
                    chunks_for_callback.lock().unwrap().push(chunk);
                }),
                tokio_util::sync::CancellationToken::new(),
            )
            .await?;

        assert_eq!(response.content, "answer");
        assert_eq!(response.tokens_in, Some(3));
        assert_eq!(response.tokens_out, Some(5));
        let reasoning_details = response
            .reasoning_details
            .as_ref()
            .expect("reasoning details should be preserved");
        assert_eq!(reasoning_details.len(), 3);
        assert_eq!(reasoning_details[0].block_type, "reasoning_content");
        assert_eq!(reasoning_details[0].text.as_deref(), Some("deepseek "));
        let tool_calls = response.tool_calls.expect("tool call should be preserved");
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].id, "call_1");
        assert_eq!(tool_calls[0].name, "lookup");
        assert_eq!(tool_calls[0].args, serde_json::json!({"q": "zen"}));

        let chunks = chunks.lock().unwrap();
        assert_eq!(
            chunks
                .iter()
                .filter_map(|chunk| match chunk {
                    LlmChunk::Thought(text) => Some(text.as_str()),
                    LlmChunk::Text(_) => None,
                    LlmChunk::ToolCallDelta { .. } => None,
                    LlmChunk::ToolCallReady { .. } => None,
                })
                .collect::<Vec<_>>(),
            vec!["deepseek ", "generic ", "gemini "]
        );
        assert!(matches!(chunks.last(), Some(LlmChunk::Text(text)) if text == "answer"));
        Ok(())
    }

    #[tokio::test]
    async fn test_openai_compat_streams_final_message_reasoning() -> ZenResult<()> {
        let (provider, server) = mock_provider().await;
        let sse = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"answer\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{},\"message\":{\"reasoning_content\":\"final reasoning\"}}]}\n\n",
            "data: [DONE]\n\n",
        );

        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(sse, "text/event-stream"))
            .mount(&server)
            .await;

        let chunks = Arc::new(Mutex::new(Vec::new()));
        let chunks_for_callback = chunks.clone();
        let response = provider
            .chat_stream(
                "reasoning-model",
                vec![user_message("think")],
                None,
                crate::llm::ChatRequestConfig::default(),
                Box::new(move |chunk| {
                    chunks_for_callback.lock().unwrap().push(chunk);
                }),
                tokio_util::sync::CancellationToken::new(),
            )
            .await?;

        assert_eq!(response.content, "answer");
        assert_eq!(
            response
                .reasoning_details
                .as_ref()
                .and_then(|blocks| blocks.first())
                .and_then(|block| block.text.as_deref()),
            Some("final reasoning")
        );
        let chunks = chunks.lock().unwrap();
        assert!(chunks
            .iter()
            .any(|chunk| matches!(chunk, LlmChunk::Thought(text) if text == "final reasoning")));
        Ok(())
    }
}
