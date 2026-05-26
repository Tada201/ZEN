use crate::agent::utils::now_ms;
/// ISSUE-003: Formal Task Entity
///
/// Provides a `Task` model with:
/// - Priority sorting (Critical > High > Medium > Low)
/// - Dependency tracking with `are_dependencies_resolved()`
/// - Status lifecycle (Pending → InProgress → Completed/Failed/Cancelled)
/// - Topological sort for dependency-aware execution ordering
/// - Cycle detection to prevent deadlocks
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BinaryHeap, HashMap, HashSet};

// ─── Enums ───

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum TaskPriority {
    Critical = 0,
    High = 1,
    Medium = 2,
    Low = 3,
}

impl Default for TaskPriority {
    fn default() -> Self {
        TaskPriority::Medium
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
    Cancelled,
}

impl Default for TaskStatus {
    fn default() -> Self {
        TaskStatus::Pending
    }
}

impl TaskStatus {
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            TaskStatus::Completed | TaskStatus::Failed | TaskStatus::Cancelled
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskType {
    ToolCall,
    AgentHandoff,
    SubAgentSpawn,
    Workflow,
    Custom(String),
}

impl Default for TaskType {
    fn default() -> Self {
        TaskType::ToolCall
    }
}

// ─── Task ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub task_type: TaskType,
    pub description: String,
    pub priority: TaskPriority,
    pub status: TaskStatus,
    /// Agent ID this task is assigned to (None = unassigned)
    pub assigned_to: Option<String>,
    /// IDs of tasks that must complete before this one can start
    pub dependencies: Vec<String>,
    /// Arbitrary key-value metadata (tool args, workflow context, etc.)
    #[serde(default)]
    pub metadata: HashMap<String, Value>,
    /// When the task started executing (Unix epoch ms)
    pub started_at: Option<i64>,
    /// When the task finished (Unix epoch ms)
    pub completed_at: Option<i64>,
    /// When the task was created (Unix epoch ms)
    pub created_at: i64,
    /// Optional error message if failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl Task {
    /// Create a new task with a generated UUID.
    pub fn new(description: impl Into<String>, task_type: TaskType) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            task_type,
            description: description.into(),
            priority: TaskPriority::default(),
            status: TaskStatus::Pending,
            assigned_to: None,
            dependencies: Vec::new(),
            metadata: HashMap::new(),
            started_at: None,
            completed_at: None,
            created_at: now_ms(),
            error: None,
        }
    }

    /// Set priority (builder pattern).
    pub fn with_priority(mut self, priority: TaskPriority) -> Self {
        self.priority = priority;
        self
    }

    /// Add a dependency (builder pattern).
    pub fn with_dependency(mut self, task_id: impl Into<String>) -> Self {
        self.dependencies.push(task_id.into());
        self
    }

    /// Assign to an agent (builder pattern).
    pub fn with_assignee(mut self, agent_id: impl Into<String>) -> Self {
        self.assigned_to = Some(agent_id.into());
        self
    }

    /// Check whether all dependencies are resolved (completed).
    pub fn are_dependencies_resolved(&self, completed: &HashSet<String>) -> bool {
        self.dependencies.iter().all(|dep| completed.contains(dep))
    }

    /// Mark as in-progress.
    pub fn start(&mut self) {
        self.status = TaskStatus::InProgress;
        self.started_at = Some(now_ms());
    }

    /// Mark as completed.
    pub fn complete(&mut self) {
        self.status = TaskStatus::Completed;
        self.completed_at = Some(now_ms());
    }

    /// Mark as failed with an error message.
    pub fn fail(&mut self, error: impl Into<String>) {
        self.status = TaskStatus::Failed;
        self.completed_at = Some(now_ms());
        self.error = Some(error.into());
    }

    /// Mark as cancelled.
    pub fn cancel(&mut self) {
        self.status = TaskStatus::Cancelled;
        self.completed_at = Some(now_ms());
    }

    /// Duration in ms (None if not started or not finished).
    pub fn duration_ms(&self) -> Option<i64> {
        match (self.started_at, self.completed_at) {
            (Some(s), Some(e)) => Some(e - s),
            _ => None,
        }
    }

    // ─── Static helpers ───

    /// Sort tasks by priority (highest priority first: Critical < High < Medium < Low).
    pub fn sort_by_priority(tasks: &mut [Task]) {
        tasks.sort_by(|a, b| a.priority.cmp(&b.priority));
    }

    /// Resolve execution order using topological sort (Kahn's algorithm).
    ///
    /// Returns `Err` if a circular dependency is detected.
    /// Within each dependency-level tier, tasks are sorted by priority.
    pub fn resolve_execution_order(tasks: Vec<Task>) -> Result<Vec<Task>, TaskCycleError> {
        let n = tasks.len();
        if n == 0 {
            return Ok(vec![]);
        }

        // Build adjacency and in-degree maps
        let id_to_idx: HashMap<&str, usize> = tasks
            .iter()
            .enumerate()
            .map(|(i, t)| (t.id.as_str(), i))
            .collect();

        let mut in_degree = vec![0usize; n];
        let mut adj: Vec<Vec<usize>> = vec![vec![]; n];

        for (i, task) in tasks.iter().enumerate() {
            for dep_id in &task.dependencies {
                if let Some(&dep_idx) = id_to_idx.get(dep_id.as_str()) {
                    adj[dep_idx].push(i);
                    in_degree[i] += 1;
                }
                // Dependencies referencing tasks outside this set are ignored
                // (assumed already completed).
            }
        }

        // Kahn's algorithm with priority-based tie-breaking
        // Use BinaryHeap to always process highest-priority (lowest ordinal) tasks first
        // when multiple tasks have in-degree 0 simultaneously
        #[derive(Eq, PartialEq, Ord, PartialOrd)]
        struct PriorityTask {
            priority: TaskPriority,
            index: usize,
        }

        let mut queue: BinaryHeap<PriorityTask> = BinaryHeap::new();
        for (i, &deg) in in_degree.iter().enumerate() {
            if deg == 0 {
                queue.push(PriorityTask {
                    priority: tasks[i].priority,
                    index: i,
                });
            }
        }

        let mut sorted_indices: Vec<usize> = Vec::with_capacity(n);

        while let Some(item) = queue.pop() {
            let idx = item.index;
            sorted_indices.push(idx);
            for &next in &adj[idx] {
                in_degree[next] -= 1;
                if in_degree[next] == 0 {
                    queue.push(PriorityTask {
                        priority: tasks[next].priority,
                        index: next,
                    });
                }
            }
        }

        if sorted_indices.len() != n {
            // Find cycle participants for a useful error message
            let cycle_ids: Vec<String> = in_degree
                .iter()
                .enumerate()
                .filter(|(_, &d)| d > 0)
                .map(|(i, _)| tasks[i].id.clone())
                .collect();

            return Err(TaskCycleError {
                task_ids: cycle_ids,
            });
        }

        // Convert indices back to tasks - already in correct order from priority-aware topo sort
        let result: Vec<Task> = sorted_indices
            .into_iter()
            .map(|i| tasks[i].clone())
            .collect();

        Ok(result)
    }
}

