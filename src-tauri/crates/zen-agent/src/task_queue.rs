use crate::task::{Task, TaskCycleError, TaskStatus};
use crate::utils::now_ms;
/// Agentic Swarm Phase 3: Task Queue System
///
/// Provides a priority-based task queue with:
/// - Topological sort for dependency-aware execution
/// - Retry logic with Plan B generation
/// - Task status tracking
/// - Dynamic task addition during execution
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// Maximum retry attempts per task before marking as failed
const MAX_TASK_RETRIES: usize = 3;

/// A task in the execution queue with retry tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueuedTask {
    /// The underlying task
    pub task: Task,
    /// Number of times this task has been retried
    pub retry_count: usize,
    /// Alternative approach to try on next retry (Plan B)
    pub alternative_approach: Option<String>,
    /// When this task was added to the queue
    pub queued_at: i64,
    /// Tags for categorizing tasks (e.g., "orchestrator", "subagent")
    pub tags: Vec<String>,
}

impl QueuedTask {
    /// Create a new queued task from a task
    pub fn from_task(task: Task) -> Self {
        Self {
            task,
            retry_count: 0,
            alternative_approach: None,
            queued_at: now_ms(),
            tags: Vec::new(),
        }
    }

    /// Mark this task for retry with an alternative approach
    pub fn retry_with_plan_b(mut self, plan_b: String) -> Self {
        self.retry_count += 1;
        self.alternative_approach = Some(plan_b);
        self.task.status = TaskStatus::Pending;
        self.task.error = None;
        self
    }

    /// Check if this task can be retried
    pub fn can_retry(&self) -> bool {
        self.retry_count < MAX_TASK_RETRIES && self.task.status.is_terminal()
    }

    /// Get a summary of this task for display
    pub fn summary(&self) -> String {
        format!(
            "{} [{:?}] - {} (retries: {})",
            self.task.id, self.task.priority, self.task.description, self.retry_count
        )
    }
}

/// Priority-aware task queue with dependency resolution
pub struct TaskQueue {
    /// All tasks in the queue
    tasks: Vec<QueuedTask>,
    /// Set of completed task IDs
    completed: HashSet<String>,
    /// Set of failed task IDs
    failed: HashSet<String>,
    /// Task execution history (for debugging and analytics)
    history: Vec<TaskExecutionRecord>,
    /// Tasks handed out by pop_next/pop_all_ready that have not yet been
    /// marked completed or failed. Without this, mark_failed/retry could
    /// never see a task that was actually executing.
    running: HashMap<String, QueuedTask>,
}

/// Record of a task execution for history tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskExecutionRecord {
    pub task_id: String,
    pub description: String,
    pub status: TaskStatus,
    pub executed_at: i64,
    pub duration_ms: Option<i64>,
    pub error: Option<String>,
    pub retry_count: usize,
}

impl TaskQueue {
    /// Create a new empty task queue
    pub fn new() -> Self {
        Self {
            tasks: Vec::new(),
            completed: HashSet::new(),
            failed: HashSet::new(),
            history: Vec::new(),
            running: HashMap::new(),
        }
    }

    /// Create a task queue from a list of tasks
    pub fn from_tasks(tasks: Vec<Task>) -> Self {
        let mut queue = Self::new();
        for task in tasks {
            queue.push(QueuedTask::from_task(task));
        }
        queue
    }

    /// Add a task to the queue
    pub fn push(&mut self, task: QueuedTask) {
        self.tasks.push(task);
    }

    /// Add multiple tasks to the queue
    pub fn extend(&mut self, tasks: Vec<QueuedTask>) {
        self.tasks.extend(tasks);
    }

