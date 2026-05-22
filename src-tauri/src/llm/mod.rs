pub mod ollama;
pub mod openai_compat;
pub mod anthropic;
pub mod lmstudio;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;
use std::sync::Arc;
use sqlx::SqlitePool;

use crate::db::models::{ChatMessage, ChatResponse, ModelInfo, ProviderConfig};
use crate::error::ZenResult;
use crate::llm::ollama::OllamaProvider;
use crate::llm::openai_compat::OpenAiCompatProvider;
use crate::llm::anthropic::AnthropicProvider;
use crate::llm::lmstudio::LmStudioProvider;

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
    match provider.to_lowercase().as_str() {
        "ollama" => "http://localhost:11434".to_string(),
        "openai" => "https://api.openai.com/v1".to_string(),
        "openrouter" => "https://openrouter.ai/api/v1".to_string(),
        "anthropic" => "https://api.anthropic.com".to_string(),
        "groq" => "https://api.groq.com/openai/v1".to_string(),
        "together" => "https://api.together.xyz/v1".to_string(),
        "mistral" => "https://api.mistral.ai/v1".to_string(),
        "perplexity" => "https://api.perplexity.ai".to_string(),
        "nvidia" => "https://integrate.api.nvidia.com/v1".to_string(),
        "lmstudio" => "http://localhost:1234".to_string(),
        "nine_router" => "http://localhost:20128/v1".to_string(),
        "aihubmix" => "https://aihubmix.com/v1".to_string(),
        "google" | "gemini" => "https://generativelanguage.googleapis.com/v1beta/openai".to_string(),
        "deepseek" => "https://api.deepseek.com".to_string(),
        "qwen" => "https://dashscope.aliyuncs.com/compatible-mode/v1".to_string(),
        "xai" => "https://api.x.ai/v1".to_string(),
        "kilocode" | "kilo" | "kilo.ai" => "https://api.kilo.ai/api/gateway".to_string(),
        _ => String::new(),
    }
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
            // Detect OpenRouter for extra headers
            let extra_headers = if p_type == "openrouter"
                || config.display_name.to_lowercase().contains("openrouter")
            {
                vec![
                    ("HTTP-Referer".to_string(), "https://zen.local".to_string()),
                    ("X-Title".to_string(), "Zen AI".to_string()),
                ]
            } else if p_type == "kilocode" 
                || p_type == "kilo" 
                || p_type == "kilo.ai"
                || config.display_name.to_lowercase().contains("kilocode") 
                || config.display_name.to_lowercase().contains("kilo.ai")
            {
                vec![
                    ("HTTP-Referer".to_string(), "https://kilo.ai".to_string()),
                    ("X-Title".to_string(), "Kilo AI".to_string()),
                    ("X-KILOCODE-EDITORNAME".to_string(), "Zen Workbench".to_string()),
                ]
            } else {
                vec![]
            };
            Arc::new(OpenAiCompatProvider::with_headers(
                &config.base_url,
                &config.api_key,
                &p_type,
                extra_headers,
            ))
        }
    }
}

/// Create a provider by looking up settings in the database.
pub async fn create_provider(db_pool: &SqlitePool, provider_name: &str) -> ZenResult<Arc<dyn LlmProvider>> {
    let p_type = provider_name.to_lowercase();
    
    let provider = match p_type.as_str() {
        "ollama" => {
            let url = crate::db::queries::get_setting(db_pool, "ollama_base_url")
                .await?
                .unwrap_or_else(|| default_base_url("ollama"));
            Arc::new(OllamaProvider::new(&url)) as Arc<dyn LlmProvider>
        }
        "anthropic" => {
            let api_key = crate::db::queries::get_setting(db_pool, "anthropic_api_key")
                .await?
                .unwrap_or_default();
            Arc::new(AnthropicProvider::new(&api_key)) as Arc<dyn LlmProvider>
        }
        "lmstudio" => {
            let url = crate::db::queries::get_setting(db_pool, "lmstudio_base_url")
                .await?
                .unwrap_or_else(|| default_base_url("lmstudio"));
            Arc::new(LmStudioProvider::new(&url)) as Arc<dyn LlmProvider>
        }
        _ => {
            let base_url = crate::db::queries::get_setting(db_pool, &format!("{}_base_url", p_type))
                .await?
                .unwrap_or_else(|| default_base_url(&p_type));

            let api_key_setting = if p_type == "google" || p_type == "gemini" {
                "gemini_api_key".to_string()
            } else {
                format!("{}_api_key", p_type)
            };

            let api_key = crate::db::queries::get_setting(db_pool, &api_key_setting)
                .await?
                .unwrap_or_default();

            make_provider(&ProviderConfig {
                provider_type: p_type.clone(),
                base_url,
                api_key,
                display_name: provider_name.to_string(),
                headers: None,
            })
        }
    };
    Ok(provider)
}
