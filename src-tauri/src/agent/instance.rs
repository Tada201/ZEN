use crate::agent::types::Agent;
use crate::agent::utils::now_ms;
/// ISSUE-004: Agent Lifecycle State Management
///
/// Runtime wrapper around the config-only `Agent` struct, adding:
/// - Status state machine (Active → Busy → Idle → Terminated)
/// - Role assignment (Leader / Worker / Peer)
/// - Capability-based task matching (`can_execute`)
/// - Per-agent metrics with auto-calculated health
use serde::{Deserialize, Serialize};

// ─── Enums ───

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatus {
    Active,
    Busy,
    Idle,
    Terminated,
}

impl Default for AgentStatus {
    fn default() -> Self {
        AgentStatus::Active
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentRole {
    Leader,
    Worker,
    Peer,
}

impl Default for AgentRole {
    fn default() -> Self {
        AgentRole::Worker
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentHealth {
    Healthy,
    Degraded,
    Unhealthy,
}

impl Default for AgentHealth {
    fn default() -> Self {
        AgentHealth::Healthy
    }
}

// ─── Metrics ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMetrics {
    pub tasks_completed: u64,
    pub tasks_failed: u64,
    pub success_rate: f64,
    pub avg_execution_time_ms: f64,
    /// Running total for computing the average
    total_execution_time_ms: u64,
    pub health: AgentHealth,
}

impl Default for AgentMetrics {
    fn default() -> Self {
        Self {
            tasks_completed: 0,
            tasks_failed: 0,
            success_rate: 1.0, // Start optimistic
            avg_execution_time_ms: 0.0,
            total_execution_time_ms: 0,
            health: AgentHealth::Healthy,
        }
    }
}

impl AgentMetrics {
    /// Record a task result and recalculate derived metrics.
    pub fn record(&mut self, success: bool, duration_ms: u64) {
        if success {
            self.tasks_completed += 1;
        } else {
            self.tasks_failed += 1;
        }

        self.total_execution_time_ms += duration_ms;

        let total = self.tasks_completed + self.tasks_failed;
        self.success_rate = if total > 0 {
            self.tasks_completed as f64 / total as f64
        } else {
            1.0
        };

        self.avg_execution_time_ms = if total > 0 {
            self.total_execution_time_ms as f64 / total as f64
        } else {
            0.0
        };

        // Auto-calculate health from success rate
        self.health = if self.success_rate >= 0.9 {
            AgentHealth::Healthy
        } else if self.success_rate >= 0.7 {
            AgentHealth::Degraded
        } else {
            AgentHealth::Unhealthy
        };
    }

    /// Total tasks attempted (completed + failed).
    pub fn total_tasks(&self) -> u64 {
        self.tasks_completed + self.tasks_failed
    }
}

// ─── AgentInstance ───

/// Runtime agent wrapper: config + live state + metrics.
///
/// The underlying `Agent` struct (from `types.rs`) remains the static config.
/// `AgentInstance` adds everything needed for runtime orchestration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInstance {
    /// Static agent configuration (id, name, instructions, tool_ids, etc.)
    pub config: Agent,
    /// Current lifecycle status
    pub status: AgentStatus,
    /// Role within a swarm topology
    pub role: AgentRole,
    /// What this agent can do (e.g., "web_search", "file_ops", "code_gen")
    pub capabilities: Vec<String>,
    /// Cumulative performance metrics
    pub metrics: AgentMetrics,
    /// Unix epoch ms when this instance was created
    pub created_at: i64,
    /// Unix epoch ms of last activity
    pub last_active: i64,
}

impl AgentInstance {
    /// Wrap an existing `Agent` config into a live instance.
    pub fn from_config(config: Agent) -> Self {
        let now = now_ms();
        // Derive capabilities from tool_ids (each tool ID is a capability)
        let capabilities = config.tool_ids.clone();

        Self {
            config,
            status: AgentStatus::Active,
            role: AgentRole::Worker,
            capabilities,
            metrics: AgentMetrics::default(),
            created_at: now,
            last_active: now,
        }
    }

    /// Create with a specific role.
    pub fn with_role(mut self, role: AgentRole) -> Self {
        self.role = role;
        self
    }

    /// Add extra capabilities beyond what tools provide.
    pub fn with_capabilities(mut self, caps: Vec<String>) -> Self {
        self.capabilities.extend(caps);
        self
    }

    /// Check if this agent can execute a task of the given type.
    ///
    /// Matches against the agent's `capabilities` list.
    pub fn can_execute(&self, task_type: &str) -> bool {
        if self.status == AgentStatus::Terminated {
            return false;
        }
        self.capabilities.iter().any(|c| c == task_type)
    }

    /// Is this agent available to take new work?
    pub fn is_available(&self) -> bool {
        matches!(self.status, AgentStatus::Active | AgentStatus::Idle)
    }

    /// Transition to Busy.
    pub fn set_busy(&mut self) {
        self.status = AgentStatus::Busy;
        self.last_active = now_ms();
    }

    /// Transition to Idle.
    pub fn set_idle(&mut self) {
        self.status = AgentStatus::Idle;
        self.last_active = now_ms();
    }

    /// Transition to Terminated.
    pub fn terminate(&mut self) {
        self.status = AgentStatus::Terminated;
        self.last_active = now_ms();
    }

    /// Record a task result and update metrics + last_active.
    pub fn record_task_result(&mut self, success: bool, duration_ms: u64) {
        self.metrics.record(success, duration_ms);
        self.last_active = now_ms();

        // Auto-transition from Busy back to Active after recording
        if self.status == AgentStatus::Busy {
            self.status = AgentStatus::Active;
        }
    }

    /// Convenience: agent ID from config.
    pub fn id(&self) -> &str {
        &self.config.id
    }

    /// Convenience: agent name from config.
    pub fn name(&self) -> &str {
        &self.config.name
    }
}

// ─── Tests ───

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::types::Agent;

    fn test_agent() -> Agent {
        Agent {
            id: "test-agent".to_string(),
            name: "Test Agent".to_string(),
            instructions: "You are a test agent.".to_string(),
            tool_ids: vec!["web_search".to_string(), "read_file".to_string()],
            model_override: None,
            max_iterations: None,
            description: Some("Test".to_string()),
            model_tier: crate::agent::types::ModelTier::Local,
        }
    }

    #[test]
    fn test_instance_creation() {
        let instance = AgentInstance::from_config(test_agent());
        assert_eq!(instance.status, AgentStatus::Active);
        assert_eq!(instance.role, AgentRole::Worker);
        assert_eq!(instance.capabilities.len(), 2);
        assert!(instance.can_execute("web_search"));
        assert!(!instance.can_execute("unknown_tool"));
    }

    #[test]
    fn test_status_transitions() {
        let mut instance = AgentInstance::from_config(test_agent());
        assert!(instance.is_available());

        instance.set_busy();
        assert_eq!(instance.status, AgentStatus::Busy);
        assert!(!instance.is_available());

        instance.set_idle();
        assert_eq!(instance.status, AgentStatus::Idle);
        assert!(instance.is_available());

        instance.terminate();
        assert_eq!(instance.status, AgentStatus::Terminated);
        assert!(!instance.is_available());
        assert!(!instance.can_execute("web_search")); // Terminated agents can't execute
    }

    #[test]
    fn test_metrics_recording() {
        let mut instance = AgentInstance::from_config(test_agent());

        instance.set_busy();
        instance.record_task_result(true, 100);
        assert_eq!(instance.metrics.tasks_completed, 1);
        assert_eq!(instance.metrics.success_rate, 1.0);
        assert_eq!(instance.metrics.health, AgentHealth::Healthy);
        // Should auto-transition from Busy to Active
        assert_eq!(instance.status, AgentStatus::Active);

        instance.record_task_result(false, 200);
        assert_eq!(instance.metrics.tasks_failed, 1);
        assert_eq!(instance.metrics.success_rate, 0.5);
        assert_eq!(instance.metrics.health, AgentHealth::Unhealthy);
    }

    #[test]
    fn test_health_thresholds() {
        let mut metrics = AgentMetrics::default();

        // 10 successes, 0 failures → 100% → Healthy
        for _ in 0..10 {
            metrics.record(true, 50);
        }
        assert_eq!(metrics.health, AgentHealth::Healthy);

        // Add 2 failures → 10/12 = 83% → Degraded
        metrics.record(false, 50);
        metrics.record(false, 50);
        assert_eq!(metrics.health, AgentHealth::Degraded);

        // Add 5 more failures → 10/17 = 58% → Unhealthy
        for _ in 0..5 {
            metrics.record(false, 50);
        }
        assert_eq!(metrics.health, AgentHealth::Unhealthy);
    }

    #[test]
    fn test_avg_execution_time() {
        let mut metrics = AgentMetrics::default();
        metrics.record(true, 100);
        metrics.record(true, 200);
        metrics.record(true, 300);
        assert!((metrics.avg_execution_time_ms - 200.0).abs() < 0.01);
    }
}