    /// Get the next task ready for execution (dependencies resolved, highest priority)
    ///
    /// Returns None if no tasks are ready (either queue is empty or all tasks are blocked)
    pub fn pop_next(&mut self) -> Option<QueuedTask> {
        // Find all tasks that are ready (dependencies resolved)
        let mut ready_indices: Vec<usize> = self
            .tasks
            .iter()
            .enumerate()
            .filter_map(|(idx, task)| {
                if task.task.status == TaskStatus::Pending
                    && task.task.are_dependencies_resolved(&self.completed)
                {
                    Some(idx)
                } else {
                    None
                }
            })
            .collect();

        if ready_indices.is_empty() {
            return None;
        }

        // Sort by priority (Critical first, then High, Medium, Low)
        ready_indices.sort_by(|&a, &b| {
            self.tasks[a]
                .task
                .priority
                .cmp(&self.tasks[b].task.priority)
        });

        // Take the highest priority ready task
        let next_idx = ready_indices[0];
        let mut next_task = self.tasks.remove(next_idx);
        next_task.task.start();
        self.running
            .insert(next_task.task.id.clone(), next_task.clone());
        Some(next_task)
    }

    /// Get ALL tasks ready for execution (dependencies resolved).
    /// Used for parallel execution in swarm mode. Tasks are sorted by priority.
    pub fn pop_all_ready(&mut self) -> Vec<QueuedTask> {
        let ready_indices: Vec<usize> = self
            .tasks
            .iter()
            .enumerate()
            .filter_map(|(idx, task)| {
                if task.task.status == TaskStatus::Pending
                    && task.task.are_dependencies_resolved(&self.completed)
                {
                    Some(idx)
                } else {
                    None
                }
            })
            .collect();

        if ready_indices.is_empty() {
            return Vec::new();
        }

        // Collect tasks (remove in reverse index order to preserve positions)
        let mut indices = ready_indices;
        indices.sort_by(|a, b| b.cmp(a)); // Reverse order for safe removal

        let mut tasks: Vec<QueuedTask> = indices
            .into_iter()
            .map(|idx| self.tasks.remove(idx))
            .collect();

        // Sort by priority (Critical first)
        tasks.sort_by_key(|a| a.task.priority);

        // Mark all as started
        for task in &mut tasks {
            task.task.start();
        }

        tasks
    }

    /// Mark a task as completed
    pub fn mark_completed(&mut self, task_id: &str, duration_ms: Option<i64>) {
        self.completed.insert(task_id.to_string());
        self.running.remove(task_id);

        // Update task status if still in queue
        if let Some(task) = self.tasks.iter_mut().find(|t| t.task.id == task_id) {
            task.task.complete();
            self.history.push(TaskExecutionRecord {
                task_id: task_id.to_string(),
                description: task.task.description.clone(),
                status: TaskStatus::Completed,
                executed_at: now_ms(),
                duration_ms,
                error: None,
                retry_count: task.retry_count,
            });
        }
    }

    /// Mark a task as failed
    pub fn mark_failed(&mut self, task_id: &str, error: &str, duration_ms: Option<i64>) {
        self.failed.insert(task_id.to_string());

        // Update task status if still in queue
        if let Some(task) = self.tasks.iter_mut().find(|t| t.task.id == task_id) {
            task.task.fail(error);
            self.history.push(TaskExecutionRecord {
                task_id: task_id.to_string(),
                description: task.task.description.clone(),
                status: TaskStatus::Failed,
                executed_at: now_ms(),
                duration_ms,
                error: Some(error.to_string()),
                retry_count: task.retry_count,
            });
        } else if let Some(task) = self.running.get_mut(task_id) {
            // The task was popped for execution, so it no longer lives in
            // self.tasks — fail the running copy so the retry path can find the
            // error and see a terminal status. The running entry stays until
            // retry_failed_tasks or a later terminal mark consumes it.
            task.task.fail(error);
            self.history.push(TaskExecutionRecord {
                task_id: task_id.to_string(),
                description: task.task.description.clone(),
                status: TaskStatus::Failed,
                executed_at: now_ms(),
                duration_ms,
                error: Some(error.to_string()),
                retry_count: task.retry_count,
            });
        }
    }

    /// Check if the queue is empty (no more tasks to process)
    pub fn is_empty(&self) -> bool {
        self.tasks.is_empty()
    }

    /// Get the number of pending tasks
    pub fn pending_count(&self) -> usize {
        self.tasks
            .iter()
            .filter(|t| t.task.status == TaskStatus::Pending)
            .count()
    }

    /// Get the number of completed tasks
    pub fn completed_count(&self) -> usize {
        self.completed.len()
    }

