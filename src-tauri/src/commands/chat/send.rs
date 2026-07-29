//! Heavy-lifter: `send_message` Tauri command.
//! Coordinates history conversion, tool-intent check, active model/provider
//! resolution, deep research routing, orchestrator routing, and standard
//! runner execution.

use serde_json::json;
use tauri::{AppHandle, Emitter, State};
use tokio_util::sync::CancellationToken;
use tracing::{error, info};

use crate::agent::runner::Runner;
use crate::commands::AppState;
use crate::db::models::ChatMessage;
use crate::db::queries;
use crate::error::ZenResult;
use crate::llm::ChatRequestConfig;

use super::helpers::{
    deep_research_warranted, default_tool_intent_ids, default_yolo_tool_ids, has_tool_intent,
    persist_sync_send_failure, should_use_orchestrator, ThinkingConfig,
};

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
    image_gen: Option<bool>,
    tools: Option<Vec<String>>,
    attachments: Option<Vec<crate::db::models::Attachment>>,
    system_prompt: Option<String>,
    system_prompt_mode: Option<String>,
    voice_display_context: Option<String>,
    model_context_window: Option<i64>,
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
    if queries::get_chat(&db, &chat_id).await.is_err() {
        return Err(crate::error::ZenError::Custom(format!(
            "Chat session {} no longer exists.",
            chat_id
        )));
    }

    // 1. Add user message to DB
    let attachments_json = attachments.as_ref().and_then(|atts| {
        match serde_json::to_string(atts) {
            Ok(json_str) => Some(json_str),
            Err(e) => {
                error!("Failed to serialize attachments: {}", e);
                None
            }
        }
    });

    info!(chat_id = %chat_id, "Inserting user message into database");
    queries::add_message(
        &db,
        &queries::NewMessage {
            chat_id: &chat_id,
            role: "user",
            content: &content,
            model: model.as_deref(),
            is_complete: true,
            attachments: attachments_json.as_deref(),
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

    // 4. Convert history to ChatMessage format
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

            let mut final_content = m.content;
            let mut final_images = m
                .images
                .as_deref()
                .and_then(|img_str| serde_json::from_str::<Vec<String>>(img_str).ok())
                .unwrap_or_default();

            if let Some(ref att_str) = m.attachments {
                if let Ok(atts) = serde_json::from_str::<Vec<crate::db::models::Attachment>>(att_str) {
                    for att in atts {
                        if att.mime_type.starts_with("image/") {
                            final_images.push(att.data.clone());
                        } else if let Some(ref text) = att.extracted_text {
                            final_content.push_str(&format!("\n\n[Attachment: {}]\n{}", att.name, text));
                        } else {
                            tracing::warn!(
                                "Non-image attachment '{}' (mime: {}) ignored because extracted_text is missing.",
                                att.name,
                                att.mime_type
                            );
                        }
                    }
                }
            }

            let images_opt = if final_images.is_empty() {
                None
            } else {
                Some(final_images)
            };

            Some(ChatMessage {
                role,
                content: final_content,
                reasoning_details,
                images: images_opt,
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
    if image_gen.unwrap_or(false) {
        tool_ids.push("generate_image".to_string());
    }

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

    let default_instructions = "You are Zen, a powerful agentic AI assistant. Keep responses direct, short, and highly concise. Avoid redundant conversational fluff.

## 📊 Rich Content Markdown Support
Always use these specialized code blocks for visual scenarios:
1. 📊 CHARTS: Use ```chart with JSON schema: {\"type\":\"bar|line|area|pie\",\"title\":\"...\",\"xAxis\":\"x_key\",\"keys\":[\"y_key\"],\"data\":[{\"x_key\":\"val\",\"y_key\":num}]}.
2. 📐 ARCHITECTURE: Use ```mermaid code blocks for flowcharts, sequences, or component relationships.
3. 📁 STRUCTURE: Use ```tree with indentations to describe folder trees or directory structures.
4. 🃏 RICH CARDS: Use <card> block with JSON data to display rich visual cards. Available types: weather, stock, sports, flight, product, event, movie, book, person, nutrition, package, job, world_time. Format: <card>{\"type\":\"weather\",\"data\":{\"location\":\"Tokyo\",\"temperature\":22}}</card> or <card>{\"type\":\"world_time\",\"data\":{\"title\":\"Clocks\",\"clocks\":[{\"country\":\"Japan\",\"city\":\"Tokyo\",\"time\":\"8:30 PM\",\"timezone\":\"JST\",\"latitude\":35.67,\"longitude\":139.65}]}}</card>.
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

    if replace_system_prompt {
        // Per-turn replacements used by specialized surfaces like Voice. Own their contract.
    } else {
        if generative_ui.unwrap_or(false) {
            instructions.push_str("\n\n[SYSTEM STATE WARNING]\nIMPORTANT: The Generative UI feature is currently ENABLED for this message turn. You MUST generate any visual mockups, dashboards, grids, stacks, or styled templates inside ```openui ... ``` code blocks using the specified DSL catalog.");
        } else {
            instructions.push_str("\n\n[SYSTEM STATE WARNING]\nIMPORTANT: The Generative UI feature is currently DISABLED for this message turn. Do NOT generate any 'openui' or visual sandbox layout blocks. Provide all responses in plain, standard markdown or text.");
        }

        if image_gen.unwrap_or(false) || tool_ids.contains(&"generate_image".to_string()) {
            instructions.push_str("\n\n[IMAGE GENERATION CAPABILITY]\n\
            IMPORTANT: The Image Generation feature is currently ENABLED for this turn. The `generate_image` tool is available through the standard tool protocol. When the user asks to generate, create, draw, paint, or illustrate an image/artwork:\n\
            1. Call `tool_list({\"query\":\"image\"})` to discover the `generate_image` tool.\n\
            2. Call `tool_info({\"tool_id\":\"generate_image\"})` to read its schema.\n\
            3. Call `tool_exec({\"tool_id\":\"generate_image\",\"arguments\":{\"prompt\":\"<detailed description>\"}})` with a highly descriptive prompt.\n\
            4. After the tool returns, it will provide an `image_uri` (e.g., `asset://localhost/...`). You MUST display the generated image directly to the user inside your chat response block using standard markdown image syntax: `![Generated Image](image_uri)`. This is required because there is no automatic preview in the tool card, and the image will only render if you place it in your response text.\n\n\
            IMPORTANT: Do NOT call `generate_image` directly. Use `tool_list` -> `tool_info` -> `tool_exec` as with any other tool.");
        }
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
        max_messages_in_memory: None,
        description: Some("Customized assistant".to_string()),
        model_tier: crate::agent::types::ModelTier::Local,
    };

    let chat_id_clone = chat_id.clone();

    // Deep Research triage: the toggle is a global (localStorage) flag, so it
    // can stay armed across sessions. Rather than run the full multi-round
    // engine on every message, classify whether this request actually warrants
    // research. A clear DIRECT verdict downgrades to the normal runner below;
    // errors/ambiguity fail open to research so genuine requests aren't dropped.
    let deep_research_on = deep_research.unwrap_or(false);
    let run_deep_research = deep_research_on
        && deep_research_warranted(&*llm_provider, &active_model, &content).await;
    if deep_research_on && !run_deep_research {
        info!(
            chat_id = %chat_id,
            "Deep research toggled but triage downgraded request to a direct answer"
        );
        let _ = app.emit(
            "chat:status",
            json!({
                "chat_id": chat_id.clone(),
                "message": "Answering directly — deep research not needed for this",
                "phase": "triage",
                "iteration": 0
            }),
        );
    }

    // Deep Research branch
    if run_deep_research {
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
                    model_context_window: model_context_window
                        .filter(|&w| w > 0)
                        .map(|w| w as usize),
                },
            )
            .await;

            let mut tokens = cancel_tokens_clone.lock().await;
            tokens.remove(&chat_id_inner);
        });
        return Ok(());
    }

    // 6. Check Orchestrator
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

                info!(chat_id = %chat_id, "Routing request to Orchestrator");
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
                                extra_tool_ids: agent.tool_ids.clone(),
                                extra_instructions: None,
                                model_context_window: model_context_window
                                    .filter(|&w| w > 0)
                                    .map(|w| w as usize),
                            },
                        )
                        .await;
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
                                    "done": true
                                }),
                            );
                        }
                    }
                });
                return Ok(());
            }
            Err(e) => {
                tracing::warn!("Orchestrator not available: {:?}. Falling back to Runner.", e);
            }
        }
    }

    // Standard fallback to Runner
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
                        "done": true
                    }),
                );
            }
        }
    });

    Ok(())
}
