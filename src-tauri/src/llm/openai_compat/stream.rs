use crate::db::models::{ChatMessage, ChatResponse};
use crate::error::{ZenError, ZenResult};
use crate::llm::openai_compat::types::*;
use crate::llm::openai_compat::OpenAiCompatProvider;
use futures::StreamExt;
use std::collections::HashMap;
use std::sync::RwLock;
use tracing::{debug, error, info};

impl OpenAiCompatProvider {
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

        let oai_messages: Vec<OpenAiMessage> = messages
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

                OpenAiMessage {
                    role: m.role,
                    content: oauth_content,
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

        let response_format = config.json_schema.map(|s| {
            serde_json::json!({
                "type": "json_schema",
                "json_schema": {
                    "name": "response_schema",
                    "strict": true,
                    "schema": s
                }
            })
        });

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
            stop: config.stop,
            tools: oai_tools,
            response_format,
            reasoning_effort: config.reasoning_effort,
        };

        info!(
            provider = %self.provider_name,
            model = model,
            "Starting chat stream"
        );

        let resp = self
            .send_with_retry(
                self.auth_post(&url)
                    .json(&request)
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
                            if let Some(content) = &choice.delta.content {
                                if !content.is_empty() {
                                    on_chunk(crate::llm::LlmChunk::Text(content.clone()));
                                    full_content.push_str(content);
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
            | "kilocode" | "nine_router" | "nine-router" | "n9router" | "9router" | "aihubmix"
            | "nvidia" => true,

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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::LlmProvider;
    use wiremock::{
        matchers::{method, path},
        Mock, MockServer, ResponseTemplate,
    };

    async fn mock_provider() -> (OpenAiCompatProvider, MockServer) {
        let server = MockServer::start().await;
        let provider = OpenAiCompatProvider::new(&server.uri(), "test-key-123", "openai");
        (provider, server)
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
}
