//! Cross-crate LLM chat-wire DTOs (BIG_MIGRATION.md §3.3, Phase 7).
//!
//! Serde-only wire shapes shared by zen-db (persistence boundary),
//! zen-llm (providers) and the agent core. Previously defined in
//! `zen-db/src/models.rs`; that path re-exports these.

use serde::{Deserialize, Serialize};

use crate::reasoning::ReasoningCapability;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningBlock {
    pub provider: String,
    #[serde(rename = "type")]
    pub block_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub args: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_details: Option<Vec<ReasoningBlock>>,
    /// Base64 encoded images (e.g. "data:image/jpeg;base64,...")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub images: Option<Vec<String>>,
    pub tool_calls: Option<Vec<ToolCall>>,
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatResponse {
    pub content: String,
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_details: Option<Vec<ReasoningBlock>>,
    pub tool_calls: Option<Vec<ToolCall>>,
    pub tokens_in: Option<i64>,
    pub tokens_out: Option<i64>,
    pub done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub size: Option<u64>,
    pub modified_at: Option<String>,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model_type: Option<String>,
    #[serde(default)]
    pub arch: Option<String>,
    #[serde(default)]
    pub quantization: Option<String>,
    #[serde(default)]
    pub max_context_length: Option<u64>,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub supports_vision: Option<bool>,
    #[serde(default)]
    pub supports_tools: Option<bool>,
    /// Resolved reasoning capability (SSOT). Replaces the former
    /// `supports_reasoning` + `reasoning_config_type` pair.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<ReasoningCapability>,
}
