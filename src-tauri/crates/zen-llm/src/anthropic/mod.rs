mod chat;
mod mapping;
mod wire;

use wire::AnthropicImageSource;
use mapping::anthropic_reasoning_metadata;
use async_trait::async_trait;
use reqwest::Client;

use zen_core::{ChatMessage, ChatResponse, ModelInfo, ToolInfo, ZenError, ZenResult};
use crate::{ChatRequestConfig, LlmChunk};
use crate::LlmProvider;
use tokio_util::sync::CancellationToken;

/// Anthropic Messages API provider.
/// Uses the `/v1/messages` endpoint with `x-api-key` authentication,
/// Anthropic-specific message format, and `tool_use` content blocks.
pub struct AnthropicProvider {
    pub(crate) client: Client,
    pub(crate) api_key: String,
    pub(crate) base_url: String,
    /// `anthropic-version` header value. Constructor default for the built-in
    /// provider; custom Anthropic-format providers reuse the same default.
    version: String,
    /// Label reported in `ModelInfo.provider`. The built-in provider uses
    /// "anthropic"; custom providers report their own display name.
    pub(crate) provider_label: String,
}

const ANTHROPIC_VERSION: &str = "2023-06-01";


impl AnthropicProvider {
    pub fn new(api_key: &str, base_url: &str) -> Self {
        Self::with_identity(api_key, base_url, "anthropic")
    }

    /// Build a provider with a custom label (for custom Anthropic-format
    /// providers). `provider_label` flows into `ModelInfo.provider`.
    pub fn with_identity(api_key: &str, base_url: &str, provider_label: &str) -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .connect_timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("Failed to build Anthropic HTTP client"),
            api_key: api_key.to_string(),
            base_url: base_url.trim_end_matches('/').to_string(),
            version: ANTHROPIC_VERSION.to_string(),
            provider_label: provider_label.to_string(),
        }
    }

    pub(crate) fn url(&self, path: &str) -> String {
        // Accept both Anthropic's host root and compatible gateways that
        // expose an OpenAI-style `/v1` base URL. The request paths below
        // already include `/v1`, so avoid producing `/v1/v1/...`.
        let base_url = self.base_url.strip_suffix("/v1").unwrap_or(&self.base_url);
        format!("{}{}", base_url, path)
    }

    pub(crate) fn parse_data_url(&self, data_url: &str) -> Option<AnthropicImageSource> {
        if !data_url.starts_with("data:") {
            return None;
        }
        let comma_pos = data_url.find(',')?;
        let header = &data_url[..comma_pos];
        let data = &data_url[comma_pos + 1..];

        // Header format: "data:image/png;base64"
        let media_type = header
            .split(':')
            .nth(1)
            .and_then(|h| h.split(';').next())
            .unwrap_or("image/png");

        Some(AnthropicImageSource {
            source_type: "base64".to_string(),
            media_type: media_type.to_string(),
            data: data.to_string(),
        })
    }
}

#[async_trait]
impl LlmProvider for AnthropicProvider {
    async fn list_models(&self) -> ZenResult<Vec<ModelInfo>> {
        chat::list_models(self).await
    }

    async fn chat_stream(
        &self,
        model: &str,
        messages: Vec<ChatMessage>,
        tools: Option<Vec<ToolInfo>>,
        config: ChatRequestConfig,
        on_chunk: Box<dyn Fn(LlmChunk) + Send>,
        token: CancellationToken,
    ) -> ZenResult<ChatResponse> {
        chat::chat_stream(self, model, messages, tools, config, on_chunk, token).await
    }

    async fn embed(&self, _model: &str, _text: &str) -> ZenResult<Vec<f32>> {
        Err(ZenError::Custom(
            "Anthropic does not offer an embeddings API. Use a different provider for embeddings."
                .to_string(),
        ))
    }

    async fn health_check(&self) -> bool {
        // Anthropic has no /v1/models endpoint. We try a simple request to validate the key.
        // A lightweight check: just verify the API key header is accepted.
        // We'll try hitting /v1/messages with an invalid body — a 400 means key is valid.
        let url = self.url("/v1/messages");
        match self
            .client
            .post(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", &self.version)
            .header("content-type", "application/json")
            .body("{}")
            .send()
            .await
        {
            Ok(resp) => {
                let status = resp.status().as_u16();
                // 400 = bad request (key valid, body invalid) — healthy
                // 401 = unauthorized — unhealthy
                // 200 = somehow worked — healthy
                status == 400 || status == 200 || status == 422
            }
            Err(_) => false,
        }
    }

    fn reasoning_capability(&self, model: &str) -> crate::ReasoningCapability {
        anthropic_reasoning_metadata(model)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::reasoning::{ReasoningProtocol, ReasoningSupport};

    #[test]
    fn adaptive_models_use_adaptive_protocol_not_budget() {
        let cap = anthropic_reasoning_metadata("claude-4-7-opus-20260416");
        assert_eq!(cap.protocol, ReasoningProtocol::AnthropicAdaptive);
        assert!(cap.min_budget.is_none(), "adaptive must not carry a budget range");
    }

    #[test]
    fn claude_37_uses_manual_budget_protocol() {
        let cap = anthropic_reasoning_metadata("claude-3-7-sonnet-20250219");
        assert_eq!(cap.protocol, ReasoningProtocol::AnthropicBudget);
        assert!(cap.min_budget.is_some());
    }

    #[test]
    fn claude_46_is_adaptive() {
        let cap = anthropic_reasoning_metadata("claude-4-6-sonnet-20260219");
        assert_eq!(cap.protocol, ReasoningProtocol::AnthropicAdaptive);
    }

    #[test]
    fn claude_35_has_no_configurable_reasoning() {
        let cap = anthropic_reasoning_metadata("claude-3-5-sonnet-20241022");
        assert_eq!(cap.support, ReasoningSupport::Unsupported);
    }
}