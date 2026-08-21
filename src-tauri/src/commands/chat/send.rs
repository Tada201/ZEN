//! Heavy-lifter: `send_message` Tauri command.
//! Coordinates history conversion, tool-intent check, active model/provider
//! resolution, deep research routing, orchestrator routing, and standard
//! runner execution.

use serde_json::json;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
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

/// Invariant output rules appended to every assistant prompt, including custom
/// replacement prompts. Rendering and timeline correctness must not depend on
/// a user's optional persona prompt remembering the transport contract.
const DETERMINISTIC_MESSAGE_RENDERING_CONTRACT: &str = r#"

## Deterministic Message and Timeline Contract
- Produce one assistant response stream. Do not emit internal event envelopes, `steps_json`, lifecycle records, fake tool results, or renderer instructions as user-facing content.
- Keep the response chronological: explain the current step, request or run the relevant tool, then describe only the result that has actually returned. Never place a later result before the tool that produced it, and never merge separate execution iterations into one narrative batch.
- Tools that belong to one explicitly parallel execution batch may be requested together. Sequential tool calls are separate execution units; do not claim they were parallel or completed together.
- Preserve normal Markdown. Close every fenced block, use one language tag, and never nest or concatenate fences. Keep `chart` blocks as raw valid JSON, `mermaid` blocks as valid Mermaid, `tree` blocks as plain indented paths, and `openui` blocks as valid OpenUI DSL only when that capability is enabled.
- Do not put prose, Markdown headings, comments, or trailing commas inside raw JSON blocks. Do not emit raw HTML/React tags or XML-like control tags in the answer. Use the supported `<card>{...}</card>` form only when a rich card is appropriate and keep its JSON complete.
- Keep tool arguments and tool output in the tool protocol. In the assistant answer, use concise Markdown summaries and link each claim to the immediately preceding completed step. If a tool fails, state the failure and recovery action instead of inventing a successful result.
- Do not repeat the same answer in both a streamed fragment and a final summary. The final response may reconcile earlier fragments, but must not reorder or duplicate their meaning.
"#;

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
    message_kind: Option<String>,
) -> ZenResult<()> {
    info!(
        chat_id = %chat_id,
        content_len = %content.len(),
        model = ?model,
        provider = ?provider,
        web_search = ?web_search,
        deep_research = ?deep_research,
        generative_ui = ?generative_ui,
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
    // Non-image attachments are registered into the chat's attachment store so
    // the agent retrieves them ON DEMAND via list/read tools — their text is no
    // longer stuffed into the prompt (wasteful). Images stay inline for the
    // vision path. On registration success we strip the heavy base64/text from
    // the persisted message row; on failure we keep them so nothing is lost.
    let mut attachments = attachments;
    if let Some(atts) = attachments.as_mut() {
        if !atts.is_empty() {
            match app.path().app_data_dir() {
                Ok(dir) => {
                    for att in atts.iter_mut() {
                        if att.mime_type.starts_with("image/") {
                            continue;
                        }
                        let Some(bytes) = decode_data_url(&att.data) else {
                            tracing::warn!(name = %att.name, "Attachment data was not a decodable data URL; leaving inline");
                            continue;
                        };
                        match state
                            .documents
                            .attach_to_chat(
                                dir.clone(),
                                chat_id.clone(),
                                att.name.clone(),
                                bytes,
                            )
                            .await
                        {
                            Ok(_) => {
                                att.data = String::new();
                                att.extracted_text = None;
                            }
                            Err(e) => {
                                tracing::warn!(chat_id = %chat_id, name = %att.name, error = %e, "Failed to register chat attachment; keeping inline text fallback");
                            }
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!(error = %e, "Could not resolve app data dir; attachments left inline");
                }
            }
        }
    }

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
            kind: message_kind.as_deref(),
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

    // Freeze this session's inherited model the first time it's known. Only
    // writes when the chat row has no model yet (created while "No Model" was
    // selected, or a legacy null row); an already-set session model is never
    // rewritten, so a mid-session Settings switch can't retarget an existing
    // session's subagents — only a new session picks up the new selection.
    let _ = queries::set_chat_model_if_unset(&db, &chat_id, &active_model).await;

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

    if let Some(t) = thinking.as_ref() {
        // Normalize generic reasoning intent against the model's resolved
        // capability. All capability/protocol logic lives in the provider +
        // reasoning resolver; the command only forwards intent.
        let intent = crate::llm::ReasoningIntent {
            enabled: t.enabled,
            effort: t.effort.clone(),
            budget_tokens: t.budget_tokens,
        };
        let capability = llm_provider.reasoning_capability(&active_model);
        config.resolved_reasoning = Some(capability.normalize_request(&intent));
    }

    let token = CancellationToken::new();

    // Register cancellation token — cancel any in-flight stream for this chat first.
    let cancel_tokens = state.chat_cancellation_tokens.clone();
    let pause_controls = state.chat_pause_controls.clone();
    {
        let mut tokens = cancel_tokens.lock().await;
        if let Some(old_token) = tokens.remove(&chat_id) {
            old_token.cancel();
            info!(chat_id = %chat_id, "Cancelled previous in-flight chat stream");
        }
        tokens.insert(chat_id.clone(), token.clone());
    }
    {
        let mut controls = pause_controls.lock().await;
        if let Some(old_control) = controls.remove(&chat_id) {
            old_control.resume();
        }
        controls.insert(chat_id.clone(), Arc::new(crate::commands::ChatPauseControl::new()));
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
                            if !att.data.is_empty() {
                                final_images.push(att.data.clone());
                            }
                        } else {
                            // Non-image attachments live in the chat attachment
                            // store and are read on demand via the document
                            // tools — do NOT inline their text into the prompt.
                            // A short marker keeps the model aware they exist.
                            // Legacy rows (pre-Phase-3) may still carry
                            // extracted_text; fall back to inlining those so old
                            // chats don't lose content.
                            match att.extracted_text.as_deref() {
                                Some(text) if !att.data.is_empty() => {
                                    final_content
                                        .push_str(&format!("\n\n[Attachment: {}]\n{}", att.name, text));
                                }
                                _ => {
                                    final_content.push_str(&format!(
                                        "\n\n[Attached file: {} — use list_documents / read_document_content to read it]",
                                        att.name
                                    ));
                                }
                            }
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

    // Thread goal: when `/goal` armed an objective for this chat, every turn
    // carries the goal contract and gains the `update_goal` tool so the model
    // can close the loop (complete with evidence / blocked) without the user.
    let thread_goal = queries::get_thread_goal(&db, &chat_id)
        .await
        .ok()
        .flatten()
        .filter(|g| g.status == crate::services::goal::GOAL_STATUS_ACTIVE);

    // 5. Build Agent
    let mut tool_ids = vec![];
    if web_search.unwrap_or(false) {
        tool_ids.push("web_search".to_string());
    }
    if image_gen.unwrap_or(false) {
        tool_ids.push("generate_image".to_string());
    }
    if thread_goal.is_some() {
        // The goal system block tells the model this tool exists; expose it
        // only while a goal is actually armed so idle chats don't carry it.
        tool_ids.push("update_goal".to_string());
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
4. 🃏 RICH CARDS: Use <card> block with JSON data to display rich visual cards. Available types: weather, stock, sports, flight, product, event, movie, book, person, nutrition, package, job, world_time. Format: <card>{\"type\":\"weather\",\"data\":{\"location\":\"Tokyo\",\"temperature\":22}}</card> or <card>{\"type\":\"world_time\",\"data\":{\"title\":\"Clocks\",\"clocks\":[{\"country\":\"Japan\",\"city\":\"Tokyo\",\"time\":\"8:30 PM\",\"timezone\":\"JST\",\"latitude\":35.67,\"longitude\":139.65}]}}</card>. Prefer plain Markdown by default; emit a <card> only when the data is a discrete structured entity that matches a catalog type (a weather reading, a stock quote, a flight, a product) and a card makes it more scannable than prose. One card per distinct entity. Never wrap narrative text, explanations, or generic lists in a card, and do not force unrelated data into a card type.
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

    // This is an invariant transport/rendering contract, not a persona
    // preference. Append it after custom instructions so replace-mode prompts
    // cannot accidentally disable deterministic Markdown and timeline output.
    if !instructions.contains("## Deterministic Message and Timeline Contract") {
        instructions.push_str(DETERMINISTIC_MESSAGE_RENDERING_CONTRACT);
    }

    if let Some(ref goal) = thread_goal {
        instructions.push_str(&crate::services::goal::goal_system_block(goal));
    }

    // Capability state is explicit for every turn, including custom
    // replacement prompts. Replace mode changes persona/instructions; it
    // cannot erase the renderer capability contract.
    let generative_ui_enabled = generative_ui.unwrap_or(false);
    let generative_ui_addendum = if generative_ui_enabled {
        Some("[SYSTEM STATE WARNING]\nIMPORTANT: The Generative UI feature is currently ENABLED for this message turn. You MAY generate visual mockups, dashboards, grids, stacks, or styled templates only inside exactly one ```openui ... ``` code block using the specified OpenUI DSL catalog. Do not emit raw OpenUI assignments outside the fence. If the user did not ask for a visual interface, prefer normal Markdown.".to_string())
    } else {
        Some("[SYSTEM STATE WARNING]\nIMPORTANT: The Generative UI feature is currently DISABLED for this message turn. Do NOT generate, suggest, or simulate any `openui`/`genui` fence, OpenUI assignment, visual sandbox layout, or canvas widget. Provide all responses in plain, standard Markdown or text. This prohibition applies even if the user asks for a UI mockup; describe it in Markdown instead.".to_string())
    };

    if let Some(ref addendum) = generative_ui_addendum {
        instructions.push_str("\n\n");
        instructions.push_str(addendum);
    }

    if !replace_system_prompt
        && (image_gen.unwrap_or(false) || tool_ids.contains(&"generate_image".to_string()))
    {
        instructions.push_str("\n\n[IMAGE GENERATION CAPABILITY]\n\
            IMPORTANT: The Image Generation feature is currently ENABLED for this turn. The `generate_image` tool is available through the standard tool protocol. When the user asks to generate, create, draw, paint, or illustrate an image/artwork:\n\
            1. Call `tool_list({\"query\":\"image\"})` to discover the `generate_image` tool.\n\
            2. Call `tool_info({\"tool_id\":\"generate_image\"})` to read its schema.\n\
            3. Call `tool_exec({\"tool_id\":\"generate_image\",\"arguments\":{\"prompt\":\"<detailed description>\"}})` with a highly descriptive prompt.\n\
            4. After the tool returns, it will provide an `image_uri` (e.g., `asset://localhost/...`). You MUST display the generated image directly to the user inside your chat response block using standard markdown image syntax: `![Generated Image](image_uri)`. This is required because there is no automatic preview in the tool card, and the image will only render if you place it in your response text.\n\n\
            IMPORTANT: Do NOT call `generate_image` directly. Use `tool_list` -> `tool_info` -> `tool_exec` as with any other tool.");
    }

    // Detect voice mode and read display agent settings
    let is_voice_mode = replace_system_prompt;
    // Voice display is a built-in automatic subagent. It is always enabled
    // for voice turns; its settings surface only selects the model.
    let display_agent_enabled = is_voice_mode;
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
        // Deep Research may run on a different model family than the active
        // chat model. Re-normalize the generic thinking intent against the
        // model that will actually serve the request — reusing the active
        // model's resolved capability could send the wrong effort/budget
        // protocol (e.g. adaptive effort to a budget-only model).
        let mut research_config = config.clone();
        research_config.resolved_reasoning = thinking.as_ref().map(|t| {
            let intent = crate::llm::ReasoningIntent {
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
                let pause_controls_clone = pause_controls.clone();
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
                                extra_instructions: generative_ui_addendum.clone(),
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
    let pause_controls_runner = pause_controls.clone();
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

    Ok(())
}

/// Decode a `data:<mime>;base64,<payload>` URL to raw bytes. Returns None for a
/// non-data-URL or malformed base64 (caller then leaves the attachment inline).
fn decode_data_url(data_url: &str) -> Option<Vec<u8>> {
    use base64::Engine;
    let comma = data_url.find(',')?;
    let (header, payload) = data_url.split_at(comma);
    if !header.starts_with("data:") || !header.contains(";base64") {
        return None;
    }
    base64::engine::general_purpose::STANDARD
        .decode(payload[1..].as_bytes())
        .ok()
}

#[cfg(test)]
mod tests {
    use super::decode_data_url;

    #[test]
    fn decodes_base64_data_url() {
        // "hi" → aGk=
        let bytes = decode_data_url("data:text/plain;base64,aGk=").unwrap();
        assert_eq!(bytes, b"hi");
    }

    #[test]
    fn rejects_non_data_url() {
        assert!(decode_data_url("https://example.com/x.png").is_none());
        assert!(decode_data_url("data:text/plain,plainnotbase64").is_none());
    }
}
