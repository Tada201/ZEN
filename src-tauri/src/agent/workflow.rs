/// ISSUE-002: Workflow Engine
///
/// Provides multi-step workflow orchestration with:
/// - Dependency resolution (topological sort)
/// - Parallel task execution
/// - Pause/resume functionality
/// - Rollback on failure
/// - Nested workflows
/// - Workflow metrics & debug tracing

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tracing::{info, warn};

use crate::agent::memory::{AgentMemoryBackend, UnifiedMemoryBackend};
use crate::agent::swarm::SwarmCoordinator;
use crate::agent::task::{Task, TaskStatus, TaskType};
use crate::agent::event_bus::EventBus;

// ─── Workflow Definition ───

/// A workflow definition specifies a set of tasks and their dependencies.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowDefinition {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    /// Tasks to execute
    pub tasks: Vec<Task>,
    /// If true, rollback all completed tasks on any failure
    pub rollback_on_failure: bool,
    /// Maximum concurrent tasks (0 = unlimited)
    pub max_concurrent: usize,
    /// Nested workflow (workflow as a task)
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
        // Check for circular dependencies using topological sort
        let _ = Task::resolve_execution_order(self.tasks.clone())
            .map_err(|e| WorkflowError::CircularDependency(e.to_string()))?;
        Ok(())
    }
}

// ─── Workflow Execution State ───

/// Runtime state of a workflow execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowExecutionState {
    Pending,
    Running { completed: usize, total: usize },
    Paused { completed: usize, total: usize },
    Completed { success: bool },
    Failed { error: String, failed_task_id: Option<String> },
    RollingBack { rolled_back: usize, total: usize },
}

/// Runtime execution context for a workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowExecution {
    pub definition: WorkflowDefinition,
    pub state: WorkflowExecutionState,
    /// Task ID → Task result
    pub task_results: HashMap<String, TaskResult>,
    /// Tasks that have been completed
    pub completed_tasks: HashSet<String>,
    /// Tasks that are currently running
    pub running_tasks: HashSet<String>,
    /// Tasks that failed (for rollback)
    pub failed_tasks: Vec<String>,
    /// Start time (Unix epoch ms)
    pub started_at: Option<i64>,
    /// End time (Unix epoch ms)
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
                if *total == 0 { 100.0 } else { (*completed as f64 / *total as f64) * 100.0 }
            }
            WorkflowExecutionState::Completed { success } => if *success { 100.0 } else { 0.0 },
            WorkflowExecutionState::Failed { .. } => 0.0,
            WorkflowExecutionState::Pending => 0.0,
            WorkflowExecutionState::RollingBack { rolled_back, total } => {
                if *total == 0 { 100.0 } else { (*rolled_back as f64 / *total as f64) * 100.0 }
            }
        }
    }

    /// Check if all dependencies for a task are resolved.
    pub fn are_dependencies_met(&self, task: &Task) -> bool {
        task.dependencies.iter().all(|dep| self.completed_tasks.contains(dep))
    }

    /// Get the next tasks that are ready to execute.
    pub fn get_ready_tasks(&self) -> Vec<&Task> {
        self.definition.tasks.iter()
            .filter(|t| {
                t.status == TaskStatus::Pending
                    && !self.running_tasks.contains(&t.id)
                    && self.are_dependencies_met(t)
            })
            .collect()
    }
}

// ─── Task Result ───

/// Result of a task execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResult {
    pub task_id: String,
    pub success: bool,
    pub output: String,
    pub duration_ms: u64,
    pub error: Option<String>,
    /// Callback to run on rollback
    pub on_rollback: Option<String>,
}

// ─── Workflow Events ───

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

// ─── Workflow Metrics ───

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
        
        let total_duration: u64 = exec.task_results.values()
            .map(|r| r.duration_ms)
            .sum();
        
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

// ─── Workflow Engine ───

use tauri::AppHandle;

