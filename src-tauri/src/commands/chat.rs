use crate::agent::runner::Runner;
use crate::commands::pagination::{normalize_page, page_from_fetch, Page};
use crate::commands::AppState;
use crate::db::models::{Chat, ChatMessage, ChatTag, Message};
use crate::db::queries;
use crate::error::ZenResult;
use crate::llm::ChatRequestConfig;
use serde_json::json;
use tauri::{AppHandle, Emitter, State};
use tokio_util::sync::CancellationToken;
use tracing::info;

async fn persist_sync_send_failure(
    db: &sqlx::SqlitePool,
    chat_id: &str,
    model: Option<&str>,
    error: &str,
) {
    let metadata = serde_json::json!({
        "error": error,
        "status": "failed",
        "recoverable": false,
    })
    .to_string();
    let _ = queries::add_message(
        db,
        &queries::NewMessage {
            chat_id,
            role: "assistant",
            content: error,
            model,
            is_complete: false,
            metadata: Some(&metadata),
            ..Default::default()
        },
    )
    .await;
}

#[tauri::command]
pub async fn create_chat(
    state: State<'_, AppState>,
    title: String,
    model: Option<String>,
) -> ZenResult<Chat> {
    info!(title = ?title, model = ?model, "Creating new chat session");
    let db = state.db().await?;
    let chat = queries::create_chat(&db, &title, model.as_deref()).await?;
    info!(chat_id = %chat.id, "Chat session created successfully");
    Ok(chat)
}

#[tauri::command]
pub async fn get_chats(state: State<'_, AppState>) -> ZenResult<Vec<Chat>> {
    let db = state.db().await?;
    queries::list_chats(&db).await
}

