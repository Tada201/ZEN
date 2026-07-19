use async_trait::async_trait;
use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::db::models::{ChatMessage, ChatResponse, ModelInfo};
use crate::error::{ZenError, ZenResult};
use crate::llm::LlmProvider;

/// Ollama HTTP API client.
pub struct OllamaProvider {
    client: Client,
    base_url: String,
}

// ─── Ollama API types ───

#[derive(Serialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<OllamaMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<serde_json::Value>>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    think: Option<OllamaThink>,
    #[serde(skip_serializing_if = "Option::is_none")]
    options: Option<OllamaOptions>,
}

#[derive(Serialize)]
#[serde(untagged)]
enum OllamaThink {
    Bool(bool),
    Level(String),
}

#[derive(Serialize)]
struct OllamaOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    num_predict: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_k: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    repeat_penalty: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    seed: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stop: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize)]
struct OllamaMessage {
    role: String,
    #[serde(default)]
    content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    thinking: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    images: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<OllamaToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct OllamaToolCall {
    #[serde(rename = "function")]
    pub function: OllamaFunctionCall,
}

#[derive(Serialize, Deserialize)]
struct OllamaFunctionCall {
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Deserialize)]
struct OllamaChatChunk {
    message: Option<OllamaMessage>,
    done: bool,
    #[serde(default)]
    prompt_eval_count: Option<i64>,
    #[serde(default)]
    eval_count: Option<i64>,
}

fn ollama_think_from_config(config: &crate::llm::ChatRequestConfig) -> Option<OllamaThink> {
    if let Some(effort) = config.reasoning_effort.as_deref() {
        let effort = effort.to_lowercase();
        if matches!(effort.as_str(), "low" | "medium" | "high") {
            return Some(OllamaThink::Level(effort));
        }

        return Some(OllamaThink::Bool(true));
    }

    config.thinking_budget.map(|_| OllamaThink::Bool(true))
}

#[derive(Deserialize)]
struct OllamaModelsResponse {
    models: Vec<OllamaModelEntry>,
}

#[derive(Deserialize)]
struct OllamaModelEntry {
    name: String,
    size: Option<u64>,
    modified_at: Option<String>,
}

#[derive(Serialize)]
struct OllamaShowRequest<'a> {
    model: &'a str,
}

/// Partial `/api/show` response. `/api/tags` never reports a context window,
/// but `/api/show` exposes it under `model_info` as an arch-prefixed key
/// (e.g. `llama.context_length`, `qwen2.context_length`). We only need that
/// map plus `capabilities` (to skip embedding-only models).
#[derive(Deserialize)]
struct OllamaShowResponse {
    #[serde(default)]
    model_info: std::collections::HashMap<String, serde_json::Value>,
    #[serde(default)]
    capabilities: Vec<String>,
}

/// Extract the context window from a parsed `/api/show` body.
///
/// Arch-agnostic: scans `model_info` for the first key ending in
/// `.context_length` rather than hardcoding an architecture prefix, so new
/// model families work without code changes. Embedding-only models (no chat
/// window) return `None`. Any missing/non-numeric/zero value also yields
/// `None` so callers fall back to Zen's compaction cap rather than a guess.
fn context_length_from_show(show: &OllamaShowResponse) -> Option<u64> {
    if show.capabilities.iter().any(|c| c == "embedding") {
        return None;
    }
    show.model_info
        .iter()
        .find(|(key, _)| key.ends_with(".context_length"))
        .and_then(|(_, value)| value.as_u64())
        .filter(|&n| n > 0)
}

#[derive(Serialize)]
struct OllamaEmbedRequest {
    model: String,
    input: String,
}

#[derive(Serialize)]
struct OllamaEmbedBatchRequest {
    model: String,
    input: Vec<String>,
}

#[derive(Deserialize)]
struct OllamaEmbedResponse {
    embeddings: Vec<Vec<f32>>,
}

impl OllamaProvider {
    pub fn new(base_url: &str) -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .connect_timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("Failed to build Ollama HTTP client"),
            base_url: base_url.trim_end_matches('/').to_string(),
        }
    }

    /// Query `/api/show` for one model and return its detected context window.
    ///
    /// Best-effort: any failure (network, non-200, missing key, embedding-only
    /// model) resolves to `None` so the caller falls back to Zen's compaction
    /// cap. Mirrors `list_models`' `localhost`→`127.0.0.1` retry.
    async fn fetch_context_length(&self, model: &str) -> Option<u64> {
        let body = OllamaShowRequest { model };
        let url = format!("{}/api/show", self.base_url);
        let resp = match self.client.post(&url).json(&body).send().await {
            Ok(resp) => resp,
            Err(_) if self.base_url.contains("localhost") => {
                let alt_base = self.base_url.replace("localhost", "127.0.0.1");
                let alt_url = format!("{}/api/show", alt_base);
                self.client.post(&alt_url).json(&body).send().await.ok()?
            }
            Err(_) => return None,
        };
        if !resp.status().is_success() {
            return None;
        }
        let show: OllamaShowResponse = resp.json().await.ok()?;
        context_length_from_show(&show)
    }
}

