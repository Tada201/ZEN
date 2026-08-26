//! Heavy-lifter: `send_message` Tauri command.
//!
//! This file is the ordered turn pipeline only. Each numbered step delegates
//! to a sibling submodule so the sequencing — and the two correctness
//! invariants it encodes — stay readable in one screen:
//!   `validate` — step 0/0.5, read-only pre-flight (chat exists, regenerate
//!                anchor). Never mutates, so a failure leaves the old turn
//!                intact.
//!   `persist`  — step 1, attachment registration + user-row insert.
//!   `resolve`  — step 2/2.5/3, provider+model resolution, the parallel input
//!                fan-out, the deferred destructive regenerate truncate, and
//!                reasoning normalization.
//!   `history`  — step 4, DB rows → `Vec<ChatMessage>`.
//!   `prompt`   — step 5, tool ids, system-prompt composition, `Agent`.
//!   `research` — deep-research triage + branch.
//!   `route`    — orchestrator branch and standard-runner branch.

use serde_json::json;
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio_util::sync::CancellationToken;
use tracing::{error, info};

use crate::agent::runner::Runner;
use crate::commands::AppState;
use zen_db::models::ChatMessage;
use zen_db::queries;
use zen_core::error::ZenResult;
use zen_llm::ChatRequestConfig;

use super::helpers::{
    deep_research_warranted, default_tool_intent_ids, default_yolo_tool_ids, has_tool_intent,
    persist_sync_send_failure, should_use_orchestrator, ThinkingConfig,
};

mod history;
mod persist;
mod prompt;
mod research;
mod resolve;
mod route;
mod validate;

/// Shared alias for the per-chat cancellation registry held by `AppState`.
type CancelTokens = Arc<tokio::sync::Mutex<HashMap<String, CancellationToken>>>;
/// Shared alias for the per-chat pause registry held by `AppState`.
type PauseControls =
    Arc<tokio::sync::Mutex<HashMap<String, Arc<crate::commands::ChatPauseControl>>>>;

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
    attachments: Option<Vec<zen_db::models::Attachment>>,
    system_prompt: Option<String>,
    system_prompt_mode: Option<String>,
    voice_display_context: Option<String>,
    model_context_window: Option<i64>,
    message_kind: Option<String>,
    regenerate_from_message_id: Option<String>,
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
    let is_regenerate = regenerate_from_message_id.is_some();

    // 0. Guard: verify the chat exists before doing any work.
    validate::ensure_chat_exists(&db, &chat_id).await?;

    // 0.5 Regenerate: READ-ONLY validation; the destructive truncate is
    // deferred to step 2.5 (see `resolve::apply_regenerate_truncate`).
    let content = validate::resolve_turn_content(
        &db,
        &chat_id,
        content,
        regenerate_from_message_id.as_deref(),
    )
    .await?;

    // 1. Add user message to DB. Skipped on regenerate.
    persist::persist_user_turn(persist::PersistTurnParams {
        app: &app,
        documents: &state.documents,
        db: &db,
        chat_id: &chat_id,
        content: &content,
        model: model.as_deref(),
        attachments,
        message_kind: message_kind.as_deref(),
        is_regenerate,
    })
    .await?;

    // 2. Get active provider and model.
    let (resolved_provider_name, active_model) = resolve::resolve_provider_and_model(
        &db,
        &chat_id,
        provider.as_deref(),
        model,
        is_regenerate,
    )
    .await?;

    let resolve::TurnInputs {
        llm_provider,
        history,
        tools_enabled_str,
        tool_yolo_mode_str,
        tools_yolo_mode_str,
        custom_prompt_setting,
    } = resolve::fetch_turn_inputs(
        &state,
        &db,
        &chat_id,
        &resolved_provider_name,
        &active_model,
        is_regenerate,
    )
    .await?;

    // 2.5 Regenerate truncate: the last destructive step before the spawn.
    let history = match regenerate_from_message_id.as_deref() {
        Some(anchor_id) => {
            resolve::apply_regenerate_truncate(&db, &chat_id, anchor_id, history).await?
        }
        None => history,
    };

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
        resolve::apply_reasoning(&mut config, &*llm_provider, &active_model, t);
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
    let chat_messages = history::to_chat_messages(&chat_id, history);

    // Thread goal: when `/goal` armed an objective for this chat, every turn
    // carries the goal contract and gains the `update_goal` tool so the model
    // can close the loop (complete with evidence / blocked) without the user.
    let thread_goal = queries::get_thread_goal(&db, &chat_id)
        .await
        .ok()
        .flatten()
        .filter(|g| g.status == crate::services::goal::GOAL_STATUS_ACTIVE);

    // 5. Build Agent
    let tool_ids = prompt::assemble_tool_ids(prompt::ToolIdParams {
        web_search: web_search.unwrap_or(false),
        image_gen: image_gen.unwrap_or(false),
        has_thread_goal: thread_goal.is_some(),
        requested_tools: tools,
        tools_enabled_str: tools_enabled_str.as_deref(),
        tool_yolo_mode_str: tool_yolo_mode_str.as_deref(),
        tools_yolo_mode_str: tools_yolo_mode_str.as_deref(),
        llm_provider: &*llm_provider,
        active_model: &active_model,
        content: &content,
    });

    let replace_system_prompt = system_prompt_mode
        .as_deref()
        .map(|mode| mode.eq_ignore_ascii_case("replace"))
        .unwrap_or(false);
    let generative_ui_enabled = generative_ui.unwrap_or(false);
    let prompt::BuiltInstructions {
        instructions,
        generative_ui_addendum,
    } = prompt::build_instructions(prompt::InstructionParams {
        custom_prompt_setting,
        system_prompt,
        replace_system_prompt,
        thread_goal: thread_goal.as_ref(),
        generative_ui_enabled,
        image_gen: image_gen.unwrap_or(false),
        tool_ids: &tool_ids,
    });

    // Detect voice mode and read display agent settings. Voice display is
    // always on for a voice turn — there is no separate enable flag.
    let is_voice_mode = replace_system_prompt;
    let display_agent_enabled = is_voice_mode;
    let (display_agent_provider, display_agent_model) =
        prompt::resolve_voice_display(&state, display_agent_enabled).await;

    let agent = prompt::build_agent(instructions, tool_ids);

    let deep_research_on = deep_research.unwrap_or(false);
    let run_deep_research = research::triage(
        &app,
        &chat_id,
        deep_research_on,
        &*llm_provider,
        &active_model,
        &content,
    )
    .await;

    // Deep Research branch
    if run_deep_research {
        research::spawn_deep_research(research::DeepResearchRoute {
            app: app.clone(),
            state: &state,
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
        })
        .await;
        return Ok(());
    }

    // 6. Check Orchestrator, then fall back to the standard Runner.
    let route_params = route::RouteParams {
        app,
        state: &state,
        db,
        chat_id,
        content,
        active_model,
        resolved_provider_name,
        llm_provider,
        chat_messages,
        agent,
        config,
        generative_ui_addendum,
        token,
        cancel_tokens,
        pause_controls,
        model_context_window,
        is_voice_mode,
        display_agent_model,
        display_agent_provider,
        voice_display_context,
    };
    match route::try_orchestrator(route_params).await {
        Ok(()) => Ok(()),
        Err(params) => {
            route::spawn_runner(params).await;
            Ok(())
        }
    }
}