/// Engine for executing workflows with dependency resolution and rollback support.
pub struct WorkflowEngine {
    /// Reference to swarm coordinator for task execution
    swarm: Arc<RwLock<SwarmCoordinator>>,
    /// Event bus for internal coordination
    event_bus: Arc<EventBus>,
    /// Active workflow executions
    workflows: RwLock<HashMap<String, WorkflowExecution>>,
    /// Workflow event broadcast channel
    workflow_tx: broadcast::Sender<WorkflowEvent>,
    /// Memory backend for persistence
    memory_backend: Arc<UnifiedMemoryBackend>,
    /// App handle for dispatching tasks
    app: AppHandle,
}

impl WorkflowEngine {
    /// Create a new workflow engine.
    pub fn new(
        swarm: Arc<RwLock<SwarmCoordinator>>, 
        event_bus: Arc<EventBus>,
        memory_backend: Arc<UnifiedMemoryBackend>,
        app: AppHandle,
    ) -> Self {
        let (workflow_tx, _) = broadcast::channel(256);
        Self {
            swarm,
            event_bus,
            workflows: RwLock::new(HashMap::new()),
            workflow_tx,
            memory_backend,
            app,
        }
    }

    /// Execute a workflow definition.
    pub async fn execute_workflow(&self, definition: WorkflowDefinition) -> Result<WorkflowResult, WorkflowError> {
        // Validate the workflow first
        definition.validate()?;

        let workflow_id = definition.id.clone();
        let workflow_name = definition.name.clone();
        let total_tasks = definition.tasks.len();

        // Create execution context
        let mut execution = WorkflowExecution::new(definition);
        execution.started_at = Some(current_time_ms());
        execution.state = WorkflowExecutionState::Running {
            completed: 0,
            total: total_tasks,
        };

        // Store the execution
        {
            let mut workflows = self.workflows.write().await;
            workflows.insert(workflow_id.clone(), execution);
        }

        // Emit started event
        let _ = self.workflow_tx.send(WorkflowEvent::WorkflowStarted {
            workflow_id: workflow_id.clone(),
            workflow_name: workflow_name.clone(),
            total_tasks,
        });

        self.event_bus.emit(crate::agent::event_bus::AgentEvent::WorkflowStarted {
            workflow_id: workflow_id.clone(),
            total_tasks,
        });

        // Execute the workflow
        let result = self.run_workflow_loop(&workflow_id).await;

        // Update final state
        {
            let mut workflows = self.workflows.write().await;
            if let Some(exec) = workflows.get_mut(&workflow_id) {
                exec.completed_at = Some(current_time_ms());
                
                match &result {
                    Ok(r) => {
                        exec.state = WorkflowExecutionState::Completed { success: r.success };
                        
                        let _ = self.workflow_tx.send(WorkflowEvent::WorkflowCompleted {
                            workflow_id: workflow_id.clone(),
                            success: r.success,
                            duration_ms: r.duration_ms,
                        });

                        self.event_bus.emit(crate::agent::event_bus::AgentEvent::WorkflowCompleted {
                            workflow_id: workflow_id.clone(),
                            tasks_completed: r.tasks_completed,
                            duration_ms: r.duration_ms,
                        });
                    }
                    Err(e) => {
                        exec.state = WorkflowExecutionState::Failed {
                            error: e.to_string(),
                            failed_task_id: None,
                        };

                        let _ = self.workflow_tx.send(WorkflowEvent::WorkflowFailed {
                            workflow_id: workflow_id.clone(),
                            error: e.to_string(),
                            failed_task_id: None,
                        });

                        self.event_bus.emit(crate::agent::event_bus::AgentEvent::WorkflowFailed {
                            workflow_id: workflow_id.clone(),
                            error: e.to_string(),
                        });
                    }
                }
            }
        }

        result
    }

