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

#[derive(Debug, Serialize)]
pub struct AgentInfoResponse {
    pub id: String,
    pub name: String,
    pub description: String,
    pub tool_count: usize,
    pub model_override: Option<String>,
    pub max_iterations: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct AgentConfigResponse {
    pub agent_id: String,
    pub agent_name: String,
    pub model_name: String,
    pub context_window: i32,
    pub max_messages_in_memory: i32,
    pub max_iterations: i32,
    pub enabled_tools: Vec<String>,
    pub system_prompt_override: Option<String>,
}

#[tauri::command]
pub async fn list_agents(state: State<'_, AppState>) -> ZenResult<Vec<AgentInfoResponse>> {
    let agents = state.agent_registry.list();
    Ok(agents
        .iter()
        .map(|a| AgentInfoResponse {
            id: a.id.clone(),
            name: a.name.clone(),
            description: a.description.clone().unwrap_or_default(),
            tool_count: a.tool_ids.len(),
            model_override: a.model_override.clone(),
            max_iterations: a.max_iterations,
        })
        .collect())
}

#[tauri::command]
pub async fn list_agents_with_configs(state: State<'_, AppState>) -> ZenResult<Vec<AgentConfigResponse>> {
    let pool = state.db().await?;

    let config_manager = crate::agent::config::AgentConfigManager::new(pool);
    let configs = config_manager
        .list_all_configs()
        .await
        .map_err(|e| crate::error::ZenError::Custom(e.to_string()))?;

    // Enrich with agent names from the registry
    Ok(configs
        .into_iter()
        .map(|c| {
            let agent_name = state
                .agent_registry
                .get(&c.agent_id)
                .map(|a| a.name.clone())
                .unwrap_or_else(|| c.agent_id.clone());

            AgentConfigResponse {
                agent_id: c.agent_id,
                agent_name,
                model_name: c.model_name,
                context_window: c.context_window,
                max_messages_in_memory: c.max_messages_in_memory,
                max_iterations: c.max_iterations,
                enabled_tools: c.enabled_tools,
                system_prompt_override: c.system_prompt_override,
            }
        })
        .collect())
}

#[tauri::command]
pub async fn spawn_agent(
    state: State<'_, AppState>,
    agent_id: String,
    _message: String,
    _options: Option<serde_json::Value>,
) -> ZenResult<String> {
    let agent = state
        .agent_registry
        .get(&agent_id)
        .cloned()
        .ok_or_else(|| {
            crate::error::ZenError::Custom(format!("Agent '{}' not found in registry", agent_id))
        })?;

    let instance = state
        .swarm
        .spawn_agent(agent)
        .await
        .map_err(|e| crate::error::ZenError::Custom(e.to_string()))?;

    Ok(format!(
        "Agent '{}' spawned successfully (instance: {})",
        instance.config.name, instance.id()
    ))
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
    state
        .swarm
        .scale_agents(&agent_type, count)
        .await
        .map_err(|e| e.into())
}

#[derive(Debug, Serialize)]
pub struct OrchestratorStatus {
    pub initialized: bool,
    pub active_plans: usize,
    pub completed_plans: usize,
    pub status: String,
}

#[tauri::command]
pub async fn orchestrator_get_status(state: State<'_, AppState>) -> ZenResult<serde_json::Value> {
    let initialized = state.orchestrator.is_initialized().await;

    // Try to get plan stats from DB
    let (active, completed) = if let Ok(db) = state.db().await {
        let active = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM orchestration_plans WHERE status NOT IN ('completed', 'failed')"
        )
        .fetch_one(&db)
        .await
        .unwrap_or(0) as usize;

        let completed = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM orchestration_plans WHERE status = 'completed'"
        )
        .fetch_one(&db)
        .await
        .unwrap_or(0) as usize;

        (active, completed)
    } else {
        (0, 0)
    };

    let status_str = if !initialized {
        "Not initialized"
    } else if active > 0 {
        "Active"
    } else {
        "Idle"
    };

    Ok(serde_json::json!({
        "initialized": initialized,
        "active_plans": active,
        "completed_plans": completed,
        "status": status_str,
    }))
}

#[tauri::command]
pub async fn run_tool_command(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    tool_name: String,
    args: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut registry = state.tools.write().await;
    let chat_id = "canvas-dynamic-execution".to_string();
    let tool_call = crate::tools::ToolCall {
        id: format!("dynamic-{}", uuid::Uuid::new_v4()),
        name: tool_name.clone(),
        arguments: args,
    };
    
    match registry.execute_authorized(app, chat_id, tool_call).await {
        Ok(output) => Ok(output.content),
        Err(e) => Err(e.to_string()),
    }
}

/// Resolve a pending tool approval request from the frontend.
///
/// The frontend calls this when the user clicks Approve or Deny on an inline
/// approval card.  We look up the `oneshot::Sender<bool>` that the runner
/// parked in `pending_tool_approvals`, remove it so it can only be resolved
/// once, then send the user's decision.
#[tauri::command]
pub async fn resolve_tool_approval(
    state: State<'_, AppState>,
    tool_call_id: String,
    approved: bool,
) -> ZenResult<()> {
    let sender = {
        let mut map = state.pending_tool_approvals.lock().await;
        map.remove(&tool_call_id)
    };

    match sender {
        Some(tx) => {
            // It is OK if the receiving end was already dropped (runner cancelled).
            let _ = tx.send(approved);
            tracing::info!(
                tool_call_id = %tool_call_id,
                approved = %approved,
                "Tool approval resolved"
            );
            Ok(())
        }
        None => {
            tracing::warn!(
                tool_call_id = %tool_call_id,
                "resolve_tool_approval: no pending approval found (already resolved or expired)"
            );
            // Return Ok rather than an error – the runner may have already timed out
            // or the user double-clicked; either way there is nothing harmful to do.
            Ok(())
        }
    }
}
