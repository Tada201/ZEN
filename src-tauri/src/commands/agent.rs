use crate::commands::AppState;
use crate::error::ZenResult;
use serde::Serialize;
use tauri::State;
use crate::agent::types::{AgentConfigMode, AgentProfile};

#[derive(Debug, Serialize)]
pub struct AgentInfoResponse {
    pub id: String,
    pub name: String,
    pub description: String,
    pub instructions: String,
    pub tool_ids: Vec<String>,
    pub tool_count: usize,
    pub model_override: Option<String>,
    pub model_provider: Option<String>,
    pub max_iterations: Option<usize>,
    pub context_window: Option<usize>,
    pub max_messages_in_memory: Option<usize>,
    pub model_tier: String,
    pub color: Option<String>,
    pub user_invocable: bool,
    pub model_invocable: bool,
    pub allow_nested_delegation: bool,
    pub allowed_agent_ids: Vec<String>,
    pub inject_agents_md: bool,
    pub is_builtin: bool,
    pub user_editable: bool,
    pub config_mode: String,
}

async fn validate_profile_tools(state: &AppState, profile: &AgentProfile) -> ZenResult<()> {
    for tool_id in &profile.agent.tool_ids {
        if !state.tool_manager.exists(tool_id).await {
            return Err(crate::error::ZenError::Custom(format!(
                "Unknown or unavailable tool '{}'. Refresh the tool list and try again.",
                tool_id
            )));
        }
    }
    Ok(())
}

fn agent_response(state: &AppState, profile: AgentProfile) -> AgentInfoResponse {
    let is_builtin = state.agent_registry.is_builtin(&profile.agent.id);
    let is_model_only = matches!(profile.config_mode, AgentConfigMode::ModelOnly);
    let config_mode = match profile.config_mode {
        AgentConfigMode::ModelOnly => "model_only",
        AgentConfigMode::ReadOnly => "read_only",
        AgentConfigMode::Full if is_builtin => "read_only",
        AgentConfigMode::Full => "full",
    };
    AgentInfoResponse {
        id: profile.agent.id,
        name: profile.agent.name,
        description: profile.agent.description.unwrap_or_default(),
        // Do not expose fixed built-in prompts to the settings surface.
        instructions: if is_model_only { String::new() } else { profile.agent.instructions },
        tool_ids: profile.agent.tool_ids.clone(),
        tool_count: profile.agent.tool_ids.len(),
        model_override: profile.agent.model_override,
        model_provider: profile.model_provider,
        max_iterations: profile.agent.max_iterations,
        context_window: profile.agent.context_window,
        max_messages_in_memory: profile.agent.max_messages_in_memory,
        model_tier: profile.agent.model_tier.description().to_string(),
        color: profile.color,
        user_invocable: profile.user_invocable,
        model_invocable: profile.model_invocable,
        allow_nested_delegation: profile.allow_nested_delegation,
        allowed_agent_ids: profile.allowed_agent_ids,
        inject_agents_md: profile.inject_agents_md,
        is_builtin,
        user_editable: !is_builtin,
        config_mode: config_mode.to_string(),
    }
}

#[tauri::command]
pub async fn list_agents(state: State<'_, AppState>) -> ZenResult<Vec<AgentInfoResponse>> {
    Ok(state
        .agent_registry
        .list_profiles()
        .into_iter()
        .map(|profile| agent_response(&state, profile))
        .collect())
}

#[tauri::command]
pub async fn create_agent(state: State<'_, AppState>, profile: AgentProfile) -> ZenResult<AgentInfoResponse> {
    validate_profile_tools(&state, &profile).await?;
    if state.agent_registry.get(&profile.agent.id).is_some() {
        return Err(crate::error::ZenError::Custom("An agent with this ID already exists.".to_string()));
    }
    let saved = state
        .agent_registry
        .save_user_profile(profile)
        .map_err(crate::error::ZenError::Custom)?;
    Ok(agent_response(&state, saved))
}

#[tauri::command]
pub async fn update_agent(state: State<'_, AppState>, profile: AgentProfile) -> ZenResult<AgentInfoResponse> {
    validate_profile_tools(&state, &profile).await?;
    if state.agent_registry.get(&profile.agent.id).is_none() {
        return Err(crate::error::ZenError::Custom("Agent not found.".to_string()));
    }
    let saved = state
        .agent_registry
        .save_user_profile(profile)
        .map_err(crate::error::ZenError::Custom)?;
    Ok(agent_response(&state, saved))
}

