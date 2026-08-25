use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::RwLock;

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
    /// Optional context window in tokens (overrides RunConfig default of 100K).
    #[serde(default)]
    pub context_window: Option<usize>,
    /// Maximum messages to keep in agent memory (None = use RunConfig default).
    #[serde(default)]
    pub max_messages_in_memory: Option<usize>,
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
#[derive(Default)]
pub enum ModelTier {
    /// Simple tasks - can use lightweight models or Agent Booster (no LLM)
    Simple,
    /// Local models (Ollama, LM Studio) - free, offline, but may be less capable
    #[default]
    Local,
    /// Cloud models (GPT-4, Claude) - expensive, reliable, high capability
    Cloud,
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

/// Controls which parts of a built-in profile are configurable in the UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[derive(Default)]
pub enum AgentConfigMode {
    #[default]
    Full,
    ModelOnly,
    ReadOnly,
}


/// Persisted profile fields that extend the runtime Agent without forcing every
/// internal test/runner construction to know about UI and delegation policy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentProfile {
    #[serde(flatten)]
    pub agent: Agent,
    #[serde(default)]
    pub color: Option<String>,
    /// Provider paired with the selected model override. None inherits the parent provider.
    #[serde(default)]
    pub model_provider: Option<String>,
    #[serde(default = "default_true")]
    pub user_invocable: bool,
    #[serde(default = "default_true")]
    pub model_invocable: bool,
    #[serde(default)]
    pub inject_agents_md: bool,
    /// UI configuration scope. Runtime behavior remains owned by the profile.
    #[serde(default)]
    pub config_mode: AgentConfigMode,
}

fn default_true() -> bool {
    true
}

impl From<Agent> for AgentProfile {
    fn from(agent: Agent) -> Self {
        Self {
            agent,
            color: None,
            model_provider: None,
            user_invocable: true,
            model_invocable: true,
            inject_agents_md: false,
            config_mode: AgentConfigMode::Full,
        }
    }
}

pub struct AgentRegistry {
    agents: RwLock<HashMap<String, Agent>>,
    profiles: RwLock<HashMap<String, AgentProfile>>,
    builtin_ids: RwLock<HashSet<String>>,
    user_dir: RwLock<Option<PathBuf>>,
}

impl Default for AgentRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl AgentRegistry {
    pub fn new() -> Self {
        Self {
            agents: RwLock::new(HashMap::new()),
            profiles: RwLock::new(HashMap::new()),
            builtin_ids: RwLock::new(HashSet::new()),
            user_dir: RwLock::new(None),
        }
    }

    pub fn register(&self, agent: Agent) {
        self.register_profile(AgentProfile::from(agent));
    }

    pub fn register_profile(&self, profile: AgentProfile) {
        let id = profile.agent.id.clone();
        if let Ok(mut agents) = self.agents.write() {
            agents.insert(id.clone(), profile.agent.clone());
        }
        if let Ok(mut profiles) = self.profiles.write() {
            profiles.insert(id, profile);
        }
    }

    pub fn get(&self, id: &str) -> Option<Agent> {
        self.agents.read().ok()?.get(id).cloned()
    }

    pub fn get_profile(&self, id: &str) -> Option<AgentProfile> {
        self.profiles.read().ok()?.get(id).cloned()
    }

    /// List all registered agents (for execution and prompt construction).
    pub fn list(&self) -> Vec<Agent> {
        let mut agents: Vec<Agent> = self.agents.read().map(|guard| guard.values().cloned().collect()).unwrap_or_default();
        agents.sort_by_key(|a| a.name.to_lowercase());
        agents
    }

    pub fn list_profiles(&self) -> Vec<AgentProfile> {
        let mut profiles: Vec<AgentProfile> = self.profiles.read().map(|guard| guard.values().cloned().collect()).unwrap_or_default();
        profiles.sort_by_key(|a| a.agent.name.to_lowercase());
        profiles
    }

    pub fn mark_loaded_as_builtin(&self) {
        let ids = self.list().into_iter().map(|agent| agent.id).collect::<HashSet<_>>();
        if let Ok(mut builtins) = self.builtin_ids.write() {
            builtins.extend(ids);
        }
    }

    pub fn is_builtin(&self, id: &str) -> bool {
        self.builtin_ids.read().map(|ids| ids.contains(id)).unwrap_or(false)
    }

    pub fn configure_user_dir(&self, dir: PathBuf) -> Result<usize, String> {
        std::fs::create_dir_all(&dir).map_err(|error| format!("Could not create agent config directory: {error}"))?;
        if let Ok(mut user_dir) = self.user_dir.write() {
            *user_dir = Some(dir.clone());
        }
        Ok(self.load_user_dir(&dir))
    }