#[async_trait]
impl LlmProvider for OllamaProvider {
    async fn list_models(&self) -> ZenResult<Vec<ModelInfo>> {
        let url = format!("{}/api/tags", self.base_url);
        let resp = match self.client.get(&url).send().await {
            Ok(resp) => resp,
            Err(e) if self.base_url.contains("localhost") => {
                let alt_base = self.base_url.replace("localhost", "127.0.0.1");
                let alt_url = format!("{}/api/tags", alt_base);
                debug!(url = %alt_url, "Trying 127.0.0.1 fallback for Ollama model listing");
                match self.client.get(&alt_url).send().await {
                    Ok(resp) => resp,
                    Err(_) => return Err(e.into()), // Return original error if fallback also fails
                }
            }
            Err(e) => return Err(e.into()),
        };

        if !resp.status().is_success() {
            warn!(status = %resp.status(), "Failed to list Ollama models");
            return Err(ZenError::OllamaNotConnected);
        }

        let body: OllamaModelsResponse = resp.json().await?;

        // `/api/tags` carries no context window, so probe `/api/show` for each
        // model to read its real `<arch>.context_length`. Run concurrently so N
        // models cost one round-trip's worth of latency, not N. Failures resolve
        // to `None` (fall back to Zen's compaction cap) rather than a guess.
        let context_lengths = futures::future::join_all(
            body.models
                .iter()
                .map(|m| self.fetch_context_length(&m.name)),
        )
        .await;

        let models = body
            .models
            .into_iter()
            .zip(context_lengths)
            .map(|(m, max_context_length)| ModelInfo {
                id: m.name.clone(),
                name: m.name,
                size: m.size,
                modified_at: m.modified_at,
                display_name: None,
                description: None,
                provider: Some("ollama".to_string()),
                model_type: None,
                arch: None,
                quantization: None,
                max_context_length,
                state: None,
                supports_vision: None,
                supports_tools: None,
                supports_reasoning: None,
                reasoning_config_type: None,
            })
            .collect();

        Ok(models)
    }