/// Error when circular dependencies are detected.
#[derive(Debug, Clone)]
pub struct TaskCycleError {
    pub task_ids: Vec<String>,
}

impl std::fmt::Display for TaskCycleError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Circular dependency detected among tasks: {:?}",
            self.task_ids
        )
    }
}

impl std::error::Error for TaskCycleError {}

// ─── Tests ───

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_task_lifecycle() {
        let mut task = Task::new("Test task", TaskType::ToolCall);
        assert_eq!(task.status, TaskStatus::Pending);
        assert!(task.started_at.is_none());

        task.start();
        assert_eq!(task.status, TaskStatus::InProgress);
        assert!(task.started_at.is_some());

        task.complete();
        assert_eq!(task.status, TaskStatus::Completed);
        assert!(task.completed_at.is_some());
        assert!(task.duration_ms().unwrap() >= 0);
    }

    #[test]
    fn test_task_failure() {
        let mut task = Task::new("Failing task", TaskType::ToolCall);
        task.start();
        task.fail("Something went wrong");
        assert_eq!(task.status, TaskStatus::Failed);
        assert_eq!(task.error.as_deref(), Some("Something went wrong"));
    }

    #[test]
    fn test_dependency_resolution() {
        let task = Task::new("Has deps", TaskType::ToolCall)
            .with_dependency("dep-1")
            .with_dependency("dep-2");

        let mut completed = HashSet::new();
        assert!(!task.are_dependencies_resolved(&completed));

        completed.insert("dep-1".to_string());
        assert!(!task.are_dependencies_resolved(&completed));

        completed.insert("dep-2".to_string());
        assert!(task.are_dependencies_resolved(&completed));
    }

    #[test]
    fn test_priority_sorting() {
        let mut tasks = vec![
            Task::new("Low", TaskType::ToolCall).with_priority(TaskPriority::Low),
            Task::new("Critical", TaskType::ToolCall).with_priority(TaskPriority::Critical),
            Task::new("High", TaskType::ToolCall).with_priority(TaskPriority::High),
            Task::new("Medium", TaskType::ToolCall).with_priority(TaskPriority::Medium),
        ];

        Task::sort_by_priority(&mut tasks);

        assert_eq!(tasks[0].priority, TaskPriority::Critical);
        assert_eq!(tasks[1].priority, TaskPriority::High);
        assert_eq!(tasks[2].priority, TaskPriority::Medium);
        assert_eq!(tasks[3].priority, TaskPriority::Low);
    }

    #[test]
    fn test_topological_sort_linear() {
        let t1 = Task::new("First", TaskType::ToolCall);
        let t2 = Task::new("Second", TaskType::ToolCall).with_dependency(t1.id.as_str());
        let t3 = Task::new("Third", TaskType::ToolCall).with_dependency(t2.id.as_str());

        let ids = vec![t1.id.clone(), t2.id.clone(), t3.id.clone()];
        let result =
            Task::resolve_execution_order(vec![t3.clone(), t1.clone(), t2.clone()]).unwrap();

        // t1 must come before t2, t2 before t3
        let pos: HashMap<String, usize> = result
            .iter()
            .enumerate()
            .map(|(i, t)| (t.id.clone(), i))
            .collect();

        assert!(pos[&ids[0]] < pos[&ids[1]]);
        assert!(pos[&ids[1]] < pos[&ids[2]]);
    }

    #[test]
    fn test_topological_sort_cycle_detection() {
        let mut t1 = Task::new("A", TaskType::ToolCall);
        let mut t2 = Task::new("B", TaskType::ToolCall);

        let id1 = t1.id.clone();
        let id2 = t2.id.clone();

        t1.dependencies.push(id2.clone());
        t2.dependencies.push(id1.clone());

        let result = Task::resolve_execution_order(vec![t1, t2]);
        assert!(result.is_err());

        let err = result.unwrap_err();
        assert!(err.task_ids.contains(&id1));
        assert!(err.task_ids.contains(&id2));
    }

    #[test]
    fn test_topological_sort_no_deps() {
        let tasks = vec![
            Task::new("A", TaskType::ToolCall).with_priority(TaskPriority::Low),
            Task::new("B", TaskType::ToolCall).with_priority(TaskPriority::Critical),
            Task::new("C", TaskType::ToolCall).with_priority(TaskPriority::High),
        ];

        let result = Task::resolve_execution_order(tasks).unwrap();
        // With no deps, should be sorted by priority
        assert_eq!(result[0].priority, TaskPriority::Critical);
        assert_eq!(result[1].priority, TaskPriority::High);
        assert_eq!(result[2].priority, TaskPriority::Low);
    }
}
