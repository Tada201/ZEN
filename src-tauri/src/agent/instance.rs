use crate::agent::types::Agent;
use crate::agent::utils::now_ms;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatus {
    #[default]
    Active,
    Busy,
    Idle,
    Terminated,
}

/// Runtime agent wrapper: config + live status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInstance {
    /// Static agent configuration (id, name, instructions, tool_ids, etc.)
    pub config: Agent,
    /// Current lifecycle status
    pub status: AgentStatus,
    /// Unix epoch ms when this instance was created
    pub created_at: i64,
    /// Unix epoch ms of last activity
    pub last_active: i64,
}

impl AgentInstance {
    pub fn from_config(config: Agent) -> Self {
        let now = now_ms();
        Self {
            config,
            status: AgentStatus::Active,
            created_at: now,
            last_active: now,
        }
    }

    pub fn is_available(&self) -> bool {
        matches!(self.status, AgentStatus::Active | AgentStatus::Idle)
    }

    pub fn set_busy(&mut self) {
        self.status = AgentStatus::Busy;
        self.last_active = now_ms();
    }

    pub fn set_idle(&mut self) {
        self.status = AgentStatus::Idle;
        self.last_active = now_ms();
    }

    pub fn terminate(&mut self) {
        self.status = AgentStatus::Terminated;
        self.last_active = now_ms();
    }

    pub fn id(&self) -> &str {
        &self.config.id
    }

    pub fn name(&self) -> &str {
        &self.config.name
    }
}

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
            context_window: None,
            max_messages_in_memory: None,
            description: Some("Test".to_string()),
            model_tier: crate::agent::types::ModelTier::Local,
        }
    }

    #[test]
    fn test_instance_creation() {
        let instance = AgentInstance::from_config(test_agent());
        assert_eq!(instance.status, AgentStatus::Active);
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
    }
}
