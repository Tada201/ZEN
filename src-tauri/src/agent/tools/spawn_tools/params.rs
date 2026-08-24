//! Parameter structs for the spawn paths.

use std::sync::Arc;
use tauri::AppHandle;
use tokio_util::sync::CancellationToken;

/// Parameters for spawning a child agent.
pub(crate) struct SpawnParams<'a> {
    pub app: AppHandle,
    pub chat_id: String,
    /// The parent spawn/delegation tool call that owns this child run.
    pub parent_tool_call_id: Option<String>,
    pub agent_id: &'a str,
    pub task: &'a str,
    pub context: &'a str,
    pub explicit_model: Option<&'a str>,
    pub explicit_max_steps: Option<u64>,
    pub depth: u32,
    pub allowed_tools: Option<Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>>,
    pub token: CancellationToken,
    pub label: &'a str,
    /// When set, spawn an LLM-defined ad-hoc agent with these instructions
    /// instead of looking up `agent_id` in the registry.
    pub adhoc_instructions: Option<&'a str>,
    /// Optional tool subset for an ad-hoc agent (intersected with the ceiling).
    pub adhoc_tools: Vec<String>,
    pub success_criteria: Option<&'a str>,
    pub constraints: Vec<String>,
    pub relevant_files: Vec<String>,
}