#[tauri::command]
pub async fn get_chats_page(
    state: State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> ZenResult<Page<Chat>> {
    let db = state.db().await?;
    let (limit, offset) = normalize_page(limit, offset);
    let items = queries::list_chats_page(&db, limit + 1, offset).await?;
    Ok(page_from_fetch(items, limit, offset))
}

#[tauri::command]
pub async fn get_messages(state: State<'_, AppState>, chat_id: String) -> ZenResult<Vec<Message>> {
    let db = state.db().await?;
    queries::get_messages(&db, &chat_id).await
}

#[tauri::command]
pub async fn get_messages_page(
    state: State<'_, AppState>,
    chat_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> ZenResult<Page<Message>> {
    let db = state.db().await?;
    let (limit, offset) = normalize_page(limit, offset);
    let items = queries::get_messages_page(&db, &chat_id, limit + 1, offset).await?;
    Ok(page_from_fetch(items, limit, offset))
}

#[tauri::command]
pub async fn delete_chat(state: State<'_, AppState>, chat_id: String) -> ZenResult<()> {
    let db = state.db().await?;
    // 0. Cancel any in-flight stream for this chat so the runner stops
    //    writing to a session that is about to be destroyed.
    {
        let mut tokens = state.chat_cancellation_tokens.lock().await;
        if let Some(token) = tokens.remove(&chat_id) {
            token.cancel();
            info!(chat_id = %chat_id, "delete_chat: cancelled active stream");
        }
    }
    // 1. Remove SQLite rows first (primary source of truth)
    queries::delete_chat(&db, &chat_id).await?;
    // 2. Best-effort: remove conversation vectors from LanceDB so deleted
    //    content cannot resurface via semantic recall.
    if let Ok(store) = state.conversation_store.get().await {
        if let Err(e) = store.delete_by_chat_id(&chat_id).await {
            tracing::warn!(
                chat_id = %chat_id,
                error = %e,
                "delete_chat: failed to remove conversation vectors from LanceDB (stale vectors may remain)"
            );
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn bulk_delete_chats(state: State<'_, AppState>, chat_ids: Vec<String>) -> ZenResult<()> {
    let db = state.db().await?;
    // 0. Cancel any in-flight streams for these chats so runners stop
    //    writing to sessions that are about to be destroyed.
    {
        let mut tokens = state.chat_cancellation_tokens.lock().await;
        for chat_id in &chat_ids {
            if let Some(token) = tokens.remove(chat_id) {
                token.cancel();
                info!(chat_id = %chat_id, "bulk_delete_chats: cancelled active stream");
            }
        }
    }
    // 1. Remove SQLite rows first
    queries::bulk_delete_chats(&db, &chat_ids).await?;
    // 2. Best-effort vector cleanup — same lifecycle as single delete
    if let Ok(store) = state.conversation_store.get().await {
        for chat_id in &chat_ids {
            if let Err(e) = store.delete_by_chat_id(chat_id).await {
                tracing::warn!(
                    chat_id = %chat_id,
                    error = %e,
                    "bulk_delete_chats: failed to remove conversation vectors from LanceDB"
                );
            }
        }
    }
    Ok(())
}

#[derive(Debug, serde::Deserialize)]
pub struct ThinkingConfig {
    pub enabled: bool,
    pub effort: Option<String>,
    pub budget_tokens: Option<i64>,
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn send_message(
    app: AppHandle,
    state: State<'_, AppState>,
    chat_id: String,
    content: String,
    model: Option<String>,
    provider: Option<String>,
    web_search: Option<bool>,
    deep_research: Option<bool>,
    temperature: Option<f64>,
    max_tokens: Option<i64>,
    top_p: Option<f64>,
    top_k: Option<i64>,
    presence_penalty: Option<f64>,
    frequency_penalty: Option<f64>,
    repeat_penalty: Option<f64>,
    seed: Option<i64>,
    stop: Option<Vec<String>>,
    thinking: Option<ThinkingConfig>,
    generative_ui: Option<bool>,
    tools: Option<Vec<String>>,
    _attachments: Option<Vec<crate::db::models::Attachment>>,
    system_prompt: Option<String>,
    system_prompt_mode: Option<String>,
    voice_display_context: Option<String>,
) -> ZenResult<()> {
    info!(
        chat_id = %chat_id,
        content_len = %content.len(),
        model = ?model,
        provider = ?provider,
        web_search = ?web_search,
        deep_research = ?deep_research,
        "Received send_message command"
    );
    let _ = app.emit(
        "chat:status",
        json!({
            "chat_id": chat_id.clone(),
            "message": "Request accepted",
            "phase": "accepted",
            "iteration": 0
        }),
    );
    let db = state.db().await?;

    // 0. Guard: verify the chat exists before doing any work.
    //    Rapid session switching can race with the frontend, causing
    //    send_message to target a chat that was just deleted.
    if queries::get_chat(&db, &chat_id).await.is_err() {
        return Err(crate::error::ZenError::Custom(
            format!("Chat session {} no longer exists.", chat_id)
        ));
    }

    // 1. Add user message to DB
    info!(chat_id = %chat_id, "Inserting user message into database");
    queries::add_message(
        &db,
        &queries::NewMessage {
            chat_id: &chat_id,
            role: "user",
            content: &content,
            model: model.as_deref(),
            is_complete: true,
            ..Default::default()
        },
    )
    .await?;
    info!(chat_id = %chat_id, "User message successfully saved to database");
    let _ = app.emit(
        "chat:status",
        json!({
            "chat_id": chat_id.clone(),
            "message": "Message saved",
            "phase": "persisted",
            "iteration": 0
        }),
    );

    // 2. Get active provider and model
    let resolved_provider_name = match provider.as_deref() {
        Some(p) if !p.is_empty() => p.to_string(),
        _ => {
            let active_setting = crate::db::queries::get_setting(&db, "active_provider")
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
            persist_sync_send_failure(&db, &chat_id, None, &message).await;
            return Err(crate::error::ZenError::Custom(message));
        }
    };

    info!(
        chat_id = %chat_id,
        resolved_provider_name = %resolved_provider_name,
        active_model = %active_model,
        "Fetching provider, history, and settings in parallel"
    );
    let join_result = tokio::try_join!(
        state.provider_registry.create(&resolved_provider_name),
        queries::get_messages(&db, &chat_id),
        state.settings_manager.get("tools_enabled"),
        state.settings_manager.get("tool_yolo_mode"),
        state.settings_manager.get("tools.yolo-mode"),
        async { queries::get_setting(&db, "system_prompt").await },
    );
    if let Err(ref e) = join_result {
        persist_sync_send_failure(&db, &chat_id, Some(&active_model), &e.to_string()).await;
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
        history_count = %history.len(),
        resolved_provider = %resolved_provider_name,
        "Retrieved provider, chat history, and settings in parallel"
    );
    let _ = app.emit(
        "chat:status",
        json!({
            "chat_id": chat_id.clone(),
            "message": format!("Provider ready: {}", resolved_provider_name),
            "phase": "provider_ready",
            "provider": resolved_provider_name.clone(),
            "model": active_model.clone(),
            "iteration": 0
        }),
    );

    // 3. Prepare config
    let mut config = ChatRequestConfig {
        temperature,
        max_tokens,
        top_p,
        top_k,
        presence_penalty,
        frequency_penalty,
        repeat_penalty,
        seed,
        stop,
        ..ChatRequestConfig::default()
    };

    if let Some(t) = thinking {
        if t.enabled {
            config.reasoning_effort = t.effort;
            config.thinking_budget = t.budget_tokens;
        }
    }

    let token = CancellationToken::new();

    // Register cancellation token — cancel any in-flight stream for this chat first.
    let cancel_tokens = state.chat_cancellation_tokens.clone();
    {
        let mut tokens = cancel_tokens.lock().await;
        if let Some(old_token) = tokens.remove(&chat_id) {
            old_token.cancel();
            info!(chat_id = %chat_id, "Cancelled previous in-flight chat stream");
        }
        tokens.insert(chat_id.clone(), token.clone());
    }

    // 4. Convert history to ChatMessage format (already fetched in parallel)
    let chat_messages: Vec<ChatMessage> = history
        .into_iter()
        .filter_map(|m| {
            let role = m.role;
            let tool_calls = m
                .tool_calls
                .as_deref()
                .and_then(|tc_str| serde_json::from_str(tc_str).ok());
            let reasoning_details = m
                .reasoning_details
                .as_deref()
                .and_then(|rd_str| serde_json::from_str(rd_str).ok());

            if role == "tool" && m.tool_call_id.as_deref().unwrap_or("").is_empty() {
                tracing::warn!(
                    chat_id = %chat_id,
                    message_id = %m.id,
                    "Skipping malformed historical tool message without tool_call_id"
                );
                return None;
            }

            Some(ChatMessage {
                role,
                content: m.content,
                reasoning_details,
                images: m
                    .images
                    .as_deref()
                    .and_then(|img_str| serde_json::from_str(img_str).ok()),
                tool_calls,
                tool_call_id: m.tool_call_id,
            })
        })
        .collect();

    // 5. Build Agent
    let mut tool_ids = vec![];
    if web_search.unwrap_or(false) {
        tool_ids.push("web_search".to_string());
    }

    // If specific tools were requested, use them. Otherwise only attach core
    // tools when the user asks for tool-like work. Simple chat stays lean.
    if let Some(requested_tools) = tools {
        tool_ids.extend(requested_tools);
    } else {
        let tools_enabled = tools_enabled_str
            .map(|s| s.trim() == "true")
            .unwrap_or(true);
        let yolo_mode = tool_yolo_mode_str
            .or(tools_yolo_mode_str)
            .map(|s| s.trim() == "true")
            .unwrap_or(false);

        if tools_enabled && llm_provider.supports_tools(&active_model) {
            if yolo_mode {
                tool_ids.extend(default_yolo_tool_ids());
            } else if has_tool_intent(&content) {
                tool_ids.extend(default_tool_intent_ids());
            }
        }
    }

    tool_ids.sort();
    tool_ids.dedup();

    // (custom_prompt_setting was already fetched in parallel above)

    let default_instructions = "You are Zen, a powerful agentic AI assistant. Keep responses direct, short, and highly concise. Avoid redundant conversational fluff.

## 🌟 Rich Content Markdown Support
Always use these specialized code blocks for visual scenarios:
1. 📊 CHARTS: Use ```chart with JSON schema: {\"type\":\"bar|line|area|pie\",\"title\":\"...\",\"xAxis\":\"x_key\",\"keys\":[\"y_key\"],\"data\":[{\"x_key\":\"val\",\"y_key\":num}]}.
2. 📐 ARCHITECTURE: Use ```mermaid code blocks for flowcharts, sequences, or component relationships.
3. 📁 STRUCTURE: Use ```tree with indentations to describe folder trees or directory structures.
4. 🃏 RICH CARDS: Use <card> block with JSON data to display rich visual cards. Available types: weather, stock, sports, flight, product, event, movie, book, person, nutrition, package, job. Format: <card>{\"type\":\"weather\",\"data\":{\"location\":\"Tokyo\",\"temperature\":22}}</card>.
5. 🧪 CANVAS (openui): Use ```openui containing layout primitive tags to render live interactive canvas widgets (when Gen UI is enabled).
6. 📢 ALERTS: Wrap callouts in standard blockquotes with headers (> [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING], > [!CAUTION]).

## 🚫 Critical Limitations & Strict Syntax Constraints
- Do not render raw HTML/React tags directly in plain text. All designs must be enclosed in the structural markdown blocks listed above.
- **CHART BLOCKS**: The content of ```chart MUST be RAW, VALID, PARSABLE JSON ONLY. Do NOT write markdown fences like ` ``` ` or the word `chart` INSIDE the block itself. Never double-escape characters or introduce control characters (like raw newlines, tabs, or backslashes inside string properties) that violate JSON standards.
- **MERMAID BLOCKS**: The content of ```mermaid MUST be strictly valid Mermaid syntax. Double check all bracket matchups, parentheses, arrow combinations, and diagram definitions (e.g. use standard flowcharts, sequence diagrams). Do NOT invent invalid keywords like `graph0]}}` or bad punctuation inside node definitions.
- **NEVER** write prefix markdown or metadata tags inside the code blocks. The code block opening tag (e.g. ```chart) must be immediately followed by the content (JSON/Mermaid code) and nothing else.".to_string();

    let base_instructions = match custom_prompt_setting {
        Some(p) if !p.trim().is_empty() => p,
        _ => default_instructions,
    };
    let replace_system_prompt = system_prompt_mode
        .as_deref()
        .map(|mode| mode.eq_ignore_ascii_case("replace"))
        .unwrap_or(false);
    let mut instructions = match system_prompt {
        Some(p) if replace_system_prompt && !p.trim().is_empty() => p,
        Some(p) if !p.trim().is_empty() && !base_instructions.trim().is_empty() => {
            format!("{}\n\n{}", base_instructions, p)
        }
        Some(p) if !p.trim().is_empty() => p,
        _ => base_instructions,
    };

    // Inject state watcher directive to prevent LLM context confusion
    if replace_system_prompt {
        // Per-turn replacements are used by specialized surfaces such as Voice Mode.
        // Those prompts own their output contract and should not inherit chat UI warnings.
    } else if generative_ui.unwrap_or(false) {
        instructions.push_str("\n\n[SYSTEM STATE WARNING]\nIMPORTANT: The Generative UI feature is currently ENABLED for this message turn. You MUST generate any visual mockups, dashboards, grids, stacks, or styled templates inside ```openui ... ``` code blocks using the specified DSL catalog.");
    } else {
        instructions.push_str("\n\n[SYSTEM STATE WARNING]\nIMPORTANT: The Generative UI feature is currently DISABLED for this message turn. Do NOT generate any 'openui' or visual sandbox layout blocks. Provide all responses in plain, standard markdown or text.");
    }

    // Detect voice mode and read display agent settings
    let is_voice_mode = replace_system_prompt;
    let display_agent_enabled = if is_voice_mode {
        state
            .settings_manager
            .get("voiceDisplayAgentEnabled")
            .await
            .ok()
            .flatten()
            .or(state
                .settings_manager
                .get("voice_display_agent_enabled")
                .await
                .ok()
                .flatten())
            .map(|v| v == "true")
            .unwrap_or(true)
    } else {
        false
    };
    let display_agent_selection = if is_voice_mode {
        state
            .settings_manager
            .get("voiceDisplayAgentModel")
            .await
            .ok()
            .flatten()
            .or(state
                .settings_manager
                .get("voice_display_agent_model")
                .await
                .ok()
                .flatten())
            .filter(|v| !v.is_empty())
    } else {
        None
    };
    let (display_agent_provider, display_agent_model) = display_agent_selection
        .as_deref()
        .and_then(|selection| selection.split_once("::"))
        .map(|(provider, model)| (Some(provider.to_string()), Some(model.to_string())))
        .unwrap_or_else(|| (None, display_agent_selection));

    let agent = crate::agent::types::Agent {
        id: "zen_assistant".to_string(),
        name: "Zen".to_string(),
        instructions,
        tool_ids,
        model_override: None,
        max_iterations: Some(20),
        context_window: None,
        description: Some("Customized assistant".to_string()),
        model_tier: crate::agent::types::ModelTier::Local,
    };

    let chat_id_clone = chat_id.clone();

    // Deep Research branch
    if deep_research.unwrap_or(false) {
        let chat_id_inner = chat_id.clone();
        let configured_research_model = state
            .settings_manager
            .get("deep_research_model")
            .await
            .ok()
            .flatten()
            .filter(|model| !model.trim().is_empty());
        let active_model_inner = configured_research_model.unwrap_or_else(|| active_model.clone());
        let content_inner = content.clone();
        let provider_clone = llm_provider.clone();
        let cancel_tokens_clone = cancel_tokens.clone();
        let db_clone = db.clone();
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
            chat_id = %chat_id,
            model = %active_model_inner,
            max_rounds,
            max_urls_per_round,
            sub_agent_count,
            "Routing request to Deep Research Orchestrator"
        );
        let _ = app.emit(
            "chat:status",
            json!({
                "chat_id": chat_id.clone(),
                "message": "Starting deep research",
                "phase": "agent_invoked",
                "iteration": 0
            }),
        );
        tokio::spawn(async move {
            crate::agent::deep_research::run_deep_research(
                crate::agent::deep_research::DeepResearchParams {
                    app: app.clone(),
                    db: db_clone,
                    llm_provider: &*provider_clone,
                    chat_id: chat_id_inner.clone(),
                    model: active_model_inner,
                    query: content_inner,
                    config,
                    token,
                    max_rounds,
                    max_urls_per_round,
                    sub_agent_count,
                },
            )
            .await;

            let mut tokens = cancel_tokens_clone.lock().await;
            tokens.remove(&chat_id_inner);
        });
        return Ok(());
    }

    // 6. Check if we should use Orchestrator (Phase 3). Orchestration is
    // explicit; web search alone should use the standard runner with the
    // web_search tool so first response does not wait on planning.
    let use_orchestrator = should_use_orchestrator(&content);

    if use_orchestrator {
        match state.orchestrator.get().await {
            Ok(orchestrator) => {
                let provider_clone = llm_provider.clone();
                let chat_id_inner = chat_id.clone();
                let content_inner = content.clone();
                let model_inner = active_model.clone();
                let config_clone = config.clone();
                let token_clone = token.clone();

                info!(chat_id = %chat_id, "Routing request to Orchestrator (multi-agent loop)");
                let _ = app.emit(
                    "chat:status",
                    json!({
                        "chat_id": chat_id.clone(),
                        "message": "Starting orchestrator",
                        "phase": "orchestrator_invoked",
                        "iteration": 0
                    }),
                );
                let cancel_tokens_clone = cancel_tokens.clone();
                let app_error = app.clone();
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
                            },
                        )
                        .await;
                    // Clean up cancellation token on completion
                    let mut tokens = cancel_tokens_clone.lock().await;
                    tokens.remove(&chat_id_inner);
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
                                    "reason": "cancelled",
                                    "done": true
                                }),
                            );
                        }
                        // Orchestrator emits chat:error for non-cancel failures.
                    }
                });
                return Ok(());
            }
            Err(e) => {
                tracing::warn!(
                    "Orchestrator not available: {:?}. Falling back to Runner.",
                    e
                );
            }
        }
    }
    // Fallback to Runner
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
            app.clone(),
            state.tool_registry_v1.clone(),
            state.agent_registry.clone(),
            state.hook_registry.clone(),
            state.tools.clone(),
            state.tool_manager.clone(),
        )
        .with_db_pool(db.clone())
        .with_voice_mode(
            is_voice_mode && display_agent_enabled,
            display_agent_model,
            display_agent_provider.or_else(|| Some(resolved_provider_name.clone())),
            voice_display_context,
        );

        // Apply per-agent overrides from AgentConfigFile
        if let Ok(cfg) = crate::agent::config_file::load_agent_config(&agent.id) {
            if cfg.context_window > 0 {
                r = r.with_max_context_tokens(cfg.context_window as usize);
            }
            if cfg.max_messages_in_memory > 0 {
                r = r.with_max_messages_in_memory(cfg.max_messages_in_memory as usize);
            }
        }

        r
    };

    let cancel_tokens_runner = cancel_tokens.clone();
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
        // Clean up cancellation token on completion
        let mut tokens = cancel_tokens_runner.lock().await;
        tokens.remove(&chat_id_clone);
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
                        "reason": "cancelled",
                        "done": true
                    }),
                );
            }
            // Runner already emitted chat:error for non-cancel failures.
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn update_chat_title(
    state: State<'_, AppState>,
    chat_id: String,
    title: String,
) -> ZenResult<()> {
    let db = state.db().await?;
    queries::update_chat_title(&db, &chat_id, &title).await
}

