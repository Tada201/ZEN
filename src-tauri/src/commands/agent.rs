use tauri::State;
use crate::commands::AppState;
use crate::error::ZenResult;
use crate::agent::swarm::SwarmState;
use crate::agent::instance::AgentInstance;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct SwarmMetrics {
    pub state: SwarmState,
    pub agents: Vec<AgentInstance>,
}

#[tauri::command]
pub async fn swarm_get_all_metrics(state: State<'_, AppState>) -> ZenResult<SwarmMetrics> {
    let swarm = &state.swarm;
    let swarm_state = swarm.get_swarm_state().await;
    let agents = swarm.get_agents().await;
    
    Ok(SwarmMetrics {
        state: swarm_state,
        agents,
    })
}

#[tauri::command]
pub async fn swarm_scale_agents(
    state: State<'_, AppState>,
    agent_type: String,
    count: i32,
) -> ZenResult<()> {
    state.swarm.scale_agents(&agent_type, count).await.map_err(|e| e.into())
}

#[tauri::command]
pub async fn orchestrator_get_status(_state: State<'_, AppState>) -> ZenResult<String> {
    // Basic status for now
    Ok("Active".to_string())
}

#[tauri::command]
pub async fn discover_models(
    _state: State<'_, AppState>,
    provider: String,
    base_url: Option<String>,
    api_key: Option<String>,
) -> ZenResult<Vec<crate::db::models::ModelInfo>> {
    let p_type = provider.to_lowercase();
    
    // Create a temporary provider for discovery
    let config = crate::db::models::ProviderConfig {
        provider_type: p_type.clone(),
        base_url: base_url.unwrap_or_else(|| crate::llm::default_base_url(&p_type)),
        api_key: api_key.unwrap_or_default(),
        display_name: provider.clone(),
        headers: None,
    };
    
    let provider_instance = crate::llm::make_provider(&config);
    provider_instance.list_models().await
}
