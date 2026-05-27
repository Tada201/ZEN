use crate::agent::task::{Task, TaskStatus};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// A workflow definition specifies a set of tasks and their dependencies.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowDefinition {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    /// Tasks to execute.
    pub tasks: Vec<Task>,
    /// If true, rollback all completed tasks on any failure.
    pub rollback_on_failure: bool,
    /// Maximum concurrent tasks (0 = unlimited).
    pub max_concurrent: usize,
    /// Nested workflow (workflow as a task).
    pub nested_workflow: Option<Box<WorkflowDefinition>>,
}

impl WorkflowDefinition {
    /// Create a new workflow definition.
    pub fn new(id: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            description: None,
            tasks: Vec::new(),
            rollback_on_failure: false,
            max_concurrent: 0,
            nested_workflow: None,
        }
    }

    /// Add a task to the workflow.
    pub fn with_task(mut self, task: Task) -> Self {
        self.tasks.push(task);
        self
    }

    /// Set rollback on failure flag.
    pub fn with_rollback(mut self, enabled: bool) -> Self {
        self.rollback_on_failure = enabled;
        self
    }

    /// Set maximum concurrent tasks.
    pub fn with_max_concurrent(mut self, max: usize) -> Self {
        self.max_concurrent = max;
        self
    }

    /// Validate the workflow (check for circular dependencies).
    pub fn validate(&self) -> Result<(), WorkflowError> {
        let _ = Task::resolve_execution_order(self.tasks.clone())
            .map_err(|e| WorkflowError::CircularDependency(e.to_string()))?;
        Ok(())
    }
}

/// Runtime state of a workflow execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowExecutionState {
    Pending,
    Running {
        completed: usize,
        total: usize,
    },
    Paused {
        completed: usize,
        total: usize,
    },
    Completed {
        success: bool,
    },
    Failed {
        error: String,
        failed_task_id: Option<String>,
    },
    RollingBack {
        rolled_back: usize,
        total: usize,
    },
}

/// Runtime execution context for a workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowExecution {
    pub definition: WorkflowDefinition,
    pub state: WorkflowExecutionState,
    pub task_results: HashMap<String, TaskResult>,
    pub completed_tasks: HashSet<String>,
    pub running_tasks: HashSet<String>,
    pub failed_tasks: Vec<String>,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
}

impl WorkflowExecution {
    /// Create a new workflow execution from a definition.
    pub fn new(definition: WorkflowDefinition) -> Self {
        Self {
            definition,
            state: WorkflowExecutionState::Pending,
            task_results: HashMap::new(),
            completed_tasks: HashSet::new(),
            running_tasks: HashSet::new(),
            failed_tasks: Vec::new(),
            started_at: None,
            completed_at: None,
        }
    }

    /// Get the progress percentage (0-100).
    pub fn progress(&self) -> f64 {
        match &self.state {
            WorkflowExecutionState::Running { completed, total }
            | WorkflowExecutionState::Paused { completed, total } => {
                if *total == 0 {
                    100.0
                } else {
                    (*completed as f64 / *total as f64) * 100.0
                }
            }
            WorkflowExecutionState::Completed { success } => {
                if *success {
                    100.0
                } else {
                    0.0
                }
            }
            WorkflowExecutionState::Failed { .. } => 0.0,
            WorkflowExecutionState::Pending => 0.0,
            WorkflowExecutionState::RollingBack { rolled_back, total } => {
                if *total == 0 {
                    100.0
                } else {
                    (*rolled_back as f64 / *total as f64) * 100.0
                }
            }
        }
    }

    /// Check if all dependencies for a task are resolved.
    pub fn are_dependencies_met(&self, task: &Task) -> bool {
        task.dependencies
            .iter()
            .all(|dep| self.completed_tasks.contains(dep))
    }

    /// Get the next tasks that are ready to execute.
    pub fn get_ready_tasks(&self) -> Vec<&Task> {
        self.definition
            .tasks
            .iter()
            .filter(|t| {
                t.status == TaskStatus::Pending
                    && !self.running_tasks.contains(&t.id)
                    && self.are_dependencies_met(t)
            })
            .collect()
    }
}

/// Result of a task execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResult {
    pub task_id: String,
    pub success: bool,
    pub output: String,
    pub duration_ms: u64,
    pub error: Option<String>,
    /// Callback to run on rollback.
    pub on_rollback: Option<String>,
}

/// Events emitted during workflow execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WorkflowEvent {
    WorkflowStarted {
        workflow_id: String,
        workflow_name: String,
        total_tasks: usize,
    },
    WorkflowTaskStarted {
        workflow_id: String,
        task_id: String,
        task_name: String,
    },
    WorkflowTaskComplete {
        workflow_id: String,
        task_id: String,
        success: bool,
        duration_ms: u64,
    },
    WorkflowPaused {
        workflow_id: String,
        completed: usize,
        total: usize,
    },
    WorkflowResumed {
        workflow_id: String,
    },
    WorkflowRolledBack {
        workflow_id: String,
        rolled_back_count: usize,
    },
    WorkflowCompleted {
        workflow_id: String,
        success: bool,
        duration_ms: u64,
    },
    WorkflowFailed {
        workflow_id: String,
        error: String,
        failed_task_id: Option<String>,
    },
}

/// Metrics for a workflow execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowMetrics {
    pub workflow_id: String,
    pub total_tasks: usize,
    pub completed_tasks: usize,
    pub failed_tasks: usize,
    pub skipped_tasks: usize,
    pub total_duration_ms: u64,
    pub avg_task_duration_ms: f64,
    pub success_rate: f64,
}

impl WorkflowMetrics {
    /// Calculate metrics from a workflow execution.
    pub fn from_execution(exec: &WorkflowExecution) -> Self {
        let total = exec.definition.tasks.len();
        let completed = exec.completed_tasks.len();
        let failed = exec.failed_tasks.len();
        let total_duration: u64 = exec.task_results.values().map(|r| r.duration_ms).sum();

        let avg_duration = if completed > 0 {
            total_duration as f64 / completed as f64
        } else {
            0.0
        };

        let success_rate = if completed > 0 {
            (completed - failed) as f64 / completed as f64
        } else {
            0.0
        };

        Self {
            workflow_id: exec.definition.id.clone(),
            total_tasks: total,
            completed_tasks: completed,
            failed_tasks: failed,
            skipped_tasks: total - completed - failed,
            total_duration_ms: total_duration,
            avg_task_duration_ms: avg_duration,
            success_rate,
        }
    }
}

/// Result of a workflow execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowResult {
    pub workflow_id: String,
    pub success: bool,
    pub tasks_completed: usize,
    pub duration_ms: u64,
}

#[derive(Debug, thiserror::Error)]
pub enum WorkflowError {
    #[error("Workflow not found: {0}")]
    WorkflowNotFound(String),

    #[error("Task failed: {0}")]
    TaskFailed(String),

    #[error("Circular dependency detected: {0}")]
    CircularDependency(String),

    #[error("Invalid workflow state: {0}")]
    InvalidState(String),

    #[error("Rollback failed: {0}")]
    RollbackFailed(String),

    #[error("Workflow validation failed: {0}")]
    ValidationError(String),
}