    fn validate_profile(&self, profile: &AgentProfile) -> Result<(), String> {
        let id = profile.agent.id.trim();
        if id.is_empty() || id.len() > 64 || !id.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_') {
            return Err("Agent ID must contain only letters, numbers, hyphens, or underscores.".to_string());
        }
        if profile.agent.name.trim().is_empty() || profile.agent.name.chars().count() > 80 {
            return Err("Agent name is required and must be 80 characters or fewer.".to_string());
        }
        if profile.agent.instructions.trim().is_empty() || profile.agent.instructions.len() > 50_000 {
            return Err("System instructions are required and must be 50,000 characters or fewer.".to_string());
        }
        if profile.agent.description.as_deref().unwrap_or("").chars().count() > 240 {
            return Err("Description must be 240 characters or fewer.".to_string());
        }
        if profile.model_provider.as_deref().is_some_and(|provider| {
            provider.trim().is_empty()
                || provider.len() > 80
                || !provider.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
        }) {
            return Err("Model provider contains unsupported characters.".to_string());
        }
        if profile.model_provider.is_some() && profile.agent.model_override.is_none() {
            return Err("A model provider requires a selected model.".to_string());
        }
        if profile.agent.tool_ids.is_empty() || profile.agent.tool_ids.len() > 128 || profile.agent.tool_ids.iter().any(|tool| tool.trim().is_empty() || tool.len() > 120) {
            return Err("Select at least one allowed tool.".to_string());
        }
        if profile.agent.max_iterations.is_some_and(|value| !(1..=100).contains(&value)) {
            return Err("Maximum iterations must be between 1 and 100.".to_string());
        }
        if profile.agent.context_window.is_some_and(|value| !(1_024..=2_000_000).contains(&value)) {
            return Err("Context window must be between 1,024 and 2,000,000 tokens.".to_string());
        }
        if profile.agent.max_messages_in_memory.is_some_and(|value| !(1..=2_000).contains(&value)) {
            return Err("Maximum messages must be between 1 and 2,000.".to_string());
        }
        if profile.color.as_deref().is_some_and(|color| !matches!(color, "slate" | "blue" | "violet" | "emerald" | "amber" | "rose")) {
            return Err("Unsupported agent color.".to_string());
        }
        Ok(())
    }

    fn user_path(&self, id: &str) -> Result<PathBuf, String> {
        if id.is_empty() || !id.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_') {
            return Err("Invalid agent ID.".to_string());
        }
        self.user_dir.read().ok().and_then(|dir| dir.clone()).map(|dir| dir.join(format!("{id}.json"))).ok_or_else(|| "User agent storage is not initialized.".to_string())
    }

    pub fn save_user_profile(&self, profile: AgentProfile) -> Result<AgentProfile, String> {
        self.validate_profile(&profile)?;
        if self.is_builtin(&profile.agent.id) {
            return Err("Built-in agents cannot be edited.".to_string());
        }
        let path = self.user_path(&profile.agent.id)?;
        let content = serde_json::to_string_pretty(&profile).map_err(|error| format!("Could not serialize agent: {error}"))?;
        std::fs::write(&path, content).map_err(|error| format!("Could not save agent: {error}"))?;
        self.register_profile(profile.clone());
        Ok(profile)
    }

    pub fn delete_user_profile(&self, id: &str) -> Result<bool, String> {
        if self.is_builtin(id) {
            return Err("Built-in agents cannot be deleted.".to_string());
        }
        let path = self.user_path(id)?;
        let existed = path.exists();
        if existed {
            std::fs::remove_file(&path).map_err(|error| format!("Could not delete agent: {error}"))?;
        }
        if let Ok(mut agents) = self.agents.write() {
            agents.remove(id);
        }
        if let Ok(mut profiles) = self.profiles.write() {
            profiles.remove(id);
        }
        Ok(existed)
    }

    /// Load built-in agent definitions from a directory of JSON files.
    pub fn load_from_dir(&self, dir: &Path) -> usize {
        self.load_dir(dir, false)
    }

    fn load_user_dir(&self, dir: &Path) -> usize {
        self.load_dir(dir, true)
    }

    fn load_dir(&self, dir: &Path, user: bool) -> usize {
        let mut count = 0;
        if !dir.exists() || !dir.is_dir() {
            tracing::debug!("Agent config directory does not exist: {:?}", dir);
            return 0;
        }
        let entries = match std::fs::read_dir(dir) {
            Ok(entries) => entries,
            Err(error) => {
                tracing::warn!("Failed to read agent config directory {:?}: {}", dir, error);
                return 0;
            }
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
                continue;
            }
            match std::fs::read_to_string(&path).ok().and_then(|content| serde_json::from_str::<AgentProfile>(&content).ok()) {
                Some(profile) => {
                    if user && self.is_builtin(&profile.agent.id) {
                        tracing::warn!("Ignoring user agent '{}' because it conflicts with a built-in agent", profile.agent.id);
                        continue;
                    }
                    tracing::info!("Loaded {} agent config '{}' from {:?}", if user { "user" } else { "built-in" }, profile.agent.id, path);
                    self.register_profile(profile);
                    count += 1;
                }
                None => tracing::warn!("Failed to parse agent config {:?}", path),
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
    /// Just the final turn's answer text (not the accumulated per-iteration
    /// commentary). Sub-agent rendering uses this so the panel's final reply
    /// isn't a duplicate of the interleaved commentary segments.
    #[serde(default)]
    pub final_answer: Option<String>,
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
