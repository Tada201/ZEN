//! Ollama HTTP API wire types (serde-only).
//! Moved verbatim from the former single-file ollama.rs (Phase 7).

use serde::{Deserialize, Serialize};

// ─── Ollama API types ───

#[derive(Serialize)]
pub(crate) struct OllamaChatRequest {
    pub(crate) model: String,
    pub(crate) messages: Vec<OllamaMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) tools: Option<Vec<serde_json::Value>>,
    pub(crate) stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) think: Option<OllamaThink>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) options: Option<OllamaOptions>,
}

#[derive(Serialize)]
#[serde(untagged)]
pub(crate) enum OllamaThink {
    Bool(bool),
    Level(String),
}

#[derive(Serialize)]
pub(crate) struct OllamaOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) num_predict: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) top_k: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) repeat_penalty: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) seed: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) stop: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct OllamaMessage {
    pub(crate) role: String,
    #[serde(default)]
    pub(crate) content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) thinking: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) images: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) tool_calls: Option<Vec<OllamaToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) tool_call_id: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct OllamaToolCall {
    #[serde(rename = "function")]
    pub function: OllamaFunctionCall,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct OllamaFunctionCall {
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Deserialize)]
pub(crate) struct OllamaChatChunk {
    pub(crate) message: Option<OllamaMessage>,
    pub(crate) done: bool,
    #[serde(default)]
    pub(crate) prompt_eval_count: Option<i64>,
    #[serde(default)]
    pub(crate) eval_count: Option<i64>,
}
#[derive(Deserialize)]
pub(crate) struct OllamaModelsResponse {
    pub(crate) models: Vec<OllamaModelEntry>,
}

#[derive(Deserialize)]
pub(crate) struct OllamaModelEntry {
    pub(crate) name: String,
    pub(crate) size: Option<u64>,
    pub(crate) modified_at: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct OllamaShowRequest<'a> {
    pub(crate) model: &'a str,
}

/// Partial `/api/show` response. `/api/tags` never reports a context window,
/// but `/api/show` exposes it under `model_info` as an arch-prefixed key
/// (e.g. `llama.context_length`, `qwen2.context_length`). We only need that
/// map plus `capabilities` (to skip embedding-only models).
#[derive(Deserialize)]
pub(crate) struct OllamaShowResponse {
    #[serde(default)]
    pub(crate) model_info: std::collections::HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub(crate) capabilities: Vec<String>,
}
#[derive(Serialize)]
pub(crate) struct OllamaEmbedRequest {
    pub(crate) model: String,
    pub(crate) input: String,
}

#[derive(Serialize)]
pub(crate) struct OllamaEmbedBatchRequest {
    pub(crate) model: String,
    pub(crate) input: Vec<String>,
}

#[derive(Deserialize)]
pub(crate) struct OllamaEmbedResponse {
    pub(crate) embeddings: Vec<Vec<f32>>,
}
