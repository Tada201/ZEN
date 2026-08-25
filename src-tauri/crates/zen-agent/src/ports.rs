//! Host-capability ports (BIG_MIGRATION.md Phase 11).
//!
//! Everything zen-agent cannot do by itself — executing a tool, requesting a
//! user approval, reading the v1/v2 tool catalogs, running meta-tool
//! discovery, watching board writes, snapshotting graph sessions — goes
//! through these traits. The app crate implements them over its concrete
//! services (`ToolService`, the two registries, `ManageBoardTool`, the
//! canvas session map); zen-agent only sees trait objects, so the crate
//! stays tauri-free.
//!
//! Method shapes mirror the pre-extraction call sites byte-for-byte where
//! observable (R5): approval outcomes, permission decisions and tool results
//! are the exact former types, only the `AppHandle` plumbing moved behind
//! the port boundary into the app-side implementations.

use std::collections::HashSet;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use async_trait::async_trait;
use tokio_util::sync::CancellationToken;
use zen_core::ToolInfo;
use zen_security::approval::{PermissionContext, PermissionDecision};
use zen_tools::{ToolDescriptor, ToolError, ToolSchema};

use crate::types::ToolResult;

// ── Tool execution (former `services::tool::ToolService`) ───────────────────

/// Parameters for executing an agent tool call through the host. Mirrors the
/// former `AgentToolParams` minus the host handle and the pre-resolved tool:
/// every runner call site passed `tool: None` and let the service resolve by
/// name, so resolution stays app-side inside the implementation.
pub struct PortToolExecution {
    pub chat_id: String,
    pub tool_call: crate::types::ToolCall,
    pub token: CancellationToken,
    pub depth: u32,
    pub allowed_tools: Option<Arc<tokio::sync::Mutex<HashSet<String>>>>,
    pub delegation_allowed: bool,
}

/// Terminal outcome of an interactive tool-approval request. Moved verbatim
/// from the app's `services::tool`; re-exported there for app call sites.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ToolApprovalOutcome {
    Approved,
    Denied,
    TimedOut,
    Cancelled,
    ArgumentMismatch,
}

impl ToolApprovalOutcome {
    pub fn approved(&self) -> bool {
        matches!(self, Self::Approved)
    }

    pub fn error_message(&self) -> &'static str {
        match self {
            Self::Approved => "",
            Self::Denied => "Tool execution denied by user.",
            Self::TimedOut => "Tool approval timed out.",
            Self::Cancelled => "Tool approval was cancelled before the user responded.",
            Self::ArgumentMismatch => {
                "Tool approval rejected because arguments changed after approval was requested."
            }
        }
    }
}

/// Correlation ids stamped on approval requests so the Agents panel can route
/// the prompt to the right card. Moved verbatim from the app's
/// `services::tool`; re-exported there for app call sites.
pub struct ToolApprovalExecutionContext {
    pub run_id: Option<String>,
    pub parent_agent_id: Option<String>,
    pub execution_id: Option<String>,
    pub batch_id: Option<String>,
    pub tool_batch_id: Option<String>,
    pub agent_id: Option<String>,
    pub agent_name: Option<String>,
    pub iteration: Option<usize>,
}

/// The runner-facing slice of the app's `ToolService`.
#[async_trait]
pub trait ToolExecutionPort: Send + Sync {
    async fn execute_agent_tool(&self, params: PortToolExecution) -> ToolResult;

    async fn request_approval(
        &self,
        caller: &str,
        chat_id: &str,
        tool_call: &zen_tools::ToolCall,
        context: PermissionContext,
        execution_context: Option<ToolApprovalExecutionContext>,
    ) -> ToolApprovalOutcome;

    async fn execute_interactive(
        &self,
        caller: &str,
        chat_id: String,
        tool_call: zen_tools::ToolCall,
    ) -> Result<serde_json::Value, String>;

    async fn check_permission(
        &self,
        caller: &str,
        tool_call: &zen_tools::ToolCall,
    ) -> Result<PermissionDecision, ToolError>;
}

// ── Tool catalogs (former v1 registry + v2 permissions registry) ────────────

