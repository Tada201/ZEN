use zen_core::{ChatMessage, ChatResponse, ReasoningBlock};
use zen_core::{ZenError, ZenResult};
use crate::openai_compat::types::*;
use crate::openai_compat::OpenAiCompatProvider;
use futures::StreamExt;
use lazy_static::lazy_static;
use serde_json::Value;
use std::collections::HashSet;
use tracing::{debug, error, info};

lazy_static! {
    static ref MIMO_CACHED_JWT: std::sync::RwLock<Option<(String, u64)>> =
        std::sync::RwLock::new(None);
}

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
            .and_then(|cache| cache.get(model).map(|caps| caps.reasoning.is_visible()))
            .unwrap_or(false)
    }

    /// Heuristic match for a provider error body that indicates the reasoning
    /// parameter we sent is not supported by this model/endpoint. Used only to
    /// downgrade cached capability confidence — never to retry.
    fn looks_like_unsupported_reasoning_error(body: &str) -> bool {
        let b = body.to_lowercase();
        let mentions_reasoning = b.contains("reasoning")
            || b.contains("thinking")
            || b.contains("budget_tokens")
            || b.contains("reasoning_effort")
            || b.contains("thinking_level");
        let mentions_rejection = b.contains("unsupported")
            || b.contains("not supported")
            || b.contains("unknown parameter")
            || b.contains("unrecognized")
            || b.contains("invalid parameter")
            || b.contains("does not support");
        mentions_reasoning && mentions_rejection
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
                | "nvidia"
        )
    }

    fn openrouter_reasoning_from_config(
        config: &crate::ChatRequestConfig,
    ) -> Option<serde_json::Value> {
        let r = config.resolved_reasoning.as_ref()?;
        if !r.enabled {
            return None;
        }
        let mut reasoning = serde_json::Map::new();
        if let Some(effort) = &r.effort {
            reasoning.insert("effort".to_string(), Value::String(effort.clone()));
        }
        if let Some(budget) = r.budget_tokens {
            reasoning.insert("max_tokens".to_string(), Value::Number(budget.into()));
        }
        if reasoning.is_empty() {
            return None;
        }
        Some(Value::Object(reasoning))
    }

    fn gemini_extra_body_from_config(
        config: &crate::ChatRequestConfig,
    ) -> Option<serde_json::Value> {
        use crate::reasoning::ReasoningProtocol;
        let r = config.resolved_reasoning.as_ref()?;
        if !r.enabled {
            return None;
        }

        let mut thinking_config = serde_json::Map::new();
        thinking_config.insert("include_thoughts".to_string(), Value::Bool(true));
        match r.capability.protocol {
            ReasoningProtocol::GeminiLevel => {
                if let Some(level) = &r.effort {
                    thinking_config
                        .insert("thinking_level".to_string(), Value::String(level.clone()));
                }
            }
            ReasoningProtocol::GeminiBudget => {
                if let Some(budget) = r.budget_tokens {
                    thinking_config
                        .insert("thinking_budget".to_string(), Value::Number(budget.into()));
                }
            }
            _ => {}
        }

        Some(serde_json::json!({
            "google": {
                "thinking_config": Value::Object(thinking_config)
            }
        }))
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

    async fn get_mimo_jwt(&self) -> ZenResult<String> {
        if let Ok(cache) = MIMO_CACHED_JWT.read() {
            if let Some((jwt, exp)) = &*cache {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();
                if now < *exp - 300 {
                    return Ok(jwt.clone());
                }
            }
        }

        let body = serde_json::json!({ "client": "mimocode-zen-client-hash" });
        let resp = self
            .client
            .post("https://api.xiaomimimo.com/api/free-ai/bootstrap")
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await.map_err(crate::util::http_err)?;

        if !resp.status().is_success() {
            return Err(ZenError::Custom(format!(
                "MiMo bootstrap failed: {}",
                resp.status()
            )));
        }

        let data: serde_json::Value = resp.json().await.map_err(crate::util::http_err)?;
        let jwt = data["jwt"]
            .as_str()
            .ok_or_else(|| ZenError::Custom("No JWT in response".into()))?
            .to_string();

        let mut exp_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            + 3000;
        let parts: Vec<&str> = jwt.split('.').collect();
        if parts.len() == 3 {
            use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
            if let Ok(decoded) = URL_SAFE_NO_PAD.decode(parts[1]) {
                if let Ok(payload) = serde_json::from_slice::<serde_json::Value>(&decoded) {
                    if let Some(exp) = payload["exp"].as_u64() {
                        exp_time = exp;
                    }
                }
            }
        }

        if let Ok(mut cache) = MIMO_CACHED_JWT.write() {
            *cache = Some((jwt.clone(), exp_time));
        }

        Ok(jwt)
    }

    pub async fn do_chat_stream(
        &self,
        model: &str,
        mut messages: Vec<ChatMessage>,
        tools: Option<Vec<zen_core::ToolInfo>>,
        config: crate::ChatRequestConfig,
        on_chunk: Box<dyn Fn(crate::LlmChunk) + Send>,
        token: tokio_util::sync::CancellationToken,
    ) -> ZenResult<ChatResponse> {
        // Inject MiMoCode signature for MiMo free API
        if self.provider_key() == "mimo" {
            let signature = "You are MiMoCode, an interactive CLI tool that helps users with software engineering tasks.";
            let has_signature = messages
                .iter()
                .any(|m| m.role == "system" && m.content.contains("You are MiMoCode"));
            if !has_signature {
                messages.insert(
                    0,
                    ChatMessage {
                        role: "system".to_string(),
                        content: signature.to_string(),
                        reasoning_details: None,
                        images: None,
                        tool_calls: None,
                        tool_call_id: None,
                    },
                );
            }
        }

        let url = self.url("/chat/completions");

        // Sanitize tool names to the provider charset (no ':' etc.) and keep a
        // per-request reverse map so streamed tool calls decode to canonical ids.
        let mut name_codec = crate::ToolNameCodec::default();

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
                                name: name_codec.encode(&tc.name),
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
                            "name": name_codec.encode(&t.name),
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
        // OpenAI-style top-level `reasoning_effort` comes from the resolved
        // request; OpenRouter/Gemini use their own encoders above.
        let resolved_effort = config
            .resolved_reasoning
            .as_ref()
            .filter(|r| r.enabled)
            .and_then(|r| r.effort.clone());
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
            reasoning_effort: if is_openrouter || is_gemini_compat || !allow_reasoning {
                None
            } else {
                resolved_effort
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

        let mut req_builder = self
            .auth_post(&url)
            .json(&request_body)
            .timeout(std::time::Duration::from_secs(600));

        if self.provider_key() == "mimo" || self.provider_key() == "mimo-free" {
            let jwt = self.get_mimo_jwt().await?;
            req_builder = req_builder
                .header("Authorization", format!("Bearer {jwt}"))
                .header("X-Mimo-Source", "mimocode-cli-free")
                .header("x-session-affinity", "ses_zen_session_001");
        }

        let resp = self.send_with_retry(req_builder).await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "Chat request failed");

            // If we sent a reasoning parameter and the provider rejected it as
            // unsupported, downgrade the cached capability to uncertain so the
            // UI stops offering it — but never silently retry with another shape.
            let sent_reasoning = config
                .resolved_reasoning
                .as_ref()
                .is_some_and(|r| r.enabled);
            if sent_reasoning && Self::looks_like_unsupported_reasoning_error(&body) {
                if let Ok(mut cache) = self.model_capabilities.write() {
                    if let Some(caps) = cache.get_mut(model) {
                        caps.reasoning.confidence =
                            crate::reasoning::ReasoningConfidence::Unknown;
                    }
                }
                return Err(ZenError::Custom(format!(
                    "{} rejected the reasoning setting for '{}' as unsupported. \
                     Reasoning has been marked unavailable for this model; retry without it. \
                     ({}: {})",
                    self.provider_name, model, status, body
                )));
            }

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
            let bytes = chunk_result.map_err(crate::util::http_err)?;
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
                                    on_chunk(crate::LlmChunk::Text(content.clone()));
                                    full_content.push_str(content);
                                }
                            }
                            if let Some(message) = &choice.message {
                                if let Some(content) = &message.content {
                                    if !content.is_empty() {
                                        on_chunk(crate::LlmChunk::Text(content.clone()));
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
                                    on_chunk(crate::LlmChunk::ToolCallDelta {
                                        index: idx,
                                        id: if acc.id.is_empty() {
                                            None
                                        } else {
                                            Some(acc.id.clone())
                                        },
                                        name: if acc.name.is_empty() {
                                            None
                                        } else {
                                            Some(name_codec.decode(&acc.name))
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
                                            // Pin a stable id before the early ToolCallReady
                                            // so it matches the finalized tool-call id; some
                                            // OpenAI-compatible providers omit streamed ids.
                                            if acc.id.is_empty() {
                                                acc.id = format!("call_{}", uuid::Uuid::new_v4());
                                            }
                                            on_chunk(crate::LlmChunk::ToolCallReady {
                                                index: idx,
                                                id: Some(acc.id.clone()),
                                                name: name_codec.decode(&acc.name),
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
                    tcs.push(zen_core::ToolCall {
                        id: if acc.id.is_empty() {
                            format!("call_{}", uuid::Uuid::new_v4())
                        } else {
                            acc.id
                        },
                        name: name_codec.decode(&acc.name),
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

}


#[derive(Default)]
pub struct ToolCallAccumulator {
    id: String,
    name: String,
    arguments: String,
    ready_emitted: bool,
}

#[path = "stream_tests.rs"]
#[cfg(test)]
mod tests;
