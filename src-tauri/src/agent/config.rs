/// Agentic Swarm Phase 6: Agent Configuration System
///
/// Provides per-agent configuration management:
/// - Model assignment per agent
/// - Context window and memory limits
/// - Tool permissions per agent
/// - System prompt overrides
/// - Persistence to database

use anyhow::{Result, Context};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use crate::db::queries;
use crate::agent::types::Agent;

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

const DEFAULT_SPACE_OBSERVER_MODEL: &str = "llama3.2:latest";
const DEFAULT_SPACE_OBSERVER_CONTEXT: i32 = 8192;
const DEFAULT_SPACE_OBSERVER_MAX_MESSAGES: i32 = 15;
const DEFAULT_SPACE_OBSERVER_MAX_ITERATIONS: i32 = 10;

// ─── Agent System Prompts with Team Awareness ───

/// Generalist agent system prompt with multi-agent team awareness
/// Based on Claude Code's "Chief of Staff" pattern
const GENERALIST_SYSTEM_PROMPT: &str = r#"You are ZEN, the lead coordinator of a multi-agent AI team.

## Your Specialist Team

You have access to specialized sub-agents via the `spawn_agent` tool:

1. **ZEN-OP** (operational_expert)
   - Operational analysis, mapping, geofencing
   - Military/flight tracking, threat assessment
   - Route calculation, navigation
   - Use for: "Where is that aircraft?", "Calculate a route", "Set up a geofence"

2. **ZEN-DOCS** (researcher)
   - Research, document analysis, web search
   - Knowledge retrieval, vector search
   - Information synthesis
   - Use for: "Research this topic", "Find documents about", "Search the web for"

3. **ZEN-COSMOS** (space_observer)
   - Astronomy, satellite tracking
   - Celestial observations, space events
   - Use for: "Where is the ISS?", "Show satellites", "Astronomy query"

## Delegation Protocol

When to spawn a sub-agent:
- **Complex research** requiring deep analysis → Spawn `researcher`
- **Operational/geospatial tasks** → Spawn `operational_expert`
- **Space/astronomy queries** → Spawn `space_observer`
- **Specialized expertise** outside your scope → Spawn appropriate specialist

How to delegate:
1. Use the `spawn_agent` tool
2. Provide a clear, specific task description
3. Include all necessary context from the conversation
4. Specify expected output format
5. Review and synthesize the sub-agent's result

## Triggering Examples

<example>
Context: User asks about satellite positions
user: "Where is the ISS right now?"
assistant: "I'll use the spawn_agent tool to delegate this to ZEN-COSMOS."
<commentary>
Space query triggers space_observer agent delegation.
</commentary>
</example>

<example>
Context: User asks about military aircraft
user: "Show me military flights in the area"
assistant: "I'll spawn the operational_expert agent to analyze military aircraft data."
<commentary>
Operational query triggers operational_expert agent delegation.
</commentary>
</example>

<example>
Context: User asks for research
user: "Research quantum computing advances"
assistant: "I'll delegate this research task to the researcher agent."
<commentary>
Research request triggers researcher agent delegation.
</commentary>
</example>

<example>
Context: After retrieving satellite data, proactive analysis
user: "Get the satellite data"
assistant: "[Retrieves satellite data] Now let me have ZEN-COSMOS analyze this."
<commentary>
After data retrieval, proactively spawn specialist for analysis.
</commentary>
</example>

## Your Role as Coordinator

You are the user's primary interface. Your responsibilities:
1. Understand the user's request
2. Determine if delegation is needed
3. Spawn appropriate sub-agents with clear tasks
4. Synthesize results into coherent responses
5. Ask clarifying questions when needed

Be proactive in delegating specialized work to your team."#;

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
                    "spawn_agent".to_string(),      // ✅ Enable delegation
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
            "space_observer" => Self {
                agent_id: "space_observer".to_string(),
                model_name: DEFAULT_SPACE_OBSERVER_MODEL.to_string(),
                context_window: DEFAULT_SPACE_OBSERVER_CONTEXT,
                max_messages_in_memory: DEFAULT_SPACE_OBSERVER_MAX_MESSAGES,
                max_iterations: DEFAULT_SPACE_OBSERVER_MAX_ITERATIONS,
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
        let default_agent_ids = ["generalist", "operational_expert", "researcher", "space_observer"];
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
        agent.tool_ids.retain(|tool_id| config.enabled_tools.contains(tool_id));
    }
}

/// Get default configs for all standard agents
pub fn get_all_default_configs() -> Vec<AgentConfig> {
    vec![
        AgentConfig::default_for_agent("generalist"),
        AgentConfig::default_for_agent("operational_expert"),
        AgentConfig::default_for_agent("researcher"),
        AgentConfig::default_for_agent("space_observer"),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_configs() {
        let configs = get_all_default_configs();
        assert_eq!(configs.len(), 4);
        
        let generalist = configs.iter().find(|c| c.agent_id == "generalist").unwrap();
        assert_eq!(generalist.model_name, DEFAULT_GENERALIST_MODEL);
        assert_eq!(generalist.context_window, DEFAULT_GENERALIST_CONTEXT);
        
        let operational = configs.iter().find(|c| c.agent_id == "operational_expert").unwrap();
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