/// Read view over the host's v1 agent-tool registry and the v2 permissions
/// registry. Replaces the Runner's concrete `tool_registry`/`permissions`
/// handles, whose types are generic over tauri's `AppHandle` app-side.
#[async_trait]
pub trait ToolCatalogPort: Send + Sync {
    /// All registered v1 agent-tool ids (`AgentToolRegistry::list`).
    async fn v1_tool_ids(&self) -> Vec<String>;
    /// v1 registry metadata (`list_as_tool_info`) for direct-exposure agents.
    async fn v1_tools_info(&self) -> Vec<ToolInfo>;
    /// Executable v2 tool names from the permissions registry.
    async fn v2_executable_tool_names(&self) -> Vec<String>;
    /// A single v2 tool's definition info by id.
    async fn v2_definition(&self, id: &str) -> Option<ToolInfo>;
}

// ── Meta-tool pipeline (former `tools::manager::ToolManager`) ───────────────

/// The three manager operations the meta-tool preprocessing needs
/// (`tool_list`, `tool_info`, `tool_exec` envelopes). Return types are the
/// tauri-free zen-tools DTOs.
#[async_trait]
pub trait ToolPipelinePort: Send + Sync {
    async fn list_allowed_matching(
        &self,
        allowed_ids: &[String],
        query: Option<&str>,
    ) -> Vec<ToolDescriptor>;
    async fn get_info(&self, id: &str) -> Option<ToolSchema>;
    async fn resolve_tool_exec(
        &self,
        args: &serde_json::Value,
    ) -> Option<(String, serde_json::Value)>;
}

// ── Board (voice-display seam over the app's ManageBoardTool) ───────────────

/// RAII guard that stops watching board updates when dropped; the app
/// implementation unlistens its tauri event subscription.
pub struct BoardWatchGuard {
    unlisten: Option<Box<dyn FnOnce() + Send>>,
}

impl BoardWatchGuard {
    pub fn new(unlisten: Box<dyn FnOnce() + Send>) -> Self {
        Self {
            unlisten: Some(unlisten),
        }
    }
}

impl Drop for BoardWatchGuard {
    fn drop(&mut self) {
        if let Some(unlisten) = self.unlisten.take() {
            unlisten();
        }
    }
}

/// Board-write seam used by the voice-display agent: subscribe to
/// `board:update` events for a chat, and execute one manage_board operation.
#[async_trait]
pub trait BoardPort: Send + Sync {
    /// Set `flag` whenever a `board:update` event arrives for `chat_id`.
    fn watch_board_updates(&self, chat_id: String, flag: Arc<AtomicBool>) -> BoardWatchGuard;

    /// Execute one manage_board operation through the host's board tool.
    async fn run_board_operation(
        &self,
        chat_id: String,
        operation: serde_json::Value,
        depth: u32,
        allowed_tools: Option<Arc<tokio::sync::Mutex<HashSet<String>>>>,
        token: CancellationToken,
    ) -> anyhow::Result<()>;
}

// ── Graph sessions (former canvas map read by system-prompt middleware) ─────

/// Tauri-free projection of one canvas graph expression, limited to the
/// fields the system-prompt middleware renders.
#[derive(Debug, Clone)]
pub struct GraphExpressionSnapshot {
    pub id: String,
    pub expr: String,
    pub visible: bool,
    pub error: Option<String>,
}

/// Tauri-free projection of a canvas `GraphSession` for prompt building.
/// Variables are sorted by name so rendered blocks stay stable across runs.
#[derive(Debug, Clone)]
pub struct GraphSessionSnapshot {
    pub expressions: Vec<GraphExpressionSnapshot>,
    pub variables: Vec<(String, f64)>,
    /// `(x_min, x_max, y_min, y_max)`
    pub viewport: (f64, f64, f64, f64),
    pub issue_count: usize,
    pub current_version: usize,
}

/// Read-only access to the app's canvas graph-session map. Snapshotting is
/// best-effort: `None` when the session does not exist or the map lock is
/// contended (matching the former `try_lock` semantics).
pub trait GraphSessionSource: Send + Sync {
    fn snapshot(&self, session_id: &str) -> Option<GraphSessionSnapshot>;
}