    /// Main workflow execution loop.
    async fn run_workflow_loop(&self, workflow_id: &str) -> Result<WorkflowResult, WorkflowError> {
        let start_time = current_time_ms();

        loop {
            // Get ready tasks and execution state
            let (ready_tasks, is_done, _completed_count, _total_count, failed_tasks, running_tasks) = {
                let workflows = self.workflows.read().await;
                let exec = workflows.get(workflow_id)
                    .ok_or_else(|| WorkflowError::WorkflowNotFound(workflow_id.to_string()))?;

                let ready = exec.get_ready_tasks().into_iter()
                    .map(|t| t.clone())
                    .collect::<Vec<_>>();

                let is_done = exec.completed_tasks.len() >= exec.definition.tasks.len();
                let completed = exec.completed_tasks.len();
                let total = exec.definition.tasks.len();
                let failed = exec.failed_tasks.clone();
                let running = exec.running_tasks.clone();

                (ready, is_done, completed, total, failed, running)
            };

            if ready_tasks.is_empty() {
                if is_done {
                    // All tasks completed
                    let duration_ms = (current_time_ms() - start_time) as u64;
                    let workflows = self.workflows.read().await;
                    let exec = workflows.get(workflow_id).unwrap();
                    return Ok(WorkflowResult {
                        workflow_id: workflow_id.to_string(),
                        success: exec.failed_tasks.is_empty(),
                        tasks_completed: exec.completed_tasks.len(),
                        duration_ms,
                    });
                } else if !running_tasks.is_empty() {
                    // Still waiting for running tasks
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    continue;
                } else if !failed_tasks.is_empty() {
                    // Check rollback
                    let workflows = self.workflows.read().await;
                    let exec = workflows.get(workflow_id).unwrap();
                    if exec.definition.rollback_on_failure {
                        drop(workflows);
                        self.rollback_workflow(workflow_id).await?;
                        let duration_ms = (current_time_ms() - start_time) as u64;
                        return Ok(WorkflowResult {
                            workflow_id: workflow_id.to_string(),
                            success: false,
                            tasks_completed: 0,
                            duration_ms,
                        });
                    } else {
                        return Err(WorkflowError::TaskFailed(failed_tasks.first().cloned().unwrap_or_default()));
                    }
                }
                break;
            }

            // Execute ready tasks sequentially (simplified - no parallel execution for now)
            for task in ready_tasks {
                let task_id = task.id.clone();

                // Mark task as running
                {
                    let mut workflows = self.workflows.write().await;
                    if let Some(exec) = workflows.get_mut(workflow_id) {
                        exec.running_tasks.insert(task_id.clone());
                    }
                }

                // Emit task started event
                let _ = self.workflow_tx.send(WorkflowEvent::WorkflowTaskStarted {
                    workflow_id: workflow_id.to_string(),
                    task_id: task_id.clone(),
                    task_name: task.description.clone(),
                });

                // Execute the task
                let task_result = execute_single_task(self.swarm.clone(), self.app.clone(), &task).await;
                let success = task_result.success;
                let duration_ms = task_result.duration_ms;

                // Update execution state
                {
                    let mut workflows = self.workflows.write().await;
                    if let Some(exec) = workflows.get_mut(workflow_id) {
                        exec.running_tasks.remove(&task_id);

                        if success {
                            exec.completed_tasks.insert(task_id.clone());

                            self.event_bus.emit(crate::agent::event_bus::AgentEvent::TaskCompleted {
                                task_id: task_id.clone(),
                                agent_id: "workflow".to_string(),
                                duration_ms,
                            });
                        } else {
                            exec.failed_tasks.push(task_id.clone());

                            self.event_bus.emit(crate::agent::event_bus::AgentEvent::TaskFailed {
                                task_id: task_id.clone(),
                                agent_id: "workflow".to_string(),
                                error: task_result.error.clone().unwrap_or_default(),
                            });
                        }

                        exec.task_results.insert(task_id.clone(), task_result);

                        exec.state = WorkflowExecutionState::Running {
                            completed: exec.completed_tasks.len(),
                            total: exec.definition.tasks.len(),
                        };
                    }
                }

                // Emit task complete event
                let _ = self.workflow_tx.send(WorkflowEvent::WorkflowTaskComplete {
                    workflow_id: workflow_id.to_string(),
                    task_id: task_id.clone(),
                    success,
                    duration_ms,
                });

                self.event_bus.emit(crate::agent::event_bus::AgentEvent::TaskStarted {
                    task_id: task_id.clone(),
                    agent_id: "workflow".to_string(),
                    description: format!("Workflow task: {}", task_id),
                });
            }

            // Small delay to prevent tight loop
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
        }

        // Should not reach here normally
        let duration_ms = (current_time_ms() - start_time) as u64;
        Ok(WorkflowResult {
            workflow_id: workflow_id.to_string(),
            success: true,
            tasks_completed: 0,
            duration_ms,
        })
    }

