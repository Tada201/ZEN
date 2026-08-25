use std::collections::HashMap;
use tokio::sync::RwLock;
use tracing::info;

use crate::instance::AgentInstance;
use crate::types::Agent;

mod types;

pub use types::{SwarmError, SwarmState};

pub struct SwarmCoordinator {
    agents: RwLock<HashMap<String, AgentInstance>>,
}

impl Default for SwarmCoordinator {
    fn default() -> Self {
        Self::new()
    }
}

impl SwarmCoordinator {
    pub fn new() -> Self {
        Self {
            agents: RwLock::new(HashMap::new()),
        }
    }

    pub async fn spawn_agent(&self, config: Agent) -> Result<AgentInstance, SwarmError> {
        let agent_id = config.id.clone();
        {
            let agents = self.agents.read().await;
            if agents.contains_key(&agent_id) {
                return Err(SwarmError::AgentAlreadyExists(agent_id));
            }
        }

        let instance = AgentInstance::from_config(config.clone());

        {
            let mut agents = self.agents.write().await;
            agents.insert(agent_id.clone(), instance.clone());
        }

        info!(agent_id = %agent_id, "Spawned new agent in swarm");
        Ok(instance)
    }

    pub async fn terminate_agent(&self, agent_id: &str) -> Result<(), SwarmError> {
        let mut agents = self.agents.write().await;
        let instance = agents
            .get_mut(agent_id)
            .ok_or_else(|| SwarmError::AgentNotFound(agent_id.to_string()))?;

        instance.terminate();
        agents.remove(agent_id);

        info!(agent_id = %agent_id, "Terminated agent in swarm");
        Ok(())
    }

    pub async fn get_swarm_state(&self) -> SwarmState {
        let agents = self.agents.read().await;
        let agent_count = agents.len();
        let active_count = agents
            .values()
            .filter(|a| a.status == crate::instance::AgentStatus::Busy)
            .count();

        if active_count > 0 {
            SwarmState::Active {
                agent_count,
                active_tasks: active_count,
            }
        } else {
            SwarmState::Idle { agent_count }
        }
    }

    pub async fn get_agents(&self) -> Vec<AgentInstance> {
        let agents = self.agents.read().await;
        agents.values().cloned().collect()
    }
}

// Moved from the app crate in Phase 11: `SwarmError` is local here, so the
// `From` impl satisfies the orphan rule on this side of the extraction.
impl From<SwarmError> for zen_core::error::ZenError {
    fn from(e: SwarmError) -> Self {
        zen_core::error::ZenError::Swarm(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ModelTier;

    fn test_agent() -> Agent {
        Agent {
            id: "test-agent".to_string(),
            name: "TestAgent".to_string(),
            description: Some("Test agent for unit tests.".to_string()),
            instructions: "You are a test agent.".to_string(),
            tool_ids: vec!["test_tool".to_string()],
            model_override: None,
            max_iterations: None,
            context_window: None,
            max_messages_in_memory: None,
            model_tier: ModelTier::Local,
        }
    }

    #[tokio::test]
    async fn test_spawn_agent() {
        let coordinator = SwarmCoordinator::new();
        let result = coordinator.spawn_agent(test_agent()).await;
        assert!(result.is_ok());
        let agents = coordinator.get_agents().await;
        assert_eq!(agents.len(), 1);
    }

    #[tokio::test]
    async fn test_terminate_agent() {
        let coordinator = SwarmCoordinator::new();
        let agent = coordinator.spawn_agent(test_agent()).await.unwrap();
        let result = coordinator.terminate_agent(&agent.config.id).await;
        assert!(result.is_ok());
        let agents = coordinator.get_agents().await;
        assert_eq!(agents.len(), 0);
    }
}