    async fn chat_stream(
        &self,
        model: &str,
        messages: Vec<ChatMessage>,
        tools: Option<Vec<crate::tools::ToolInfo>>,
        config: crate::llm::ChatRequestConfig,
        on_chunk: Box<dyn Fn(crate::llm::LlmChunk) + Send>,
        token: tokio_util::sync::CancellationToken,
    ) -> ZenResult<ChatResponse> {
        let url = format!("{}/api/chat", self.base_url);

        let ollama_messages: Vec<OllamaMessage> = messages
            .into_iter()
            .map(|m| {
                let thinking = m.reasoning_details.as_ref().and_then(|blocks| {
                    let text = blocks
                        .iter()
                        .filter_map(|block| block.text.as_deref())
                        .collect::<String>();
                    (!text.is_empty()).then_some(text)
                });

                OllamaMessage {
                    role: m.role,
                    content: m.content,
                    thinking,
                    images: m.images.map(|imgs| {
                        imgs.into_iter()
                            .map(|url| {
                                // Ollama expects raw base64, so strip data URL prefix if present
                                if let Some(comma_pos) = url.find(',') {
                                    url[comma_pos + 1..].to_string()
                                } else {
                                    url
                                }
                            })
                            .collect()
                    }),
                    tool_calls: m.tool_calls.map(|tcs| {
                        tcs.into_iter()
                            .map(|tc| OllamaToolCall {
                                function: OllamaFunctionCall {
                                    name: tc.name,
                                    arguments: tc.args,
                                },
                            })
                            .collect()
                    }),
                    tool_call_id: m.tool_call_id,
                }
            })
            .collect();

        let ollama_tools = tools.map(|ts| {
            ts.into_iter()
                .map(|t| {
                    json!({
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

        let request = OllamaChatRequest {
            model: model.to_string(),
            messages: ollama_messages,
            tools: ollama_tools,
            stream: true,
            think: ollama_think_from_config(&config),
            options: Some(OllamaOptions {
                temperature: config.temperature,
                num_predict: config.max_tokens,
                top_p: config.top_p,
                top_k: config.top_k,
                repeat_penalty: config.repeat_penalty,
                seed: config.seed,
                stop: config.stop,
            }),
        };

        info!(model = model, "Starting Ollama chat stream");

        let resp = self.client.post(&url).json(&request).send().await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "Ollama chat request failed");
            return Err(ZenError::Custom(format!(
                "Ollama returned {}: {}",
                status, body
            )));
        }

        let mut full_content = String::new();
        let mut tool_calls: Vec<crate::db::models::ToolCall> = Vec::new();
        let mut reasoning_details: Vec<crate::db::models::ReasoningBlock> = Vec::new();
        let mut tokens_in: Option<i64> = None;
        let mut tokens_out: Option<i64> = None;
        let mut stream = resp.bytes_stream();

        // Buffer for incomplete JSON lines
        let mut buffer = String::new();

        while let Some(chunk_result) = tokio::select! {
            res = stream.next() => res,
            _ = token.cancelled() => {
                debug!("Ollama stream cancelled by client via select!");
                None
            }
        } {
            if token.is_cancelled() {
                debug!("Ollama stream cancelled by client");
                break;
            }
            let bytes = chunk_result?;
            buffer.push_str(&String::from_utf8_lossy(&bytes));

            // Process complete lines
            while let Some(newline_pos) = buffer.find('\n') {
                let line = buffer[..newline_pos].trim().to_string();
                buffer = buffer[newline_pos + 1..].to_string();

                if line.is_empty() {
                    continue;
                }

                match serde_json::from_str::<OllamaChatChunk>(&line) {
                    Ok(chunk) => {
                        if let Some(msg) = &chunk.message {
                            if let Some(thinking) = &msg.thinking {
                                if !thinking.is_empty() {
                                    on_chunk(crate::llm::LlmChunk::Thought(thinking.clone()));
                                    reasoning_details.push(crate::db::models::ReasoningBlock {
                                        provider: "ollama".to_string(),
                                        block_type: "thinking".to_string(),
                                        text: Some(thinking.clone()),
                                        raw: None,
                                    });
                                }
                            }
                            if !msg.content.is_empty() {
                                on_chunk(crate::llm::LlmChunk::Text(msg.content.clone()));
                                full_content.push_str(&msg.content);
                            }
                            if let Some(tc_list) = &msg.tool_calls {
                                for tc in tc_list {
                                    tool_calls.push(crate::db::models::ToolCall {
                                        id: format!("call_{}", Uuid::new_v4()),
                                        name: tc.function.name.clone(),
                                        args: tc.function.arguments.clone(),
                                    });
                                }
                            }
                        }
                        if chunk.done {
                            tokens_in = chunk.prompt_eval_count;
                            tokens_out = chunk.eval_count;
                            debug!(
                                tokens_in = ?tokens_in,
                                tokens_out = ?tokens_out,
                                "Stream complete"
                            );
                        }
                    }
                    Err(e) => {
                        debug!(line = %line, error = %e, "Failed to parse chunk");
                    }
                }
            }
        }

        Ok(ChatResponse {
            content: full_content,
            model: model.to_string(),
            reasoning_details: if reasoning_details.is_empty() {
                None
            } else {
                Some(reasoning_details)
            },
            tool_calls: if tool_calls.is_empty() {
                None
            } else {
                Some(tool_calls)
            },
            tokens_in,
            tokens_out,
            done: true,
        })
    }

    async fn embed(&self, model: &str, text: &str) -> ZenResult<Vec<f32>> {
        let url = format!("{}/api/embed", self.base_url);
        let request = OllamaEmbedRequest {
            model: model.to_string(),
            input: text.to_string(),
        };

        let resp = self.client.post(&url).json(&request).send().await?;

        if !resp.status().is_success() {
            return Err(ZenError::Custom("Embedding request failed".into()));
        }

        let body: OllamaEmbedResponse = resp.json().await?;
        body.embeddings
            .into_iter()
            .next()
            .ok_or_else(|| ZenError::Custom("No embedding returned".into()))
    }

    async fn embed_batch(
        &self,
        model: &str,
        texts: &[&str],
    ) -> crate::error::ZenResult<Vec<Vec<f32>>> {
        if texts.is_empty() {
            return Ok(vec![]);
        }
        let url = format!("{}/api/embed", self.base_url);
        let request = OllamaEmbedBatchRequest {
            model: model.to_string(),
            input: texts.iter().map(|t| t.to_string()).collect(),
        };
        let resp = self.client.post(&url).json(&request).send().await?;
        if !resp.status().is_success() {
            return Err(ZenError::Custom("Batch embedding request failed".into()));
        }
        let body: OllamaEmbedResponse = resp.json().await?;
        if body.embeddings.len() != texts.len() {
            return Err(ZenError::Custom(format!(
                "Expected {} embeddings, got {}",
                texts.len(),
                body.embeddings.len()
            )));
        }
        Ok(body.embeddings)
    }

    async fn health_check(&self) -> bool {
        let url = format!("{}/api/tags", self.base_url);
        match self.client.get(&url).send().await {
            Ok(resp) => resp.status().is_success(),
            Err(_) if self.base_url.contains("localhost") => {
                let alt_base = self.base_url.replace("localhost", "127.0.0.1");
                let alt_url = format!("{}/api/tags", alt_base);
                debug!(url = %alt_url, "Trying 127.0.0.1 fallback for Ollama health check");
                match self.client.get(&alt_url).send().await {
                    Ok(resp) => resp.status().is_success(),
                    Err(_) => false,
                }
            }
            Err(_) => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::{
        matchers::{method, path},
        Mock, MockServer, ResponseTemplate,
    };

    /// Helper to create an OllamaProvider pointed at a mock server.
    async fn mock_provider() -> (OllamaProvider, MockServer) {
        let server = MockServer::start().await;
        let provider = OllamaProvider::new(&server.uri());
        (provider, server)
    }

    const OLLAMA_TAGS_JSON: &str = r#"{
        "models": [
            {"name": "llama3.3:70b", "size": 40443546592, "modified_at": "2025-01-15T10:30:00Z"},
            {"name": "mistral:7b", "size": 4102557331, "modified_at": "2025-02-01T08:00:00Z"},
            {"name": "nomic-embed-text:v1.5", "size": 273857231, "modified_at": "2025-01-20T12:00:00Z"},
            {"name": "llama3.2-vision:11b", "size": 6953775847, "modified_at": null}
        ]
    }"#;

    #[tokio::test]
    async fn test_ollama_list_models_parses_all_fields() {
        let (provider, server) = mock_provider().await;

        Mock::given(method("GET"))
            .and(path("/api/tags"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_raw(OLLAMA_TAGS_JSON.as_bytes().to_vec(), "application/json"),
            )
            .mount(&server)
            .await;

        let models = provider.list_models().await.unwrap();

        assert_eq!(models.len(), 4);

        // First model: llama3.3:70b
        assert_eq!(models[0].id, "llama3.3:70b");
        assert_eq!(models[0].name, "llama3.3:70b");
        assert_eq!(models[0].size, Some(40443546592));
        assert_eq!(
            models[0].modified_at.as_deref(),
            Some("2025-01-15T10:30:00Z")
        );
        assert_eq!(models[0].provider.as_deref(), Some("ollama"));
        assert!(models[0].supports_vision.is_none());
        assert!(models[0].supports_tools.is_none());

        // Last model: llama3.2-vision:11b with null modified_at
        assert_eq!(models[3].id, "llama3.2-vision:11b");
        assert_eq!(models[3].size, Some(6953775847));
        assert!(models[3].modified_at.is_none());
    }

    #[test]
    fn context_length_from_show_reads_arch_agnostic_key() {
        // Key prefix varies by arch; extractor matches any `*.context_length`.
        let show: OllamaShowResponse = serde_json::from_str(
            r#"{"model_info":{"qwen2.context_length":32768,"qwen2.embedding_length":3584},"capabilities":["completion","tools"]}"#,
        )
        .unwrap();
        assert_eq!(context_length_from_show(&show), Some(32768));
    }

    #[test]
    fn context_length_from_show_skips_embedding_models() {
        let show: OllamaShowResponse = serde_json::from_str(
            r#"{"model_info":{"bert.context_length":512},"capabilities":["embedding"]}"#,
        )
        .unwrap();
        assert_eq!(context_length_from_show(&show), None);
    }

    #[test]
    fn context_length_from_show_none_when_missing_or_zero() {
        let missing: OllamaShowResponse =
            serde_json::from_str(r#"{"model_info":{},"capabilities":[]}"#).unwrap();
        assert_eq!(context_length_from_show(&missing), None);

        let zero: OllamaShowResponse = serde_json::from_str(
            r#"{"model_info":{"llama.context_length":0},"capabilities":[]}"#,
        )
        .unwrap();
        assert_eq!(context_length_from_show(&zero), None);
    }

    #[tokio::test]
    async fn test_ollama_list_models_detects_context_window_via_show() {
        let (provider, server) = mock_provider().await;

        Mock::given(method("GET"))
            .and(path("/api/tags"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "models": [{"name": "llama3.1:8b", "size": 1, "modified_at": "2025-01-15T10:30:00Z"}]
            })))
            .mount(&server)
            .await;

        Mock::given(method("POST"))
            .and(path("/api/show"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "model_info": {"llama.context_length": 131072},
                "capabilities": ["completion", "tools"]
            })))
            .mount(&server)
            .await;

        let models = provider.list_models().await.unwrap();
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].max_context_length, Some(131072));
    }

    #[tokio::test]
    async fn test_ollama_list_models_none_window_when_show_fails() {
        let (provider, server) = mock_provider().await;

        Mock::given(method("GET"))
            .and(path("/api/tags"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "models": [{"name": "mystery:latest", "size": 1, "modified_at": null}]
            })))
            .mount(&server)
            .await;

