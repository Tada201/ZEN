use crate::agent::config_file;
use crate::commands::AppState;
use crate::error::ZenResult;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentConfigFileResponse {
    pub agent_id: String,
    pub model_name: String,
    pub max_iterations: u32,
    pub context_window: u32,
    pub max_messages_in_memory: u32,
    pub enabled_tools: Vec<String>,
    pub system_prompt_override: Option<String>,
    pub description: Option<String>,
}

impl From<config_file::AgentConfigFile> for AgentConfigFileResponse {
    fn from(c: config_file::AgentConfigFile) -> Self {
        Self {
            agent_id: c.agent_id,
            model_name: c.model_name,
            max_iterations: c.max_iterations,
            context_window: c.context_window,
            max_messages_in_memory: c.max_messages_in_memory,
            enabled_tools: c.enabled_tools,
            system_prompt_override: c.system_prompt_override,
            description: c.description,
        }
    }
}

impl From<AgentConfigFileResponse> for config_file::AgentConfigFile {
    fn from(r: AgentConfigFileResponse) -> Self {
        Self {
            agent_id: r.agent_id,
            model_name: r.model_name,
            max_iterations: r.max_iterations,
            context_window: r.context_window,
            max_messages_in_memory: r.max_messages_in_memory,
            enabled_tools: r.enabled_tools,
            system_prompt_override: r.system_prompt_override,
            description: r.description,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct AgentConfigFileInfo {
    pub agent_id: String,
    pub has_custom_config: bool,
}

#[derive(Debug, Serialize)]
pub struct ToolMetadataResponse {
    pub id: String,
    pub name: String,
    pub description: String,
    pub risk_level: String,
}

/// Load the config file for a specific agent.
#[tauri::command]
pub async fn get_agent_config_file(
    _state: State<'_, AppState>,
    agent_id: String,
) -> ZenResult<AgentConfigFileResponse> {
    config_file::load_agent_config(&agent_id)
        .map(AgentConfigFileResponse::from)
        .map_err(|e| crate::error::ZenError::Custom(e.to_string()))
}

/// Save (create/update) a per-agent config file.
#[tauri::command]
pub async fn save_agent_config_file(
    _state: State<'_, AppState>,
    agent_id: String,
    config: AgentConfigFileResponse,
) -> ZenResult<()> {
    let c: config_file::AgentConfigFile = config.into();
    config_file::save_agent_config(&agent_id, &c)
        .map_err(|e| crate::error::ZenError::Custom(e.to_string()))
}

/// Delete a per-agent config file (falls back to defaults).
#[tauri::command]
pub async fn delete_agent_config_file(
    _state: State<'_, AppState>,
    agent_id: String,
) -> ZenResult<()> {
    config_file::delete_agent_config(&agent_id)
        .map_err(|e| crate::error::ZenError::Custom(e.to_string()))
}

/// List all agent config files on disk.
#[tauri::command]
pub async fn list_agent_config_files(
    _state: State<'_, AppState>,
) -> ZenResult<Vec<AgentConfigFileInfo>> {
    let configs = config_file::list_agent_configs()
        .map_err(|e| crate::error::ZenError::Custom(e.to_string()))?;

    Ok(configs
        .into_iter()
        .map(|c| AgentConfigFileInfo {
            agent_id: c.agent_id.clone(),
            has_custom_config: true,
        })
        .collect())
}

/// Export an agent config to a user-chosen file path.
#[tauri::command]
pub async fn export_agent_config_file(
    _state: State<'_, AppState>,
    agent_id: String,
    export_path: String,
) -> ZenResult<()> {
    config_file::export_agent_config(&agent_id, &export_path)
        .map_err(|e| crate::error::ZenError::Custom(e.to_string()))
}

/// Import an agent config from a file path.
#[tauri::command]
pub async fn import_agent_config_file(
    _state: State<'_, AppState>,
    import_path: String,
    target_agent_id: Option<String>,
) -> ZenResult<AgentConfigFileResponse> {
    config_file::import_agent_config(&import_path, target_agent_id)
        .map(AgentConfigFileResponse::from)
        .map_err(|e| crate::error::ZenError::Custom(e.to_string()))
}

/// List available tools from the tool registry for config UI.
#[tauri::command]
pub async fn list_tools_for_config(
    state: State<'_, AppState>,
) -> ZenResult<Vec<ToolMetadataResponse>> {
    let metadata = state.tool_manager.list_metadata().await;
    Ok(metadata
        .into_iter()
        .map(|m| ToolMetadataResponse {
            id: m.id,
            name: m.name,
            description: m.description,
            risk_level: m.risk_level,
        })
        .collect())
}
