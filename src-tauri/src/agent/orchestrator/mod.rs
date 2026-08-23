pub mod execution;
#[path = "loop.rs"]
pub mod r#loop;
/// Agentic Swarm Phase 3: Orchestrator System
///
/// Provides high-level orchestration for complex multi-agent tasks:
/// - Goal breakdown into subtasks
/// - Specialist agent spawning
/// - Task queue management
/// - Result synthesis
/// - Progress tracking
pub mod plan;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::AppHandle;

use crate::agent::hooks::HookRegistry;
use crate::agent::task::Task;
use crate::agent::tools::ToolRegistry;
use crate::agent::types::AgentRegistry;
use crate::services::agent_context::AgentContext;
use crate::tools::manager::ToolManager;
use crate::tools::GlobalToolRegistry;
use sqlx::SqlitePool;

/// Orchestrator for managing complex multi-agent workflows
pub struct Orchestrator {
    app: AppHandle,
    /// Phase 6 seam: shared service handles (same Arcs as AppState).
    pub(crate) ctx: AgentContext,
    agent_registry: Arc<AgentRegistry>,
    tool_registry: Arc<tokio::sync::RwLock<ToolRegistry>>,
    hook_registry: Arc<HookRegistry>,
    permissions: GlobalToolRegistry,
    tool_manager: Arc<ToolManager>,
    pub(crate) db_pool: Option<SqlitePool>,
    pub(crate) on_event: Option<tauri::ipc::Channel<serde_json::Value>>,
}

/// Result of breaking down a goal into tasks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskBreakdown {
    /// The original goal
    pub goal: String,
    /// List of subtasks to achieve the goal
    pub tasks: Vec<Task>,
    /// Estimated complexity (1-10)
    pub complexity: u8,
    /// Suggested agent assignments for each task
    pub agent_assignments: Vec<(String, String)>, // (task_id, agent_id)
}

/// Progress update for orchestrator execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestratorProgress {
    /// Current phase of execution
    pub phase: OrchestratorPhase,
    /// Task queue summary
    pub queue_summary: String,
    /// Current task description (if any)
    pub current_task: Option<String>,
    /// Overall progress percentage (0-100)
    pub progress_percentage: f64,
    /// Message for user display
    pub message: String,
}

/// Phases of orchestrator execution
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrchestratorPhase {
    /// Analyzing the goal
    Analyzing,
    /// Breaking goal into tasks
    Planning,
    /// Executing tasks
    Executing,
    /// Synthesizing results
    Synthesizing,
    /// Complete
    Complete,
}

impl Orchestrator {
    /// Create a new orchestrator
    pub fn new(
        app: AppHandle,
        ctx: AgentContext,
        agent_registry: Arc<AgentRegistry>,
        tool_registry: Arc<tokio::sync::RwLock<ToolRegistry>>,
        hook_registry: Arc<HookRegistry>,
        permissions: GlobalToolRegistry,
        tool_manager: Arc<ToolManager>,
    ) -> Self {
        Self {
            app,
            ctx,
            agent_registry,
            tool_registry,
            hook_registry,
            permissions,
            tool_manager,
            db_pool: None,
            on_event: None,
        }
    }

    /// Set a direct IPC channel for high-performance event streaming
    pub fn with_channel(mut self, channel: tauri::ipc::Channel<serde_json::Value>) -> Self {
        self.on_event = Some(channel);
        self
    }

    /// Internal helper to emit events via direct channel (if available) or global bus
    pub(crate) fn emit(&self, event: crate::agent::event_bus::AgentEvent) -> Result<()> {
        event.emit_via(&self.app, &self.on_event);
        Ok(())
    }

    /// Set the database pool for intermediate saves
    pub fn with_db_pool(mut self, db_pool: SqlitePool) -> Self {
        self.db_pool = Some(db_pool);
        self
    }

    /// Create a clone of the orchestrator with a custom direct IPC channel
    pub fn clone_with_channel(
        &self,
        channel: Option<tauri::ipc::Channel<serde_json::Value>>,
    ) -> Self {
        Self {
            app: self.app.clone(),
            ctx: self.ctx.clone(),
            agent_registry: self.agent_registry.clone(),
            tool_registry: self.tool_registry.clone(),
            hook_registry: self.hook_registry.clone(),
            permissions: self.permissions.clone(),
            tool_manager: self.tool_manager.clone(),
            db_pool: self.db_pool.clone(),
            on_event: channel,
        }
    }
}
