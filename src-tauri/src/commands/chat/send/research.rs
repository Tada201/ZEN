//! Deep Research triage + routing branch.

use super::*;

/// Deep Research triage: the toggle is a global (localStorage) flag, so it
/// can stay armed across sessions. Rather than run the full multi-round
/// engine on every message, classify whether this request actually warrants
/// research. A clear DIRECT verdict downgrades to the normal runner;
/// errors/ambiguity fail open to research so genuine requests aren't dropped.
pub(super) async fn triage(
    app: &AppHandle,
    chat_id: &str,
    deep_research_on: bool,
    llm_provider: &dyn zen_llm::LlmProvider,
    active_model: &str,
    content: &str,
) -> bool {
    let run_deep_research = deep_research_on
        && deep_research_warranted(llm_provider, active_model, content).await;
    if deep_research_on && !run_deep_research {
        info!(
            chat_id,
            "Deep research toggled but triage downgraded request to a direct answer"
        );
        let _ = app.emit(
            "chat:status",
            json!({
                "chat_id": chat_id,
                "message": "Answering directly — deep research not needed for this",
                "phase": "triage",
                "iteration": 0
            }),
        );
    }
    run_deep_research
}

pub(super) struct DeepResearchRoute<'a> {
    pub app: AppHandle,
    pub state: &'a State<'a, AppState>,
    pub db: SqlitePool,
    pub chat_id: String,
    pub active_model: String,
    pub content: String,
    pub llm_provider: Arc<dyn zen_llm::LlmProvider>,
    pub config: ChatRequestConfig,
    pub thinking: Option<ThinkingConfig>,
    pub token: CancellationToken,
    pub cancel_tokens: CancelTokens,
    pub pause_controls: PauseControls,
    pub model_context_window: Option<i64>,
}

pub(super) async fn spawn_deep_research(params: DeepResearchRoute<'_>) {
    let DeepResearchRoute {
        app,
        state,
        db,
        chat_id,
        active_model,
        content,
        llm_provider,
        config,
        thinking,
        token,
        cancel_tokens,
        pause_controls,
        model_context_window,
    } = params;
    let chat_id_inner = chat_id.clone();
    let configured_research_model = state
        .settings_manager
        .get("deep_research_model")
        .await
        .ok()
        .flatten()
        .filter(|model| !model.trim().is_empty());
    let active_model_inner = configured_research_model.unwrap_or_else(|| active_model.clone());
    let content_inner = content;
    let provider_clone = llm_provider;
    // Deep Research may run on a different model family than the active
    // chat model. Re-normalize the generic thinking intent against the
    // model that will actually serve the request — reusing the active
    // model's resolved capability could send the wrong effort/budget
    // protocol (e.g. adaptive effort to a budget-only model).
    let mut research_config = config.clone();
    research_config.resolved_reasoning = thinking.as_ref().map(|t| {
        let intent = zen_llm::ReasoningIntent {
            enabled: t.enabled,
            effort: t.effort.clone(),
            budget_tokens: t.budget_tokens,
        };
        provider_clone
            .reasoning_capability(&active_model_inner)
            .normalize_request(&intent)
    });
    let cancel_tokens_clone = cancel_tokens.clone();
    let pause_controls_clone = pause_controls.clone();
    let db_clone = db;
    let parse_limit = |value: Option<String>, default: usize, min: usize, max: usize| {
        value
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or(default)
            .clamp(min, max)
    };
    let max_rounds = parse_limit(
        state.settings_manager.get("deep_research_max_rounds").await.ok().flatten(),
        6,
        2,
        8,
    );
    let max_urls_per_round = parse_limit(
        state
            .settings_manager
            .get("deep_research_max_sources_per_round")
            .await
            .ok()
            .flatten(),
        3,
        2,
        10,
    );
    let sub_agent_count = parse_limit(
        state
            .settings_manager
            .get("deep_research_parallel_agents")
            .await
            .ok()
            .flatten(),
        3,
        1,
        4,
    );

    info!(
        chat_id,
        model = %active_model_inner,
        max_rounds,
        max_urls_per_round,
        sub_agent_count,
        "Routing request to Deep Research Orchestrator"
    );
    let _ = app.emit(
        "chat:status",
        json!({
            "chat_id": chat_id,
            "message": "Starting deep research",
            "phase": "agent_invoked",
            "iteration": 0
        }),
    );
    tokio::spawn(async move {
        zen_agent::deep_research::run_deep_research(
            zen_agent::deep_research::DeepResearchParams {
                ctx: app.state::<zen_agent::context::AgentContext>().inner().clone(),
                db: db_clone,
                llm_provider: &*provider_clone,
                chat_id: chat_id_inner.clone(),
                model: active_model_inner,
                query: content_inner,
                config: research_config,
                token,
                max_rounds,
                max_urls_per_round,
                sub_agent_count,
                model_context_window: model_context_window
                    .filter(|&w| w > 0)
                    .map(|w| w as usize),
            },
        )
        .await;

        let mut tokens = cancel_tokens_clone.lock().await;
        tokens.remove(&chat_id_inner);
        pause_controls_clone.lock().await.remove(&chat_id_inner);
    });
}