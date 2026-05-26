use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub instructions: String,
    pub tool_ids: Vec<String>,
    /// Optional model override (use this instead of the session default).
    #[serde(default)]
    pub model_override: Option<String>,
    /// Optional per-agent max iterations (overrides RunConfig default).
    #[serde(default)]
    pub max_iterations: Option<usize>,
    /// Short description for display in agent lists.
    #[serde(default)]
    pub description: Option<String>,
    /// Model tier for auto-escalation (local = cheap/offline, cloud = expensive/reliable)
    #[serde(default)]
    pub model_tier: ModelTier,
}

/// Model tier for auto-escalation
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelTier {
    /// Simple tasks - can use lightweight models or Agent Booster (no LLM)
    Simple,
    /// Local models (Ollama, LM Studio) - free, offline, but may be less capable
    Local,
    /// Cloud models (GPT-4, Claude) - expensive, reliable, high capability
    Cloud,
}

impl Default for ModelTier {
    fn default() -> Self {
        ModelTier::Local
    }
}

impl ModelTier {
    pub fn description(&self) -> &'static str {
        match self {
            ModelTier::Simple => "Simple task - Agent Booster eligible",
            ModelTier::Local => "Local model (free, offline)",
            ModelTier::Cloud => "Cloud model (expensive, reliable)",
        }
    }
}

pub struct AgentRegistry {
    agents: HashMap<String, Agent>,
}

impl AgentRegistry {
    pub fn new() -> Self {
        Self {
            agents: HashMap::new(),
        }
    }

    pub fn register(&mut self, agent: Agent) {
        self.agents.insert(agent.id.clone(), agent);
    }

    pub fn get(&self, id: &str) -> Option<&Agent> {
        self.agents.get(id)
    }

    /// List all registered agents (for frontend display).
    pub fn list(&self) -> Vec<&Agent> {
        self.agents.values().collect()
    }

    /// Load agent definitions from a directory of JSON files.
    /// Each file should contain a single Agent JSON object.
    pub fn load_from_dir(&mut self, dir: &Path) -> usize {
        let mut count = 0;
        if !dir.exists() || !dir.is_dir() {
            tracing::debug!("Agent config directory does not exist: {:?}", dir);
            return 0;
        }

        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(e) => {
                tracing::warn!("Failed to read agent config directory {:?}: {}", dir, e);
                return 0;
            }
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }

            match std::fs::read_to_string(&path) {
                Ok(content) => match serde_json::from_str::<Agent>(&content) {
                    Ok(agent) => {
                        tracing::info!("Loaded agent config '{}' from {:?}", agent.id, path);
                        self.register(agent);
                        count += 1;
                    }
                    Err(e) => {
                        tracing::warn!("Failed to parse agent config {:?}: {}", path, e);
                    }
                },
                Err(e) => {
                    tracing::warn!("Failed to read agent config {:?}: {}", path, e);
                }
            }
        }

        count
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub args: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub tool_call_id: String,
    pub content: Value,
    pub is_error: bool,
    #[serde(default)]
    pub duration_ms: u64,
}

// ─── Action Timeline Types (for Claude Code-style UI) ───

/// Message kind discriminator for action timeline
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageKind {
    Text,
    ToolCall,
    ToolResult,
    AgentHandoff,
    AgentSpawn,
    AgentComplete,
    ApprovalRequest,
    ClarificationRequest,
}

/// Metadata for agent actions (persisted in messages.metadata)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionMeta {
    pub agent_id: String,
    pub agent_name: String,
    pub iteration: usize,
    pub depth: u32, // For nested sub-agents

    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress_percent: Option<u32>, // Added: 0-100 progress indicator

    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call: Option<ToolCallMeta>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_result: Option<ToolResultMeta>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub handoff: Option<HandoffMeta>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub spawn: Option<SpawnMeta>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval_request: Option<ApprovalRequestMeta>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub clarification_request: Option<ClarificationRequestMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallMeta {
    pub tool_name: String,
    pub args: Value,
    pub status: String, // 'pending', 'running', 'completed', 'failed'
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResultMeta {
    pub tool_name: String,
    pub status: String, // 'ok', 'error', 'timeout'
    pub duration_ms: u64,
    pub content_summary: String, // First 200 chars of result
    pub args: Value,             // The arguments used for this call
    #[serde(skip_serializing_if = "Option::is_none")]
    pub files: Option<Vec<FileChange>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub change_type: String, // 'created', 'modified', 'deleted'
    pub lines_added: Option<usize>,
    pub lines_removed: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diff: Option<String>, // Unified diff string
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffMeta {
    pub from_agent: String,
    pub to_agent: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnMeta {
    pub parent_agent: String,
    pub child_agent: String,
    pub task: String,
    pub status: String, // 'spawned', 'completed'
    pub duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spawn_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalRequestMeta {
    pub tool_call_id: String,
    pub tool_name: String,
    pub arguments: Value,
    pub chat_id: String,
    pub model: Option<String>,
    pub context: PermissionContextMeta,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionContextMeta {
    pub risk_level: String, // 'low', 'medium', 'high', 'critical'
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments_preview: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggested_patterns: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClarificationRequestMeta {
    pub question: String,
    #[serde(rename = "type")]
    pub clarification_type: String, // "single_select", "multi_select", "rank_priorities"
    pub options: Vec<ClarificationOptionMeta>,
    pub chat_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClarificationOptionMeta {
    pub id: String,
    pub label: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentResponse {
    pub content: Option<String>,
    pub tool_calls: Vec<ToolCall>,
    pub reasoning: Option<String>,
    pub handoff: Option<String>, // Target agent ID
    pub tokens_in: Option<i64>,
    pub tokens_out: Option<i64>,
    /// Whether the runner already persisted this message to the database.
    /// When true, send_message should skip the duplicate-content check and DB insert.
    #[serde(default)]
    pub message_persisted: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StopReason {
    EndTurn,
    MaxIterations,
    ToolCall,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunStatus {
    pub message: String,
    pub chat_id: String,
    pub iteration: usize,
}