    /// Get the number of failed tasks
    pub fn failed_count(&self) -> usize {
        self.failed.len()
    }

    /// Get total tasks (including completed and failed)
    pub fn total_count(&self) -> usize {
        self.tasks.len() + self.completed.len() + self.failed.len()
    }

    /// Check if all tasks are resolved (completed or failed)
    pub fn all_resolved(&self) -> bool {
        self.tasks.iter().all(|t| t.task.status.is_terminal())
    }

    /// Get tasks by status
    pub fn tasks_by_status(&self, status: TaskStatus) -> Vec<&QueuedTask> {
        self.tasks
            .iter()
            .filter(|t| t.task.status == status)
            .collect()
    }

    /// Retry failed tasks with alternative approaches
    ///
    /// Returns the number of tasks queued for retry
    pub fn retry_failed_tasks<F>(&mut self, generate_plan_b: F) -> usize
    where
        F: Fn(&Task, &str) -> String,
    {
        let mut retry_count = 0;

        // Find failed tasks that can be retried
        let failed_task_ids: Vec<String> = self.failed.iter().cloned().collect();

        for task_id in failed_task_ids {
            // Find the task in history to get error details
            if let Some(record) = self.history.iter().rfind(|r| r.task_id == task_id) {
                if let Some(error) = &record.error {
                    // Find original task definition: either still pending in
                    // the queue, or held in `running` after a pop + fail.
                    let source = if let Some(pos) =
                        self.tasks.iter().position(|t| t.task.id == task_id)
                    {
                        Some(self.tasks.remove(pos))
                    } else {
                        self.running.remove(&task_id)
                    };
                    if let Some(task) = source {
                        if task.can_retry() {
                            let plan_b = generate_plan_b(&task.task, error);
                            let retry_task = task.retry_with_plan_b(plan_b);
                            self.push(retry_task);
                            retry_count += 1;
                        }
                    }
                }
            }
        }

        retry_count
    }

    /// Add new tasks dynamically (e.g., discovered during execution)
    pub fn add_dynamic_tasks(&mut self, tasks: Vec<Task>) {
        for task in tasks {
            self.push(QueuedTask::from_task(task));
        }
    }

    /// Get execution progress as a percentage
    pub fn progress_percentage(&self) -> f64 {
        let total = self.total_count();
        if total == 0 {
            return 0.0;
        }
        let resolved = self.completed.len() + self.failed.len();
        (resolved as f64 / total as f64) * 100.0
    }

    /// Get a summary of the queue state
    pub fn summary(&self) -> TaskQueueSummary {
        TaskQueueSummary {
            total: self.total_count(),
            pending: self.pending_count(),
            in_progress: self
                .tasks
                .iter()
                .filter(|t| t.task.status == TaskStatus::InProgress)
                .count(),
            completed: self.completed_count(),
            failed: self.failed_count(),
            progress: self.progress_percentage(),
        }
    }

    /// Resolve execution order using topological sort
    ///
    /// This reorders the queue to respect dependencies while maintaining priority
    pub fn resolve_order(&mut self) -> Result<(), TaskCycleError> {
        let tasks: Vec<Task> = self.tasks.iter().map(|qt| qt.task.clone()).collect();

        let sorted = Task::resolve_execution_order(tasks)?;

        // Rebuild the queue in sorted order
        let mut new_tasks = Vec::new();
        for sorted_task in sorted {
            if let Some(pos) = self.tasks.iter().position(|t| t.task.id == sorted_task.id) {
                new_tasks.push(self.tasks.remove(pos));
            }
        }

        // Add back any remaining tasks (shouldn't happen, but safety first)
        new_tasks.append(&mut self.tasks);
        self.tasks = new_tasks;

        Ok(())
    }

    /// Get the execution history
    pub fn history(&self) -> &[TaskExecutionRecord] {
        &self.history
    }

    /// Clear completed and failed tasks, keeping only pending ones
    pub fn compact(&mut self) {
        self.tasks.retain(|t| t.task.status == TaskStatus::Pending);
    }
}

impl Default for TaskQueue {
    fn default() -> Self {
        Self::new()
    }
}

