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

use crate::hooks::HookRegistry;
use crate::task::Task;
use crate::types::AgentRegistry;
use crate::context::AgentContext;
use sqlx::SqlitePool;

/// Orchestrator for managing complex multi-agent workflows
pub struct Orchestrator {
    /// Phase 6 seam: shared service handles (same Arcs as AppState).
    pub(crate) ctx: AgentContext,
    agent_registry: Arc<AgentRegistry>,
    hook_registry: Arc<HookRegistry>,
    pub(crate) db_pool: Option<SqlitePool>,
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
        ctx: AgentContext,
        agent_registry: Arc<AgentRegistry>,
        hook_registry: Arc<HookRegistry>,
    ) -> Self {
        Self {
            ctx,
            agent_registry,
            hook_registry,
            db_pool: None,
        }
    }

    /// Internal helper to emit events to the frontend
    pub(crate) fn emit(&self, event: crate::event_bus::AgentEvent) -> Result<()> {
        event.emit_to(self.ctx.events.as_ref());
        Ok(())
    }

    /// Set the database pool for intermediate saves
    pub fn with_db_pool(mut self, db_pool: SqlitePool) -> Self {
        self.db_pool = Some(db_pool);
        self
    }
}