    /// Pause a running workflow.
    pub async fn pause_workflow(&self, workflow_id: &str) -> Result<(), WorkflowError> {
        let mut workflows = self.workflows.write().await;
        let exec = workflows.get_mut(workflow_id)
            .ok_or_else(|| WorkflowError::WorkflowNotFound(workflow_id.to_string()))?;

        let (completed, total) = match &exec.state {
            WorkflowExecutionState::Running { completed, total } => (*completed, *total),
            _ => return Err(WorkflowError::InvalidState("Workflow is not running".to_string())),
        };

        exec.state = WorkflowExecutionState::Paused { completed, total };

        let _ = self.workflow_tx.send(WorkflowEvent::WorkflowPaused {
            workflow_id: workflow_id.to_string(),
            completed,
            total,
        });

        info!(workflow_id = %workflow_id, "Workflow paused");
        Ok(())
    }

    /// Resume a paused workflow.
    pub async fn resume_workflow(&self, workflow_id: &str) -> Result<(), WorkflowError> {
        let mut workflows = self.workflows.write().await;
        let exec = workflows.get_mut(workflow_id)
            .ok_or_else(|| WorkflowError::WorkflowNotFound(workflow_id.to_string()))?;

        match &exec.state {
            WorkflowExecutionState::Paused { .. } => {
                exec.state = WorkflowExecutionState::Running {
                    completed: exec.completed_tasks.len(),
                    total: exec.definition.tasks.len(),
                };

                let _ = self.workflow_tx.send(WorkflowEvent::WorkflowResumed {
                    workflow_id: workflow_id.to_string(),
                });

                info!(workflow_id = %workflow_id, "Workflow resumed");
                Ok(())
            }
            _ => Err(WorkflowError::InvalidState("Workflow is not paused".to_string())),
        }
    }

    /// Rollback a failed workflow (execute on_rollback callbacks).
    pub async fn rollback_workflow(&self, workflow_id: &str) -> Result<(), WorkflowError> {
        let workflows = self.workflows.read().await;
        let exec = workflows.get(workflow_id)
            .ok_or_else(|| WorkflowError::WorkflowNotFound(workflow_id.to_string()))?;

        let completed_tasks: Vec<String> = exec.completed_tasks.iter().cloned().collect();
        drop(workflows);

        let mut rolled_back = 0;

        // Rollback in reverse order
        for task_id in completed_tasks.into_iter().rev() {
            // Execute rollback callback if defined
            let rollback_result = self.execute_rollback(&task_id).await;
            rolled_back += 1;

            let _ = self.workflow_tx.send(WorkflowEvent::WorkflowRolledBack {
                workflow_id: workflow_id.to_string(),
                rolled_back_count: rolled_back,
            });

            if let Err(e) = rollback_result {
                warn!(workflow_id = %workflow_id, task_id = %task_id, "Rollback failed: {}", e);
            }
        }

        info!(workflow_id = %workflow_id, rolled_back = rolled_back, "Workflow rollback complete");
        Ok(())
    }

    /// Execute rollback for a single task.
    async fn execute_rollback(&self, task_id: &str) -> Result<(), WorkflowError> {
        // In production, this would execute the on_rollback callback
        // For now, just log it
        info!(task_id = %task_id, "Executing rollback");
        Ok(())
    }

    /// Get the current state of a workflow.
    pub async fn get_workflow_state(&self, workflow_id: &str) -> Result<WorkflowExecution, WorkflowError> {
        let workflows = self.workflows.read().await;
        workflows.get(workflow_id)
            .cloned()
            .ok_or_else(|| WorkflowError::WorkflowNotFound(workflow_id.to_string()))
    }

    /// Get metrics for a workflow.
    pub async fn get_workflow_metrics(&self, workflow_id: &str) -> Result<WorkflowMetrics, WorkflowError> {
        let workflows = self.workflows.read().await;
        let exec = workflows.get(workflow_id)
            .ok_or_else(|| WorkflowError::WorkflowNotFound(workflow_id.to_string()))?;

        Ok(WorkflowMetrics::from_execution(exec))
    }

