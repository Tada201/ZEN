use serde::{Deserialize, Serialize};

/// Current state of the swarm.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SwarmState {
    Initializing,
    Active {
        agent_count: usize,
        active_tasks: usize,
    },
    Degraded {
        agent_count: usize,
        unhealthy_agents: usize,
    },
    Idle {
        agent_count: usize,
    },
    ShuttingDown,
}

#[derive(Debug, thiserror::Error)]
pub enum SwarmError {
    #[error("Agent already exists: {0}")]
    AgentAlreadyExists(String),

    #[error("Agent not found: {0}")]
    AgentNotFound(String),

    #[error("Task execution failed: {0}")]
    TaskFailed(String),

    #[error("Invalid topology configuration: {0}")]
    InvalidTopology(String),
}
