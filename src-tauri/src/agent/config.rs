use crate::agent::types::Agent;
use crate::db::queries;
/// Agentic Swarm Phase 6: Agent Configuration System
///
/// Provides per-agent configuration management:
/// - Model assignment per agent
/// - Context window and memory limits
/// - Tool permissions per agent
/// - System prompt overrides
/// - Persistence to database
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

/// Default configuration values for each agent type
const DEFAULT_GENERALIST_MODEL: &str = "llama3.2:latest";
const DEFAULT_GENERALIST_CONTEXT: i32 = 8192;
const DEFAULT_GENERALIST_MAX_MESSAGES: i32 = 20;
const DEFAULT_GENERALIST_MAX_ITERATIONS: i32 = 15;

const DEFAULT_OPERATIONAL_MODEL: &str = "llama3.2:latest";
const DEFAULT_OPERATIONAL_CONTEXT: i32 = 16384;
const DEFAULT_OPERATIONAL_MAX_MESSAGES: i32 = 30;
const DEFAULT_OPERATIONAL_MAX_ITERATIONS: i32 = 20;

const DEFAULT_RESEARCHER_MODEL: &str = "llama3.2:latest";
const DEFAULT_RESEARCHER_CONTEXT: i32 = 16384;
const DEFAULT_RESEARCHER_MAX_MESSAGES: i32 = 25;
const DEFAULT_RESEARCHER_MAX_ITERATIONS: i32 = 12;

// ─── Agent System Prompts with Team Awareness ───

/// Generalist agent system prompt with multi-agent team awareness
/// Based on Claude Code's "Chief of Staff" pattern
const GENERALIST_SYSTEM_PROMPT: &str = r#"You are ZEN, the lead coordinator of a multi-agent AI team. Your job is to delegate specialized work to your sub-agents and synthesize the results into coherent final responses.

## 🛰️ Sub-Agent Roster & Scope:
1. **ZEN-COSMOS** (space_observer): Space events, astronomy, satellite/ISS tracking.
2. **ZEN-OP** (operational_expert): Aviation/military flight tracking, route plotting, geospatial geofencing, navigation.
3. **ZEN-DOCS** (researcher): Vector document search, deep web research, knowledge retrieval, information synthesis.

## 📑 Delegation Protocol:
- Spawning: Use `spawn_agent` when a query requires specialized domain knowledge outside your immediate scope (research, space, aviation).
- Method: State your delegation intent, pass a specific goal with complete context, and then compile the agent's output into a cohesive final summary."#;

/// Agent configuration stored in database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    /// Agent ID (e.g., "generalist", "operational_expert")
    pub agent_id: String,
    /// Model name to use (e.g., "llama3.2:latest", "gemini-1.5-pro")
    pub model_name: String,
    /// Context window size in tokens
    pub context_window: i32,
    /// Maximum messages to keep in memory
    pub max_messages_in_memory: i32,
    /// Maximum iterations for the agent loop
    pub max_iterations: i32,
    /// List of enabled tool names
    #[serde(default)]
    pub enabled_tools: Vec<String>,
    /// Optional system prompt override
    #[serde(default)]
    pub system_prompt_override: Option<String>,
}

impl AgentConfig {
    /// Get default configuration for a specific agent ID
    pub fn default_for_agent(agent_id: &str) -> Self {
        match agent_id {
            "generalist" => Self {
                agent_id: "generalist".to_string(),
                model_name: DEFAULT_GENERALIST_MODEL.to_string(),
                context_window: DEFAULT_GENERALIST_CONTEXT,
                max_messages_in_memory: DEFAULT_GENERALIST_MAX_MESSAGES,
                max_iterations: DEFAULT_GENERALIST_MAX_ITERATIONS,
                // Generalist needs spawn_agent for delegation
                enabled_tools: vec![
                    "get_system_metrics".to_string(),
                    "vector_search".to_string(),
                    "handoff_to_agent".to_string(),
                    "spawn_agent".to_string(),       // ✅ Enable delegation
                    "delegate_to_agent".to_string(), // ✅ Alias for spawn_agent
                ],
                system_prompt_override: Some(GENERALIST_SYSTEM_PROMPT.to_string()),
            },
            "operational_expert" => Self {
                agent_id: "operational_expert".to_string(),
                model_name: DEFAULT_OPERATIONAL_MODEL.to_string(),
                context_window: DEFAULT_OPERATIONAL_CONTEXT,
                max_messages_in_memory: DEFAULT_OPERATIONAL_MAX_MESSAGES,
                max_iterations: DEFAULT_OPERATIONAL_MAX_ITERATIONS,
                enabled_tools: vec![], // Empty means use agent's default tools
                system_prompt_override: None,
            },
            "researcher" => Self {
                agent_id: "researcher".to_string(),
                model_name: DEFAULT_RESEARCHER_MODEL.to_string(),
                context_window: DEFAULT_RESEARCHER_CONTEXT,
                max_messages_in_memory: DEFAULT_RESEARCHER_MAX_MESSAGES,
                max_iterations: DEFAULT_RESEARCHER_MAX_ITERATIONS,
                enabled_tools: vec![],
                system_prompt_override: None,
            },
            _ => Self {
                agent_id: agent_id.to_string(),
                model_name: DEFAULT_GENERALIST_MODEL.to_string(),
                context_window: DEFAULT_GENERALIST_CONTEXT,
                max_messages_in_memory: DEFAULT_GENERALIST_MAX_MESSAGES,
                max_iterations: DEFAULT_GENERALIST_MAX_ITERATIONS,
                enabled_tools: vec![],
                system_prompt_override: None,
            },
        }
    }

