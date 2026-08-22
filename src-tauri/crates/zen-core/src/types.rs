//! Cross-crate wire/domain DTOs (BIG_MIGRATION.md §3.3).
//!
//! Rule of thumb: if two future crates would need a type, it belongs here;
//! persistence row shapes stay with the db layer (zen-db, Phase 3).

use serde::{Deserialize, Serialize};

/// LLM tool wire description — the single shape shared by the tool registry
/// (future zen-tools) and every provider encoder (future zen-llm).
/// Previously `crate::tools::ToolInfo`; the old path re-exports this.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolInfo {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

/// Provider connection DTO used to construct provider clients (future
/// zen-llm) and consumed by agent escalation paths (future zen-agent).
/// Previously `crate::db::models::ProviderConfig`; the old path re-exports
/// this. This is a wire DTO, not a persistence row shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    /// "ollama" | "openai" | "openrouter" | "groq" | "together" | "custom"
    pub provider_type: String,
    /// API base URL
    pub base_url: String,
    /// API key (empty for Ollama)
    pub api_key: String,
    /// Display name
    pub display_name: String,
    /// Extra headers for the provider
    #[serde(default)]
    pub headers: Option<std::collections::HashMap<String, String>>,
    /// Wire protocol: "openai_chat" (default) | "anthropic_messages".
    /// Only meaningful for custom providers; built-in arms ignore it.
    #[serde(default)]
    pub api_format: Option<String>,
}

/// System metrics snapshot shared by the hardware service (app) and the
/// sys-metrics tool (future zen-tools). Previously `crate::models::SystemMetrics`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemMetrics {
    pub cpu_load: f32,
    pub mem_used: u64,
    pub mem_total: u64,
    pub net_up: f32,
    pub net_down: f32,
}