#[tauri::command]
pub async fn set_voice_display_model(
    state: State<'_, AppState>,
    model: Option<String>,
) -> ZenResult<()> {
    let value = model.unwrap_or_default();
    if value.len() > 256 || value.chars().any(|character| character == '\n' || character == '\r') {
        return Err(crate::error::ZenError::Custom("Invalid voice display model selection.".to_string()));
    }
    state
        .settings_manager
        .set("voiceDisplayAgentModel".to_string(), value)
        .await
        .map_err(|error| crate::error::ZenError::Custom(error.to_string()))
}

#[tauri::command]
pub async fn delete_agent(state: State<'_, AppState>, agent_id: String) -> ZenResult<bool> {
    state
        .agent_registry
        .delete_user_profile(&agent_id)
        .map_err(crate::error::ZenError::Custom)
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
        instance.config.name,
        instance.id()
    ))
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
        crate::db::queries::get_orchestration_plan_counts(&db)
            .await
            .unwrap_or((0, 0))
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

/// Execute a tool call initiated from the OpenUI canvas.
///
/// Routes through the full v2 tool permission pipeline (check_permission +
/// approval flow) with the real chat session id. Rejects calls that cannot
/// be tied back to a real active session.
#[tauri::command]
pub async fn run_tool_command(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    tool_name: String,
    args: serde_json::Value,
    chat_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let chat_id = chat_id
        .filter(|id| !id.is_empty() && id != "canvas-dynamic-execution")
        .ok_or_else(|| {
            "run_tool_command requires a valid chat_id (no active session)".to_string()
        })?;

    let tool_call_id = format!("openui-{}", uuid::Uuid::new_v4());
    let tool_call = crate::tools::ToolCall {
        id: tool_call_id.clone(),
        name: tool_name.clone(),
        arguments: args.clone(),
    };

    let renderer_allowed = {
        let registry = state.tools.read().await;
        registry.is_direct_tool(&tool_name)
            && matches!(
                registry.direct_tool_risk(&tool_name),
                Some(crate::tools::permission::RiskLevel::Low)
                    | Some(crate::tools::permission::RiskLevel::Medium)
            )
    };
    if !renderer_allowed {
        return Err(format!(
            "Tool '{}' is not available through renderer-initiated execution.",
            tool_name
        ));
    }

    state
        .tool_service
        .execute_interactive(app, "run_tool_command", chat_id, tool_call)
        .await
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
    remember_exact: Option<bool>,
) -> ZenResult<()> {
    let sender = {
        let mut map = state.pending_tool_approvals.lock().await;
        map.remove(&tool_call_id)
    };

    match sender {
        Some(tx) => {
            if approved && remember_exact.unwrap_or(false) {
                let cache_key = format!("{}:{}", tx.tool_name, tx.args_hash);
                {
                    let mut session_permissions = state.session_permissions.lock().await;
                    session_permissions
                        .entry(tx.chat_id.clone())
                        .or_default()
                        .insert(cache_key.clone(), true);
                }
                if let Ok(db) = state.db().await {
                    let perm = crate::db::queries::SessionPermission {
                        id: uuid::Uuid::new_v4().to_string(),
                        chat_id: tx.chat_id.clone(),
                        tool_name: tx.tool_name.clone(),
                        args_hash: tx.args_hash.clone(),
                        pattern: Some("exact".to_string()),
                        granted_at: chrono::Utc::now().to_rfc3339(),
                    };
                    if let Err(e) = crate::db::queries::upsert_session_permission(&db, &perm).await
                    {
                        tracing::warn!(
                            tool_call_id = %tool_call_id,
                            chat_id = %tx.chat_id,
                            tool_name = %tx.tool_name,
                            error = %e,
                            "Failed to persist exact session tool approval; in-memory grant remains active"
                        );
                    }
                }
                tracing::info!(
                    tool_call_id = %tool_call_id,
                    chat_id = %tx.chat_id,
                    tool_name = %tx.tool_name,
                    permission_key = %cache_key,
                    "Remembered exact tool approval for this session"
                );
            }
            // It is OK if the receiving end was already dropped (runner cancelled).
            let args_hash = tx.args_hash.clone();
            let _ = tx.sender.send(crate::services::tool::ToolApprovalDecision {
                approved,
                args_hash,
            });
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
            Err(crate::error::ZenError::Custom(
                "Tool approval is missing, expired, or already resolved".to_string(),
            ))
        }
    }
}