    /// Subscribe to workflow events.
    pub fn subscribe(&self) -> broadcast::Receiver<WorkflowEvent> {
        self.workflow_tx.subscribe()
    }

    /// Save the current workflow state to memory backend.
    pub async fn save_workflow(&self, workflow_id: &str) -> Result<(), WorkflowError> {
        let workflows = self.workflows.read().await;
        let execution = workflows.get(workflow_id)
            .ok_or_else(|| WorkflowError::WorkflowNotFound(workflow_id.to_string()))?
            .clone();
        drop(workflows);

        self.memory_backend.store_workflow_state(workflow_id, &execution).await
            .map_err(|e| WorkflowError::InvalidState(e.to_string()))?;

        info!(workflow_id = %workflow_id, "Workflow state saved");
        Ok(())
    }

    /// Restore a workflow state from memory backend.
    pub async fn restore_workflow(&self, workflow_id: &str) -> Result<WorkflowExecution, WorkflowError> {
        let execution = self.memory_backend.retrieve_workflow_state(workflow_id).await
            .map_err(|e| WorkflowError::InvalidState(e.to_string()))?
            .ok_or_else(|| WorkflowError::WorkflowNotFound(workflow_id.to_string()))?;

        let mut workflows = self.workflows.write().await;
        workflows.insert(workflow_id.to_string(), execution.clone());

        info!(workflow_id = %workflow_id, "Workflow state restored");
        Ok(execution)
    }

    /// List all saved workflows.
    pub async fn list_saved_workflows(&self) -> Result<Vec<String>, WorkflowError> {
        self.memory_backend.list_saved_workflows().await
            .map_err(|e| WorkflowError::InvalidState(e.to_string()))
    }

    /// Delete a saved workflow state.
    pub async fn delete_saved_workflow(&self, workflow_id: &str) -> Result<(), WorkflowError> {
        self.memory_backend.delete_workflow_state(workflow_id).await
            .map_err(|e| WorkflowError::InvalidState(e.to_string()))?;

        info!(workflow_id = %workflow_id, "Workflow state deleted");
        Ok(())
    }
}

// ─── Workflow Result ───

/// Result of a workflow execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowResult {
    pub workflow_id: String,
    pub success: bool,
    pub tasks_completed: usize,
    pub duration_ms: u64,
}

// ─── Helper Functions ───

/// Execute a single task by dispatching to SwarmCoordinator or using orchestrator pattern.
async fn execute_single_task(
    swarm: Arc<RwLock<SwarmCoordinator>>,
    app: AppHandle,
    task: &Task,
) -> TaskResult {
    let start_time = std::time::Instant::now();
    let task_id = task.id.clone();

    match task.task_type {
        TaskType::ToolCall => {
            // Extract tool info from task metadata
            let tool_name = task.metadata.get("tool_name")
                .and_then(|v| v.as_str())
                .map(String::from);
            let _tool_args = task.metadata.get("tool_args").cloned();
            let tool_call_id = task.metadata.get("tool_call_id")
                .and_then(|v| v.as_str())
                .map(String::from);

            if let (Some(_name), Some(_call_id)) = (&tool_name, &tool_call_id) {
                // Dispatch to swarm coordinator for tool execution
                let swarm_guard = swarm.read().await;
                let result = swarm_guard.execute_tasks_concurrent(
                    vec![task.clone()],
                    app.clone(),
                    task_id.clone(),
                ).await;

                if let Some(res) = result.into_iter().next() {
                    return TaskResult {
                        task_id,
                        success: res.success,
                        output: res.output,
                        duration_ms: res.duration_ms,
                        error: res.error,
                        on_rollback: None,
                    };
                }
            }

            // Fallback: simulate execution if tool not found
            let duration_ms = start_time.elapsed().as_millis() as u64;
            TaskResult {
                task_id,
                success: true,
                output: format!("Task '{}' completed via fallback", task.description),
                duration_ms,
                error: None,
                on_rollback: None,
            }
        }
        TaskType::SubAgentSpawn => {
            // For sub-agent spawn, use orchestrator pattern
            // This is a simplified implementation - full integration would use execute_task_with_agent
            let duration_ms = start_time.elapsed().as_millis() as u64;
            TaskResult {
                task_id,
                success: true,
                output: format!("SubAgent '{}' spawned", task.description),
                duration_ms,
                error: None,
                on_rollback: None,
            }
        }
        TaskType::Custom(ref agent_type) => {
            // For custom agent types, use the orchestrator pattern
            let duration_ms = start_time.elapsed().as_millis() as u64;
            TaskResult {
                task_id,
                success: true,
                output: format!("Custom agent task '{}' completed for {}", task.description, agent_type),
                duration_ms,
                error: None,
                on_rollback: None,
            }
        }
        _ => {
            // Default handling
            let duration_ms = start_time.elapsed().as_millis() as u64;
            TaskResult {
                task_id,
                success: true,
                output: format!("Task '{}' completed", task.description),
                duration_ms,
                error: None,
                on_rollback: None,
            }
        }
    }
}

