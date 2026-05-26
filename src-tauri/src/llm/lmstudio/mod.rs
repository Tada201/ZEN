pub mod chat;
pub mod health;
pub mod models;
pub mod types;

pub use types::*;

use async_trait::async_trait;
use reqwest::Client;

use crate::db::models::{ChatMessage, ChatResponse, ModelInfo};
use crate::error::ZenResult;
use crate::llm::LlmProvider;

/// Dedicated LM Studio provider.
/// Uses `/api/v0/models` for rich model metadata (type, arch, quantization, state)
/// and `/v1/chat/completions` for OpenAI-compatible inference.
pub struct LmStudioProvider {
    client: Client,
    base_url: String,
    /// Cached model_id → arch mapping, populated by list_models().
    /// Used by supports_tools() to check per-model tool capability.
    model_archs: std::sync::RwLock<std::collections::HashMap<String, String>>,
}

/// Architectures known to have native tool calling support in LM Studio.
const NATIVE_TOOL_ARCHS: &[&str] = &[
    "qwen2",
    "qwen2_vl",
    "qwen3",
    "llama",
    "mistral",
    "gemma",
    "gemma2",
    "gemma3",
    "phi3",
    "phi4",
    "granite",
    "command-r",
    "deepseek",
    "deepseek2",
];

impl LmStudioProvider {
    pub fn new(base_url: &str) -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .connect_timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("Failed to build LM Studio HTTP client"),
            base_url: base_url.trim_end_matches('/').to_string(),
            model_archs: std::sync::RwLock::new(std::collections::HashMap::new()),
        }
    }

    fn arch_supports_tools(arch: &str) -> bool {
        let arch_lower = arch.to_lowercase();
        NATIVE_TOOL_ARCHS
            .iter()
            .any(|known| arch_lower.starts_with(known))
    }

    /// Cache the arch for a model after listing.
    fn cache_model_arch(&self, model_id: &str, arch: &str) {
        if let Ok(mut map) = self.model_archs.write() {
            map.insert(model_id.to_string(), arch.to_string());
        }
    }
}

#[async_trait]
impl LlmProvider for LmStudioProvider {
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
        // Check cached arch mapping from list_models()
        if let Ok(map) = self.model_archs.read() {
            if let Some(arch) = map.get(model) {
                return Self::arch_supports_tools(arch);
            }
        }
        let name_lower = model.to_lowercase();
        NATIVE_TOOL_ARCHS
            .iter()
            .any(|arch| name_lower.contains(arch))
    }
}
