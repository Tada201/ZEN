pub mod context_window_discovery;
pub mod models;
pub mod stream;
#[cfg(test)]
pub mod tests;
pub mod types;

pub use types::*;

use async_trait::async_trait;
use reqwest::Client;
use std::collections::HashMap;
use std::sync::RwLock;
use tracing::warn;

use crate::db::models::{ChatMessage, ChatResponse, ModelInfo};
use crate::error::{ZenError, ZenResult};
use crate::llm::LlmProvider;

/// Cached model capabilities populated during `list_models()`.
#[derive(Clone, Debug)]
pub struct ModelCapabilities {
    pub supports_tools: bool,
    pub reasoning: crate::llm::ReasoningCapability,
}

/// OpenAI-compatible API provider.
/// Works with: OpenAI, OpenRouter, Groq, Together AI, Mistral, LM Studio,
/// or any server implementing the `/v1/chat/completions` endpoint.
pub struct OpenAiCompatProvider {
    client: Client,
    base_url: RwLock<String>,
    api_key: String,
    provider_name: String,
    extra_headers: Vec<(String, String)>,
    /// Model capability cache populated by `list_models()`.
    model_capabilities: RwLock<HashMap<String, ModelCapabilities>>,
}

// ─── OpenAI API types ───

impl OpenAiCompatProvider {
    pub fn new(base_url: &str, api_key: &str, provider_name: &str) -> Self {
        Self::with_headers(base_url, api_key, provider_name, vec![])
    }

    /// Create a provider with additional custom headers applied to every request.
    /// Used for providers like OpenRouter that require HTTP-Referer and X-Title.
    pub fn with_headers(
        base_url: &str,
        api_key: &str,
        provider_name: &str,
        extra_headers: Vec<(String, String)>,
    ) -> Self {
        Self {
            client: Client::builder()
                .connect_timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("Failed to build OpenAI-Compat HTTP client"),
            base_url: RwLock::new(base_url.trim_end_matches('/').to_string()),
            api_key: api_key.to_string(),
            provider_name: provider_name.to_string(),
            extra_headers,
            model_capabilities: RwLock::new(HashMap::new()),
        }
    }

    /// Helper to update the base url if a fallback was successful
    fn update_base_url(&self, old_url: &str, new_url: &str) {
        if let Ok(mut base) = self.base_url.write() {
            if *base == old_url {
                *base = new_url.to_string();
            }
        }
    }

    /// Check if this is Groq provider (needs special rate limit handling)
    fn is_groq(&self) -> bool {
        let base = self.base_url.read().unwrap().clone();
        self.provider_name.to_lowercase().contains("groq") || base.contains("groq.com")
    }

    /// Build the full URL for an API endpoint.
    /// Skips prepending `/v1` if the base URL already ends with `/v1`
    /// (e.g. Gemini's OpenAI-compat proxy) or contains `/gateway`
    /// (e.g. Kilo Gateway's `https://api.kilo.ai/api/gateway`).
    /// Perplexity uses bare endpoints without a `/v1` prefix.
    fn url(&self, path: &str) -> String {
        let base_locked = self.base_url.read().unwrap();
        let base = base_locked.trim_end_matches('/');
        if self.provider_name.to_lowercase() == "mimo"
            || self.provider_name.to_lowercase() == "mimo-free"
        {
            if path == "/chat/completions" {
                return base.to_string(); // The base URL itself IS the chat endpoint
            }
            return format!("{}{}", base, path);
        }
        if base.ends_with("/v1") || base.contains("/gateway") || base.contains("perplexity") {
            format!("{}{}", base, path)
        } else {
            format!("{}/v1{}", base, path)
        }
    }

    /// Create an authorized request builder with extra headers.
    fn auth_get(&self, url: &str) -> reqwest::RequestBuilder {
        let mut req = self.client.get(url);
        if !self.api_key.is_empty() {
            req = req.bearer_auth(&self.api_key);
        }
        for (key, value) in &self.extra_headers {
            req = req.header(key, value);
        }
        req
    }

    fn auth_post(&self, url: &str) -> reqwest::RequestBuilder {
        let mut req = self.client.post(url);
        if !self.api_key.is_empty() {
            req = req.bearer_auth(&self.api_key);
        }
        for (key, value) in &self.extra_headers {
            req = req.header(key, value);
        }
        req
    }

    /// Send request with retry logic for rate limits (Groq-specific)
    async fn send_with_retry(&self, req: reqwest::RequestBuilder) -> ZenResult<reqwest::Response> {
        let mut attempts = 0;
        let is_groq = self.is_groq();
        let max_attempts = if is_groq { 4 } else { 3 };
        let mut last_error: Option<ZenError> = None;
        let mut current_req = Some(req);

        while attempts < max_attempts {
            let is_last_attempt = attempts == max_attempts - 1;

            // Try to get a request for this attempt
            let req_to_send = if !is_last_attempt {
                let current_ref = match current_req.as_ref() {
                    Some(r) => r,
                    None => break, // Should not happen but safety first
                };

                match current_ref.try_clone() {
                    Some(cloned) => cloned,
                    None => {
                        // Request has a non-cloneable body (e.g. a stream).
                        // We must consume the original and can't retry.
                        current_req.take().ok_or_else(|| {
                            ZenError::Custom("Request body not available for retry".to_string())
                        })?
                    }
                }
            } else {
                // Last attempt, consume the original
                match current_req.take() {
                    Some(r) => r,
                    None => break,
                }
            };

            let can_not_retry_anymore = current_req.is_none();

            match req_to_send.send().await {
                Ok(resp) => {
                    let status = resp.status();
                    if status == reqwest::StatusCode::TOO_MANY_REQUESTS && !can_not_retry_anymore {
                        let retry_after = resp
                            .headers()
                            .get("retry-after")
                            .and_then(|v| v.to_str().ok())
                            .and_then(|s| s.parse::<u64>().ok())
                            .unwrap_or(2);

                        warn!(
                            provider = %self.provider_name,
                            retry_after = retry_after,
                            attempt = attempts + 1,
                            "Rate limited (429), retrying..."
                        );

                        tokio::time::sleep(tokio::time::Duration::from_secs(retry_after)).await;
                        attempts += 1;
                        continue;
                    }
                    return Ok(resp);
                }
                Err(e) => {
                    let err_msg = e.to_string();
                    last_error = Some(crate::error::http_err(e));

                    if can_not_retry_anymore {
                        break;
                    }

                    warn!(
                        provider = %self.provider_name,
                        error = %err_msg,
                        attempt = attempts + 1,
                        "Request failed, retrying..."
                    );

                    attempts += 1;
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    continue;
                }
            }
        }

        Err(last_error
            .unwrap_or_else(|| ZenError::Custom("Request failed after all retries".to_string())))
    }
}

#[async_trait]
impl LlmProvider for OpenAiCompatProvider {
    async fn list_models(&self) -> ZenResult<Vec<ModelInfo>> {
        self.do_list_models().await
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
        self.do_chat_stream(model, messages, tools, config, on_chunk, token)
            .await
    }

    async fn embed(&self, model: &str, text: &str) -> ZenResult<Vec<f32>> {
        self.do_embed(model, text).await
    }

    async fn health_check(&self) -> bool {
        self.do_health_check().await
    }

    fn supports_tools(&self, model: &str) -> bool {
        self.do_supports_tools(model)
    }

    fn reasoning_capability(&self, model: &str) -> crate::llm::ReasoningCapability {
        self.do_reasoning_capability(model)
    }
}