    /// Get the database key for this agent's config
    pub fn db_key(&self) -> String {
        format!("agent_{}_config", self.agent_id)
    }
}

/// Manager for agent configurations
pub struct AgentConfigManager {
    db_pool: SqlitePool,
}

impl AgentConfigManager {
    /// Create a new config manager
    pub fn new(db_pool: SqlitePool) -> Self {
        Self { db_pool }
    }

    /// Load configuration for an agent
    ///
    /// Returns saved config if exists, otherwise returns defaults
    pub async fn load_config(&self, agent_id: &str) -> Result<AgentConfig> {
        let key = format!("agent_{}_config", agent_id);

        match queries::get_setting(&self.db_pool, &key).await? {
            Some(json_str) => {
                // Parse saved config
                let config: AgentConfig = serde_json::from_str(&json_str)
                    .with_context(|| format!("Failed to parse agent config for '{}'", agent_id))?;
                Ok(config)
            }
            None => {
                // Return defaults
                Ok(AgentConfig::default_for_agent(agent_id))
            }
        }
    }

    /// Save configuration for an agent
    pub async fn save_config(&self, config: &AgentConfig) -> Result<()> {
        let key = config.db_key();
        let json_str = serde_json::to_string_pretty(config)
            .with_context(|| format!("Failed to serialize config for '{}'", config.agent_id))?;

        queries::set_setting(&self.db_pool, &key, &json_str).await?;
        Ok(())
    }

    /// List all agent configurations
    pub async fn list_all_configs(&self) -> Result<Vec<AgentConfig>> {
        let all_settings = queries::get_all_settings(&self.db_pool).await?;

        let mut configs = Vec::new();
        for (key, value) in all_settings {
            if key.starts_with("agent_") && key.ends_with("_config") {
                if let Ok(config) = serde_json::from_str::<AgentConfig>(&value) {
                    configs.push(config);
                }
            }
        }

        // Add defaults for any agents without saved configs
        let default_agent_ids = ["generalist", "operational_expert", "researcher"];
        for agent_id in &default_agent_ids {
            if !configs.iter().any(|c| c.agent_id == *agent_id) {
                configs.push(AgentConfig::default_for_agent(agent_id));
            }
        }

        Ok(configs)
    }

    /// Reset an agent's config to defaults
    pub async fn reset_to_defaults(&self, agent_id: &str) -> Result<()> {
        let _key = format!("agent_{}_config", agent_id);
        // Delete the setting to fall back to defaults
        // Note: This requires a delete_setting function - if not available, we can set to default JSON
        let default_config = AgentConfig::default_for_agent(agent_id);
        self.save_config(&default_config).await
    }

    /// Test if a model connection works
    pub async fn test_model_connection(
        &self,
        model_name: &str,
        _agent_id: &str,
        provider: &dyn crate::llm::LlmProvider,
    ) -> Result<bool> {
        // Simple health check - list models and see if our model is available
        match provider.list_models().await {
            Ok(models) => {
                // Check if model is in the list (case-insensitive)
                let model_lower = model_name.to_lowercase();
                let found = models.iter().any(|m| m.name.to_lowercase() == model_lower);
                Ok(found)
            }
            Err(e) => {
                tracing::warn!("Failed to list models for connection test: {}", e);
                Ok(false)
            }
        }
    }
}

/// Apply agent configuration to an Agent definition
pub fn apply_config_to_agent(agent: &mut Agent, config: &AgentConfig) {
    // Apply model override
    agent.model_override = Some(config.model_name.clone());

    // Apply max iterations
    agent.max_iterations = Some(config.max_iterations as usize);

    // Apply system prompt override if provided
    if let Some(ref override_prompt) = config.system_prompt_override {
        if !override_prompt.trim().is_empty() {
            agent.instructions = override_prompt.clone();
        }
    }

    // Filter tools if enabled_tools is specified and non-empty
    if !config.enabled_tools.is_empty() {
        agent
            .tool_ids
            .retain(|tool_id| config.enabled_tools.contains(tool_id));
    }
}

/// Get default configs for all standard agents
pub fn get_all_default_configs() -> Vec<AgentConfig> {
    vec![
        AgentConfig::default_for_agent("generalist"),
        AgentConfig::default_for_agent("operational_expert"),
        AgentConfig::default_for_agent("researcher"),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_configs() {
        let configs = get_all_default_configs();
        assert_eq!(configs.len(), 3);

        let generalist = configs.iter().find(|c| c.agent_id == "generalist").unwrap();
        assert_eq!(generalist.model_name, DEFAULT_GENERALIST_MODEL);
        assert_eq!(generalist.context_window, DEFAULT_GENERALIST_CONTEXT);

        let operational = configs
            .iter()
            .find(|c| c.agent_id == "operational_expert")
            .unwrap();
        assert_eq!(operational.context_window, DEFAULT_OPERATIONAL_CONTEXT);
    }

    #[test]
    fn test_config_serialization() {
        let config = AgentConfig::default_for_agent("generalist");
        let json = serde_json::to_string(&config).unwrap();

        let parsed: AgentConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.agent_id, config.agent_id);
        assert_eq!(parsed.model_name, config.model_name);
    }
}