/// Summary statistics for a task queue
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskQueueSummary {
    pub total: usize,
    pub pending: usize,
    pub in_progress: usize,
    pub completed: usize,
    pub failed: usize,
    pub progress: f64,
}

impl std::fmt::Display for TaskQueueSummary {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Tasks: {} total | {} pending | {} in progress | {} completed | {} failed ({:.1}% complete)",
            self.total,
            self.pending,
            self.in_progress,
            self.completed,
            self.failed,
            self.progress
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::task::{TaskPriority, TaskType};

    #[test]
    fn test_task_queue_basic() {
        let mut queue = TaskQueue::new();

        let task1 = Task::new("Task 1", TaskType::ToolCall);
        let task2 = Task::new("Task 2", TaskType::ToolCall);

        queue.push(QueuedTask::from_task(task1));
        queue.push(QueuedTask::from_task(task2));

        assert_eq!(queue.pending_count(), 2);
        assert!(!queue.is_empty());

        let next = queue.pop_next();
        assert!(next.is_some());
        assert_eq!(queue.pending_count(), 1);
    }

    #[test]
    fn test_task_queue_priority() {
        let mut queue = TaskQueue::new();

        let low = Task::new("Low", TaskType::ToolCall).with_priority(TaskPriority::Low);
        let high = Task::new("High", TaskType::ToolCall).with_priority(TaskPriority::High);
        let critical =
            Task::new("Critical", TaskType::ToolCall).with_priority(TaskPriority::Critical);

        queue.push(QueuedTask::from_task(low));
        queue.push(QueuedTask::from_task(high));
        queue.push(QueuedTask::from_task(critical));

        // Should pop in priority order
        let t1 = queue.pop_next().unwrap();
        assert_eq!(t1.task.priority, TaskPriority::Critical);

        let t2 = queue.pop_next().unwrap();
        assert_eq!(t2.task.priority, TaskPriority::High);

        let t3 = queue.pop_next().unwrap();
        assert_eq!(t3.task.priority, TaskPriority::Low);
    }

    #[test]
    fn test_task_queue_dependencies() {
        let mut queue = TaskQueue::new();

        let task1 = Task::new("Task 1", TaskType::ToolCall);
        let task1_id = task1.id.clone();

        let task2 = Task::new("Task 2", TaskType::ToolCall).with_dependency(&task1_id);
        let task2_id = task2.id.clone();

        queue.push(QueuedTask::from_task(task1));
        queue.push(QueuedTask::from_task(task2));

        // Task 2 has dependency on Task 1, so only Task 1 should be ready
        let next = queue.pop_next().unwrap();
        assert_eq!(next.task.id, task1_id);

        // Mark Task 1 as completed
        queue.mark_completed(&task1_id, Some(100));

        // Now Task 2 should be ready
        let next2 = queue.pop_next().unwrap();
        assert_eq!(next2.task.id, task2_id);
    }

    #[test]
    fn test_task_retry() {
        let mut queue = TaskQueue::new();

        let task = Task::new("Failing Task", TaskType::ToolCall);
        let task_id = task.id.clone();

        queue.push(QueuedTask::from_task(task));

        // Execute and fail
        let _ = queue.pop_next();
        queue.mark_failed(&task_id, "Test error", Some(50));

        // Retry with Plan B
        let plan_b_generator = |_task: &Task, error: &str| format!("Plan B: {error}");

        let retried = queue.retry_failed_tasks(plan_b_generator);
        assert_eq!(retried, 1);
        assert_eq!(queue.pending_count(), 1);
    }

    #[test]
    fn test_progress_tracking() {
        let mut queue = TaskQueue::new();

        for i in 0..10 {
            let task = Task::new(format!("Task {i}"), TaskType::ToolCall);
            queue.push(QueuedTask::from_task(task));
        }

        assert_eq!(queue.progress_percentage(), 0.0);

        // Complete 5 tasks
        for _i in 0..5 {
            let task = queue.pop_next().unwrap();
            queue.mark_completed(&task.task.id, Some(100));
        }

        assert!((queue.progress_percentage() - 50.0).abs() < 0.1);
    }
}