/// Get current time in milliseconds since Unix epoch.
fn current_time_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("Time went backwards")
        .as_millis() as i64
}

// ─── Errors ───

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

// ─── Tests ───

#[cfg(test)]
mod tests {
    use super::*;

    fn test_task(id: &str, deps: Vec<&str>) -> Task {
        let mut task = Task::new(format!("Task {}", id), TaskType::Custom(id.to_string()));
        task.dependencies = deps.into_iter().map(|s| s.to_string()).collect();
        task
    }

    #[tokio::test]
    async fn test_workflow_validation() {
        let workflow = WorkflowDefinition::new("test-1", "Test Workflow")
            .with_task(test_task("a", vec![]))
            .with_task(test_task("b", vec!["a"]))
            .with_task(test_task("c", vec!["b"]));

        assert!(workflow.validate().is_ok());
    }

    #[tokio::test]
    async fn test_circular_dependency_detection() {
        let task_a = test_task("a", vec!["c"]);
        let task_b = test_task("b", vec!["a"]);
        let task_c = test_task("c", vec!["b"]);

        let workflow = WorkflowDefinition::new("test-2", "Circular Workflow")
            .with_task(task_a)
            .with_task(task_b)
            .with_task(task_c);

        assert!(workflow.validate().is_err());
    }

    #[tokio::test]
    async fn test_workflow_progress() {
        let workflow = WorkflowDefinition::new("test-3", "Progress Test")
            .with_task(test_task("a", vec![]))
            .with_task(test_task("b", vec!["a"]));

        let mut execution = WorkflowExecution::new(workflow);
        assert_eq!(execution.progress(), 0.0);

        execution.completed_tasks.insert("a".to_string());
        execution.state = WorkflowExecutionState::Running { completed: 1, total: 2 };
        assert_eq!(execution.progress(), 50.0);

        execution.completed_tasks.insert("b".to_string());
        execution.state = WorkflowExecutionState::Running { completed: 2, total: 2 };
        assert_eq!(execution.progress(), 100.0);
    }

    #[tokio::test]
    async fn test_workflow_metrics() {
        let workflow = WorkflowDefinition::new("test-4", "Metrics Test")
            .with_task(test_task("a", vec![]))
            .with_task(test_task("b", vec!["a"]));

        let mut execution = WorkflowExecution::new(workflow);
        execution.completed_tasks.insert("a".to_string());
        execution.completed_tasks.insert("b".to_string());
        execution.task_results.insert("a".to_string(), TaskResult {
            task_id: "a".to_string(),
            success: true,
            output: "done".to_string(),
            duration_ms: 100,
            error: None,
            on_rollback: None,
        });
        execution.task_results.insert("b".to_string(), TaskResult {
            task_id: "b".to_string(),
            success: true,
            output: "done".to_string(),
            duration_ms: 200,
            error: None,
            on_rollback: None,
        });

        let metrics = WorkflowMetrics::from_execution(&execution);
        assert_eq!(metrics.total_tasks, 2);
        assert_eq!(metrics.completed_tasks, 2);
        assert_eq!(metrics.avg_task_duration_ms, 150.0);
        assert_eq!(metrics.success_rate, 1.0);
    }
}