        // No `/api/show` mount → 404 → detection falls back to None (not a guess).
        let models = provider.list_models().await.unwrap();
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].max_context_length, None);
    }

    #[tokio::test]
    async fn test_ollama_list_models_empty_response() {
        let (provider, server) = mock_provider().await;

        Mock::given(method("GET"))
            .and(path("/api/tags"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({"models": []})),
            )
            .mount(&server)
            .await;

        let models = provider.list_models().await.unwrap();
        assert!(models.is_empty());
    }

    #[tokio::test]
    async fn test_ollama_list_models_returns_error_on_non_success() {
        let (provider, server) = mock_provider().await;

        Mock::given(method("GET"))
            .and(path("/api/tags"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&server)
            .await;

        let result = provider.list_models().await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_ollama_list_models_returns_error_on_connection_refused() {
        // Point at a port where nothing is listening
        let provider = OllamaProvider::new("http://127.0.0.1:1");
        let result = provider.list_models().await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_ollama_list_models_missing_models_field() {
        let (provider, server) = mock_provider().await;

        Mock::given(method("GET"))
            .and(path("/api/tags"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
            .mount(&server)
            .await;

        // Missing "models" field — should fail deserialization
        let result = provider.list_models().await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_ollama_health_check_ok() {
        let (provider, server) = mock_provider().await;

        Mock::given(method("GET"))
            .and(path("/api/tags"))
            .respond_with(ResponseTemplate::new(200))
            .mount(&server)
            .await;

        assert!(provider.health_check().await);
    }

    #[tokio::test]
    async fn test_ollama_health_check_fails() {
        let (provider, server) = mock_provider().await;

        Mock::given(method("GET"))
            .and(path("/api/tags"))
            .respond_with(ResponseTemplate::new(503))
            .mount(&server)
            .await;

        assert!(!provider.health_check().await);
    }

    #[test]
    fn test_ollama_request_uses_top_level_think_bool() {
        let config = crate::llm::ChatRequestConfig {
            thinking_budget: Some(1024),
            ..Default::default()
        };
        let request = OllamaChatRequest {
            model: "qwen3".to_string(),
            messages: vec![OllamaMessage {
                role: "user".to_string(),
                content: "think".to_string(),
                thinking: None,
                images: None,
                tool_calls: None,
                tool_call_id: None,
            }],
            tools: None,
            stream: true,
            think: ollama_think_from_config(&config),
            options: Some(OllamaOptions {
                temperature: None,
                num_predict: None,
                top_p: None,
                top_k: None,
                repeat_penalty: None,
                seed: None,
                stop: None,
            }),
        };

        let body = serde_json::to_value(request).unwrap();
        assert_eq!(body["think"], serde_json::json!(true));
        assert!(body["options"].get("reasoning_effort").is_none());
        assert!(body["options"].get("thinking_budget").is_none());
    }

    #[test]
    fn test_ollama_request_maps_supported_think_level() {
        let config = crate::llm::ChatRequestConfig {
            reasoning_effort: Some("high".to_string()),
            ..Default::default()
        };

        assert_eq!(
            serde_json::to_value(ollama_think_from_config(&config)).unwrap(),
            serde_json::json!("high")
        );
    }

    #[test]
    fn test_ollama_chunk_parses_message_thinking() {
        let chunk: OllamaChatChunk = serde_json::from_str(
            r#"{"message":{"role":"assistant","thinking":"working","content":"answer"},"done":false}"#,
        )
        .unwrap();

        let message = chunk.message.unwrap();
        assert_eq!(message.thinking.as_deref(), Some("working"));
        assert_eq!(message.content, "answer");
    }
}
