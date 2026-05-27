use crate::agent::task::{TaskPriority, TaskStatus};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Swarm topology defines how agents are connected and communicate.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SwarmTopology {
    /// Single leader with worker hierarchy.
    Hierarchical { leader_id: String },
    /// All agents connected to all others (full mesh).
    Mesh,
    /// Hierarchical mesh: leaders in mesh, workers under leaders.
    HierarchicalMesh { leader_ids: Vec<String> },
    /// Star topology: central coordinator with radiating workers.
    Star { coordinator_id: String },
    /// Ring topology: agents pass messages in a ring.
    Ring { agent_order: Vec<String> },
    /// Adaptive: automatically chooses topology based on workload.
    Adaptive,
}

impl Default for SwarmTopology {
    fn default() -> Self {
        SwarmTopology::Hierarchical {
            leader_id: "generalist".to_string(),
        }
    }
}

impl SwarmTopology {
    /// Get the leader/coordinator ID for this topology.
    pub fn get_leader(&self) -> Option<&str> {
        match self {
            SwarmTopology::Hierarchical { leader_id } => Some(leader_id),
            SwarmTopology::HierarchicalMesh { leader_ids } => {
                leader_ids.first().map(|s| s.as_str())
            }
            SwarmTopology::Star { coordinator_id } => Some(coordinator_id),
            _ => None,
        }
    }

    /// Check if this topology supports concurrent execution.
    pub fn supports_concurrent(&self) -> bool {
        matches!(
            self,
            SwarmTopology::Mesh | SwarmTopology::HierarchicalMesh { .. } | SwarmTopology::Adaptive
        )
    }
}

/// Assignment of a task to a specific agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskAssignment {
    pub task_id: String,
    pub assigned_to: String,
    pub priority: TaskPriority,
    pub status: TaskStatus,
}

/// Result of a task execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResult {
    pub task_id: String,
    pub agent_id: String,
    pub success: bool,
    pub output: String,
    pub duration_ms: u64,
    pub error: Option<String>,
}

/// A decision proposal for consensus voting.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsensusDecision {
    pub id: String,
    pub description: String,
    pub options: Vec<String>,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Result of a consensus vote.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsensusResult {
    pub decision_id: String,
    pub winner: String,
    pub votes: HashMap<String, u32>,
    pub total_voters: u32,
    pub quorum_reached: bool,
}

/// Events emitted by the swarm coordinator.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SwarmEvent {
    AgentJoined {
        agent_id: String,
        agent_type: String,
    },
    AgentLeft {
        agent_id: String,
    },
    TaskAssigned {
        task_id: String,
        agent_id: String,
    },
    TaskCompleted {
        task_id: String,
        agent_id: String,
        success: bool,
    },
    TopologyChanged {
        new_topology: String,
    },
    ConsensusReached {
        decision_id: String,
        winner: String,
    },
    SwarmScaled {
        agent_type: String,
        new_count: usize,
    },
}

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

/// Connection between agents in a mesh topology.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeshConnection {
    pub from_agent: String,
    pub to_agent: String,
    pub connection_type: String,
}

#[derive(Debug, thiserror::Error)]
pub enum SwarmError {
    #[error("Agent already exists: {0}")]
    AgentAlreadyExists(String),

    #[error("Agent not found: {0}")]
    AgentNotFound(String),

    #[error("Task execution failed: {0}")]
    TaskFailed(String),

    #[error("Consensus not reached")]
    ConsensusNotReached,

    #[error("Invalid topology configuration: {0}")]
    InvalidTopology(String),
}