#[tauri::command]
pub async fn toggle_pin_chat(state: State<'_, AppState>, chat_id: String) -> ZenResult<()> {
    let db = state.db().await?;
    queries::toggle_pin_chat(&db, &chat_id).await
}

#[tauri::command]
pub async fn archive_chat(state: State<'_, AppState>, chat_id: String) -> ZenResult<()> {
    let db = state.db().await?;
    queries::archive_chat(&db, &chat_id).await
}

#[tauri::command]
pub async fn unarchive_chat(state: State<'_, AppState>, chat_id: String) -> ZenResult<()> {
    let db = state.db().await?;
    queries::unarchive_chat(&db, &chat_id).await
}

#[tauri::command]
pub async fn list_archived_chats(state: State<'_, AppState>) -> ZenResult<Vec<Chat>> {
    let db = state.db().await?;
    queries::list_archived_chats(&db).await
}

#[tauri::command]
pub async fn list_archived_chats_page(
    state: State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> ZenResult<Page<Chat>> {
    let db = state.db().await?;
    let (limit, offset) = normalize_page(limit, offset);
    let items = queries::list_archived_chats_page(&db, limit + 1, offset).await?;
    Ok(page_from_fetch(items, limit, offset))
}

#[tauri::command]
pub async fn search_chats(
    state: State<'_, AppState>,
    query: String,
    limit: Option<i64>,
) -> ZenResult<Vec<crate::db::models::SearchResult>> {
    let db = state.db().await?;
    queries::search_chats(&db, &query, limit).await
}

#[tauri::command]
pub async fn list_chat_tags_page(
    state: State<'_, AppState>,
    chat_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> ZenResult<Page<ChatTag>> {
    let db = state.db().await?;
    let (limit, offset) = normalize_page(limit, offset);
    let items = queries::list_chat_tags_page(&db, &chat_id, limit + 1, offset).await?;
    Ok(page_from_fetch(items, limit, offset))
}

#[tauri::command]
pub async fn list_all_chat_tags_page(
    state: State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> ZenResult<Page<ChatTag>> {
    let db = state.db().await?;
    let (limit, offset) = normalize_page(limit, offset);
    let items = queries::list_all_chat_tags_page(&db, limit + 1, offset).await?;
    Ok(page_from_fetch(items, limit, offset))
}

#[tauri::command]
pub async fn list_unique_tag_names_page(
    state: State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> ZenResult<Page<String>> {
    let db = state.db().await?;
    let (limit, offset) = normalize_page(limit, offset);
    let items = queries::list_unique_tag_names_page(&db, limit + 1, offset).await?;
    Ok(page_from_fetch(items, limit, offset))
}

// --- Folders ---

#[tauri::command]
pub async fn create_chat_folder(
    state: State<'_, AppState>,
    name: String,
    color: Option<String>,
    icon: Option<String>,
) -> ZenResult<crate::db::models::ChatFolder> {
    let db = state.db().await?;
    queries::create_chat_folder(&db, &name, color.as_deref(), icon.as_deref()).await
}

#[tauri::command]
pub async fn list_chat_folders(
    state: State<'_, AppState>,
) -> ZenResult<Vec<crate::db::models::ChatFolder>> {
    let db = state.db().await?;
    queries::list_chat_folders(&db).await
}

#[tauri::command]
pub async fn move_chat_to_folder(
    state: State<'_, AppState>,
    chat_id: String,
    folder_id: String,
) -> ZenResult<()> {
    let db = state.db().await?;
    queries::move_chat_to_folder(&db, &chat_id, &folder_id).await
}

#[tauri::command]
pub async fn delete_chat_folder(state: State<'_, AppState>, folder_id: String) -> ZenResult<()> {
    let db = state.db().await?;
    queries::delete_chat_folder(&db, &folder_id).await
}
#[tauri::command]
pub async fn update_chat_folder(
    state: State<'_, AppState>,
    folder_id: String,
    name: Option<String>,
    color: Option<String>,
) -> ZenResult<()> {
    let db = state.db().await?;
    queries::update_chat_folder(&db, &folder_id, name.as_deref(), color.as_deref()).await
}

#[tauri::command]
pub async fn remove_chat_from_folder(state: State<'_, AppState>, chat_id: String) -> ZenResult<()> {
    let db = state.db().await?;
    queries::remove_chat_from_folder(&db, &chat_id).await
}

#[tauri::command]
pub async fn bulk_archive_chats(
    state: State<'_, AppState>,
    chat_ids: Vec<String>,
) -> ZenResult<()> {
    let db = state.db().await?;
    queries::bulk_archive_chats(&db, &chat_ids).await
}

#[tauri::command]
pub async fn fork_chat(
    state: State<'_, AppState>,
    chat_id: String,
    message_id: String,
) -> ZenResult<Chat> {
    let db = state.db().await?;
    queries::fork_chat(&db, &chat_id, &message_id).await
}

#[tauri::command]
pub async fn abort_chat(state: State<'_, AppState>, chat_id: String) -> ZenResult<()> {
    info!(chat_id = %chat_id, "Aborting chat runner/orchestrator stream requested by user");
    let mut tokens = state.chat_cancellation_tokens.lock().await;
    if let Some(token) = tokens.remove(&chat_id) {
        token.cancel();
        info!(chat_id = %chat_id, "Successfully cancelled active chat stream cancellation token");
    } else {
        info!(chat_id = %chat_id, "No active stream cancellation token found for chat");
    }
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ChatExport {
    pub chat: Chat,
    pub messages: Vec<Message>,
}

#[tauri::command]
pub async fn export_chat(state: State<'_, AppState>, chat_id: String) -> ZenResult<ChatExport> {
    let db = state.db().await?;
    let chat = queries::get_chat(&db, &chat_id).await?;
    let messages = queries::get_messages(&db, &chat_id).await?;
    Ok(ChatExport { chat, messages })
}

#[tauri::command]
pub async fn import_chat(state: State<'_, AppState>, source_path: String) -> ZenResult<Chat> {
    let db = state.db().await?;
    let validated_path = crate::utils::validate_path(&source_path)?;
    let content = std::fs::read_to_string(&validated_path).map_err(|e| {
        crate::error::ZenError::Custom(format!("Failed to read export file: {}", e))
    })?;
    let export: ChatExport = serde_json::from_str(&content)
        .map_err(|e| crate::error::ZenError::Custom(format!("Invalid export format: {}", e)))?;

    let new_chat = queries::create_chat(
        &db,
        &format!("{} (Imported)", export.chat.title),
        export.chat.model.as_deref(),
    )
    .await?;

    for msg in export.messages {
        queries::add_message(
            &db,
            &queries::NewMessage {
                chat_id: &new_chat.id,
                id: Some(&msg.id),
                role: &msg.role,
                content: &msg.content,
                model: msg.model.as_deref(),
                is_complete: msg.is_complete.unwrap_or(1) == 1,
                tool_calls: msg.tool_calls.as_deref(),
                tool_call_id: msg.tool_call_id.as_deref(),
                images: msg.images.as_deref(),
                attachments: msg.attachments.as_deref(),
                tokens_in: msg.tokens_in,
                tokens_out: msg.tokens_out,
                reasoning_details: msg.reasoning_details.as_deref(),
                ..Default::default()
            },
        )
        .await?;
    }

    Ok(new_chat)
}

fn has_tool_intent(content: &str) -> bool {
    let lower_content = content.to_lowercase();
    let tool_keywords = [
        "run command",
        "run tests",
        "execute",
        "terminal",
        "shell",
        "read file",
        "open file",
        "write file",
        "edit file",
        "list files",
        "search files",
        "grep",
        "ripgrep",
        "cargo",
        "npm",
        "pnpm",
        "yarn",
        "pytest",
        "todo",
        "check the repo",
        "inspect the code",
        "modify",
        "implement",
        "fix the bug",
    ];

    tool_keywords
        .iter()
        .any(|keyword| lower_content.contains(keyword))
}

fn default_tool_intent_ids() -> Vec<String> {
    [
        "write_todos",
        "read_document_content",
        "list_documents",
        "grep_documents",
        "write_file",
        "edit_file",
        "run_command",
    ]
    .into_iter()
    .map(str::to_string)
    .collect()
}

fn default_yolo_tool_ids() -> Vec<String> {
    [
        "web_search",
        "web_fetch",
        "vector_search",
        "list_documents",
        "read_document_content",
        "grep_documents",
        "write_file",
        "edit_file",
        "run_command",
        "write_todos",
        "system_metrics",
        "get_system_metrics",
        "spawn_agent",
        "handoff_to_agent",
    ]
    .into_iter()
    .map(str::to_string)
    .collect()
}

fn should_use_orchestrator(content: &str) -> bool {
    let lower_content = content.to_lowercase();
    let explicit_orchestration_keywords = [
        "multi-agent",
        "multi agent",
        "orchestrate",
        "delegate",
        "sub-agent",
        "subagent",
        "spawn agents",
        "parallel agents",
    ];

    explicit_orchestration_keywords
        .iter()
        .any(|keyword| lower_content.contains(keyword))
}
