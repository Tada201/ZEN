pub mod anthropic;
pub mod lmstudio;
pub mod ollama;
pub mod openai_compat;
pub mod provider_meta;
pub mod registry;

pub use registry::ProviderRegistry;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

use crate::db::models::{ChatMessage, ChatResponse, ModelInfo, ProviderConfig};
use crate::error::ZenResult;
use crate::llm::anthropic::AnthropicProvider;
use crate::llm::lmstudio::LmStudioProvider;
use crate::llm::ollama::OllamaProvider;
use crate::llm::openai_compat::OpenAiCompatProvider;

/// Configuration for advanced LLM requests (o1 reasoning, structured outputs, prompt caching, etc.)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ChatRequestConfig {
    pub stream: bool,
    pub temperature: Option<f64>,
    pub max_tokens: Option<i64>,
    pub top_p: Option<f64>,
    pub top_k: Option<i64>,
    pub presence_penalty: Option<f64>,
    pub frequency_penalty: Option<f64>,
    pub repeat_penalty: Option<f64>,
    pub seed: Option<i64>,
    pub stop: Option<Vec<String>>,
    pub json_schema: Option<serde_json::Value>,
    pub reasoning_effort: Option<String>,
    pub thinking_budget: Option<i64>,
    pub enable_prompt_caching: bool,
}

/// A chunk of data from an LLM stream.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum LlmChunk {
    /// Normal text content
    Text(String),
    /// Thinking/reasoning block (e.g. Anthropic thinking)
    Thought(String),
    /// Incremental structured tool-call data while the provider is still streaming.
    ToolCallDelta {
        index: usize,
        id: Option<String>,
        name: Option<String>,
        arguments_delta: String,
        arguments_snapshot: String,
    },
    /// A streamed tool call whose arguments have become valid JSON.
    ToolCallReady {
        index: usize,
        id: Option<String>,
        name: String,
        arguments: serde_json::Value,
    },
}

/// LLM provider abstraction — decoupled from any specific backend.
/// Current: Ollama. Future: llama.cpp, OpenAI-compatible, etc.
#[async_trait]
pub trait LlmProvider: Send + Sync {
    /// List available models from the provider.
    async fn list_models(&self) -> ZenResult<Vec<ModelInfo>>;

    /// Stream a chat completion. Calls `on_chunk` for each text delta.
    /// Returns the final assembled response when done.
    async fn chat_stream(
        &self,
        model: &str,
        messages: Vec<ChatMessage>,
        tools: Option<Vec<crate::tools::ToolInfo>>,
        config: ChatRequestConfig,
        on_chunk: Box<dyn Fn(LlmChunk) + Send>,
        token: CancellationToken,
    ) -> ZenResult<ChatResponse>;

    /// Generate an embedding vector for the given text.
    async fn embed(&self, model: &str, text: &str) -> ZenResult<Vec<f32>>;

    /// Generate embeddings for a batch of texts.
    /// Default implementation calls embed() sequentially; providers can override for true batching.
    async fn embed_batch(&self, model: &str, texts: &[&str]) -> ZenResult<Vec<Vec<f32>>> {
        let mut results = Vec::with_capacity(texts.len());
        for text in texts {
            results.push(self.embed(model, text).await?);
        }
        Ok(results)
    }

    /// Check if the provider is reachable.
    async fn health_check(&self) -> bool;

    /// Whether this provider supports tool calling for a given model.
    /// If false, the runner will inject tool descriptions as text in the system prompt
    /// instead of passing them as structured tool definitions.
    fn supports_tools(&self, _model: &str) -> bool {
        true
    }
}

/// Centralized mapping for default provider URLs.
pub fn default_base_url(provider: &str) -> String {
    let lower = provider.to_lowercase();
    provider_meta::PROVIDER_CATALOG
        .iter()
        .find(|p| p.name == lower)
        .map(|p| p.default_base_url.to_string())
        .unwrap_or_default()
}

/// Provides a reliable "standard" model for a given provider, used during auto-escalation.
pub fn default_model_for_provider(_provider: &str) -> String {
    // No hardcoded fallback models — the user selects their own model in settings.
    // Auto-escalation will fail gracefully if no model is configured, prompting
    // the user to select one rather than silently using an outdated default.
    String::new()
}

/// Create the appropriate LLM provider from a config.
pub fn make_provider(config: &ProviderConfig) -> Arc<dyn LlmProvider> {
    let p_type = config.provider_type.to_lowercase();
    match p_type.as_str() {
        "ollama" => Arc::new(OllamaProvider::new(&config.base_url)),
        "anthropic" => Arc::new(AnthropicProvider::new(&config.api_key)),
        "lmstudio" => Arc::new(LmStudioProvider::new(&config.base_url)),
        _ => {
            let mut extra_headers = vec![];
            if let Some(p) = provider_meta::PROVIDER_CATALOG
                .iter()
                .find(|p| p.name == p_type)
            {
                if let Some(referer) = p.http_referer {
                    extra_headers.push(("HTTP-Referer".to_string(), referer.to_string()));
                }
                for &(k, v) in p.extra_headers {
                    extra_headers.push((k.to_string(), v.to_string()));
                }
            }
            Arc::new(OpenAiCompatProvider::with_headers(
                &config.base_url,
                &config.api_key,
                &p_type,
                extra_headers,
            ))
        }
    }
}
