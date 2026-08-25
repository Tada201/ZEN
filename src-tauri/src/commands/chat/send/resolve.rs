//! Steps 2–2.5: provider/model resolution, the parallel input fan-out, and
//! the deferred regenerate truncate.

use super::*;

/// Everything the parallel fan-out returns for this turn.
pub(super) struct TurnInputs {
    pub llm_provider: Arc<dyn crate::llm::LlmProvider>,
    pub history: Vec<crate::db::models::Message>,
    pub tools_enabled_str: Option<String>,
    pub tool_yolo_mode_str: Option<String>,
    pub tools_yolo_mode_str: Option<String>,
    pub custom_prompt_setting: Option<String>,
}

/// Step 2 — resolve the active provider name and model for this turn, then
/// freeze the session's inherited model the first time it is known.
pub(super) async fn resolve_provider_and_model(
    db: &SqlitePool,
    chat_id: &str,
    provider: Option<&str>,
    model: Option<String>,
    is_regenerate: bool,
) -> ZenResult<(String, String)> {
    let resolved_provider_name = match provider {
        Some(p) if !p.is_empty() => p.to_string(),
        _ => {
            let active_setting = crate::db::queries::get_setting(db, "active_provider")
                .await
                .unwrap_or_default();
            active_setting.unwrap_or_else(|| "ollama".to_string())
        }
    };
    info!(
        chat_id = %chat_id,
        resolved_provider_name = %resolved_provider_name,
        "Resolving active LLM provider instance"
    );
    let active_model = match model {
        Some(m) if !m.is_empty() => m,
        _ => {
            let message =
                "No model selected. Open Settings → Models to choose a model.".to_string();
            // On regenerate the old turn is still intact; a persisted failed
            // row would stack on top of it. The IPC error toast is enough.
            if !is_regenerate {
                persist_sync_send_failure(db, chat_id, None, &message).await;
            }
            return Err(crate::error::ZenError::Custom(message));
        }
    };

    // Freeze this session's inherited model the first time it's known. Only
    // writes when the chat row has no model yet (created while "No Model" was
    // selected, or a legacy null row); an already-set session model is never
    // rewritten, so a mid-session Settings switch can't retarget an existing
    // session's subagents — only a new session picks up the new selection.
    let _ = queries::set_chat_model_if_unset(db, chat_id, &active_model).await;

    Ok((resolved_provider_name, active_model))
}

/// Step 2 — fetch provider instance, history and settings in parallel. A
/// failure here is a pre-flight failure: nothing destructive has run yet.
pub(super) async fn fetch_turn_inputs(
    state: &State<'_, AppState>,
    db: &SqlitePool,
    chat_id: &str,
    resolved_provider_name: &str,
    active_model: &str,
    is_regenerate: bool,
) -> ZenResult<TurnInputs> {
    info!(
        chat_id = %chat_id,
        resolved_provider_name,
        active_model,
        "Fetching provider, history, and settings in parallel"
    );
    let join_result = tokio::try_join!(
        state.provider_registry.create(resolved_provider_name),
        queries::get_messages(db, chat_id),
        state.settings_manager.get("tools_enabled"),
        state.settings_manager.get("tool_yolo_mode"),
        state.settings_manager.get("tools.yolo-mode"),
        async { queries::get_setting(db, "system_prompt").await },
    );
    if let Err(ref e) = join_result {
        // See the "No model" branch above: a failed regenerate must not
        // persist a failed row on top of the still-intact old turn.
        if !is_regenerate {
            persist_sync_send_failure(db, chat_id, Some(active_model), &e.to_string()).await;
        }
    }
    let (
        llm_provider,
        history,
        tools_enabled_str,
        tool_yolo_mode_str,
        tools_yolo_mode_str,
        custom_prompt_setting,
    ) = join_result?;
    info!(
        chat_id = %chat_id,
        history_count = history.len(),
        resolved_provider = resolved_provider_name,
        "Retrieved provider, chat history, and settings in parallel"
    );

    Ok(TurnInputs {
        llm_provider,
        history,
        tools_enabled_str,
        tool_yolo_mode_str,
        tools_yolo_mode_str,
        custom_prompt_setting,
    })
}

/// Step 2.5 — regenerate truncate. Every fallible pre-flight above has
/// succeeded, so this is the last destructive step before the runner spawns —
/// the only failures after this point go through the runner's own failed-row
/// persistence, so the chat can never end up with the old response
/// deleted and nothing replacing it. History was fetched before
/// truncation; slice it at the anchor (same ordering as `get_messages`)
/// instead of re-querying so no new failure mode exists between the
/// truncate and the spawn.
pub(super) async fn apply_regenerate_truncate(
    db: &SqlitePool,
    chat_id: &str,
    anchor_id: &str,
    history: Vec<crate::db::models::Message>,
) -> ZenResult<Vec<crate::db::models::Message>> {
    let removed = queries::truncate_messages_after(db, chat_id, anchor_id).await?;
    info!(
        chat_id,
        anchor = anchor_id,
        removed,
        "Regenerate truncated the previous turn"
    );
    Ok(match history.iter().position(|m| m.id == anchor_id) {
        Some(idx) => history[..=idx].to_vec(),
        // Anchor concurrently deleted between validation and truncation;
        // the truncate's self-join matched nothing, so nothing was
        // removed — keep the fetched history as-is.
        None => history,
    })
}

/// Step 3 — normalize generic reasoning intent against the model's resolved
/// capability. All capability/protocol logic lives in the provider +
/// reasoning resolver; the command only forwards intent.
pub(super) fn apply_reasoning(
    config: &mut ChatRequestConfig,
    llm_provider: &dyn crate::llm::LlmProvider,
    active_model: &str,
    thinking: &ThinkingConfig,
) {
    let intent = crate::llm::ReasoningIntent {
        enabled: thinking.enabled,
        effort: thinking.effort.clone(),
        budget_tokens: thinking.budget_tokens,
    };
    let capability = llm_provider.reasoning_capability(active_model);
    config.resolved_reasoning = Some(capability.normalize_request(&intent));
}