use async_trait::async_trait;
use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;
use tracing::{debug, error, info, warn};

use crate::db::models::{ChatMessage, ChatResponse, ModelInfo};
use crate::error::{ZenError, ZenResult};
use crate::llm::LlmProvider;

#[cfg(test)]
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{method, path},
};

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
    options: Option<OllamaOptions>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    reasoning_effort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking_budget: Option<i64>,
}

#[derive(Serialize, Deserialize)]
struct OllamaMessage {
    role: String,
    content: String,
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
        let models = body
            .models
            .into_iter()
            .map(|m| ModelInfo {
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
                max_context_length: None,
                state: None,
                supports_vision: None,
                supports_tools: None,
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
            .map(|m| OllamaMessage {
                role: m.role,
                content: m.content,
                images: m.images.map(|imgs| {
                    imgs.into_iter()
                        .filter_map(|url| {
                            // Ollama expects raw base64, so strip data URL prefix if present
                            if let Some(comma_pos) = url.find(',') {
                                Some(url[comma_pos + 1..].to_string())
                            } else {
                                Some(url)
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
            options: Some(OllamaOptions {
                temperature: config.temperature,
                num_predict: config.max_tokens,
                top_p: config.top_p,
                top_k: config.top_k,
                repeat_penalty: config.repeat_penalty,
                seed: config.seed,
                stop: config.stop,
                reasoning_effort: config.reasoning_effort,
                thinking_budget: config.thinking_budget,
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
            tool_calls: if tool_calls.is_empty() { None } else { Some(tool_calls) },
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

    async fn embed_batch(&self, model: &str, texts: &[&str]) -> crate::error::ZenResult<Vec<Vec<f32>>> {
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
    use wiremock::{Mock, MockServer, ResponseTemplate, matchers::{method, path}};

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
            .respond_with(ResponseTemplate::new(200).set_body_raw(
                OLLAMA_TAGS_JSON.as_bytes().to_vec(),
                "application/json",
            ))
            .mount(&server)
            .await;

        let models = provider.list_models().await.unwrap();

        assert_eq!(models.len(), 4);

        // First model: llama3.3:70b
        assert_eq!(models[0].id, "llama3.3:70b");
        assert_eq!(models[0].name, "llama3.3:70b");
        assert_eq!(models[0].size, Some(40443546592));
        assert_eq!(models[0].modified_at.as_deref(), Some("2025-01-15T10:30:00Z"));
        assert_eq!(models[0].provider.as_deref(), Some("ollama"));
        assert!(models[0].supports_vision.is_none());
        assert!(models[0].supports_tools.is_none());

        // Last model: llama3.2-vision:11b with null modified_at
        assert_eq!(models[3].id, "llama3.2-vision:11b");
        assert_eq!(models[3].size, Some(6953775847));
        assert!(models[3].modified_at.is_none());
    }

    #[tokio::test]
    async fn test_ollama_list_models_empty_response() {
        let (provider, server) = mock_provider().await;

        Mock::given(method("GET"))
            .and(path("/api/tags"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"models": []})))
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
}
