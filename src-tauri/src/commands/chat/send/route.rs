//! Orchestrator and standard-runner routing branches.

use super::*;

pub(super) struct RouteParams<'a> {
    pub app: AppHandle,
    pub state: &'a State<'a, AppState>,
    pub db: SqlitePool,
    pub chat_id: String,
    pub content: String,
    pub active_model: String,
    pub resolved_provider_name: String,
    pub llm_provider: Arc<dyn zen_llm::LlmProvider>,
    pub chat_messages: Vec<ChatMessage>,
    pub agent: crate::agent::types::Agent,
    pub config: ChatRequestConfig,
    pub generative_ui_addendum: Option<String>,
    pub token: CancellationToken,
    pub cancel_tokens: CancelTokens,
    pub pause_controls: PauseControls,
    pub model_context_window: Option<i64>,
    pub is_voice_mode: bool,
    pub display_agent_model: Option<String>,
    pub display_agent_provider: Option<String>,
    pub voice_display_context: Option<String>,
}

/// Step 6 — orchestrator branch. Returns the params back to the caller when
/// the orchestrator is unavailable so the standard runner can take over.
pub(super) async fn try_orchestrator(
    params: RouteParams<'_>,
) -> Result<(), RouteParams<'_>> {
    if !should_use_orchestrator(&params.content) {
        return Err(params);
    }
    let orchestrator = match params.state.orchestrator.get().await {
        Ok(orchestrator) => orchestrator,
        Err(e) => {
            tracing::warn!("Orchestrator not available: {:?}. Falling back to Runner.", e);
            return Err(params);
        }
    };

    let RouteParams {
        app,
        chat_id,
        content,
        active_model,
        llm_provider,
        chat_messages,
        agent,
        config,
        generative_ui_addendum,
        token,
        cancel_tokens,
        pause_controls,
        model_context_window,
        ..
    } = params;

    let provider_clone = llm_provider;
    let chat_id_inner = chat_id.clone();
    let content_inner = content;
    let model_inner = active_model;
    let config_clone = config;
    let token_clone = token;

    info!(chat_id, "Routing request to Orchestrator");
    let _ = app.emit(
        "chat:status",
        json!({
            "chat_id": chat_id,
            "message": "Starting orchestrator",
            "phase": "orchestrator_invoked",
            "iteration": 0
        }),
    );
    let cancel_tokens_clone = cancel_tokens;
    let pause_controls_clone = pause_controls;
    let app_error = app;
    let token_for_error = token_clone.clone();
    tokio::spawn(async move {
        let result = orchestrator
            .run_orchestrator_loop(
                crate::agent::orchestrator::execution::OrchestratorRunParams {
                    provider: provider_clone,
                    model: &model_inner,
                    messages: chat_messages,
                    chat_id: &chat_id_inner,
                    goal: &content_inner,
                    config: config_clone,
                    token: token_clone,
                    approval_rx: None,
                    extra_tool_ids: agent.tool_ids.clone(),
                    extra_instructions: generative_ui_addendum,
                    model_context_window: model_context_window
                        .filter(|&w| w > 0)
                        .map(|w| w as usize),
                },
            )
            .await;
        let mut tokens = cancel_tokens_clone.lock().await;
        tokens.remove(&chat_id_inner);
        pause_controls_clone.lock().await.remove(&chat_id_inner);
        if let Err(e) = &result {
            tracing::error!("Orchestrator error: {:?}", e);
            if token_for_error.is_cancelled() {
                let _ = app_error.emit(
                    "chat:done",
                    json!({
                        "chat_id": chat_id_inner,
                        "content": "Response stopped.",
                        "tokens_in": 0,
                        "tokens_out": 0,
                        "done": true
                    }),
                );
            }
        }
    });
    Ok(())
}

/// Standard fallback to Runner.
pub(super) async fn spawn_runner(params: RouteParams<'_>) {
    let RouteParams {
        app,
        state,
        db,
        chat_id,
        active_model,
        resolved_provider_name,
        llm_provider,
        chat_messages,
        agent,
        config,
        token,
        cancel_tokens,
        pause_controls,
        model_context_window,
        is_voice_mode,
        display_agent_model,
        display_agent_provider,
        voice_display_context,
        ..
    } = params;
    let chat_id_clone = chat_id;
    info!(chat_id = %chat_id_clone, "Routing request to standard Agent Chat Runner");
    let _ = app.emit(
        "chat:status",
        json!({
            "chat_id": chat_id_clone.clone(),
            "message": "Invoking model",
            "phase": "llm_invoked",
            "iteration": 0
        }),
    );
    let runner = {
        let mut r = Runner::new(
            app.state::<crate::services::agent_context::AgentContext>().inner().clone(),
            state.agent_registry.clone(),
            state.hook_registry.clone(),
        )
        .with_db_pool(db.clone())
        .with_voice_mode(
            is_voice_mode,
            display_agent_model,
            display_agent_provider.or_else(|| Some(resolved_provider_name.clone())),
            voice_display_context,
        );

        if let Some(ctx) = agent.context_window {
            r = r.with_max_context_tokens(ctx);
        }
        if let Some(max_msgs) = agent.max_messages_in_memory {
            r = r.with_max_messages_in_memory(max_msgs);
        }
        // The frontend passes the selected model's real context window
        // (`max_context_length`) so the context-usage gauge reflects the
        // actual model budget rather than the compaction cap. Ignore
        // non-positive values.
        r = r.with_model_context_window(
            model_context_window.filter(|&w| w > 0).map(|w| w as usize),
        );

        let token_budget = state
            .settings_manager
            .get("agent.token-budget")
            .await
            .ok()
            .flatten()
            .and_then(|v| v.parse::<usize>().ok())
            .filter(|&v| v > 0);
        r = r.with_token_budget(token_budget);

        r
    };

    let cancel_tokens_runner = cancel_tokens;
    let pause_controls_runner = pause_controls;
    let app_error = app.clone();
    let token_for_error = token.clone();
    tokio::spawn(async move {
        let result = runner
            .run(
                &*llm_provider,
                chat_id_clone.clone(),
                active_model,
                chat_messages,
                agent,
                config,
                token,
            )
            .await;
        let mut tokens = cancel_tokens_runner.lock().await;
        tokens.remove(&chat_id_clone);
        pause_controls_runner.lock().await.remove(&chat_id_clone);
        if let Err(e) = result {
            tracing::error!("Error in chat runner: {:?}", e);
            if token_for_error.is_cancelled() {
                let _ = app_error.emit(
                    "chat:done",
                    json!({
                        "chat_id": chat_id_clone,
                        "content": "Response stopped.",
                        "tokens_in": 0,
                        "tokens_out": 0,
                        "done": true
                    }),
                );
            }
        }
    });
}