//! Title management: explicit update + auto-generation via the
//! title-maker model.

use tauri::{AppHandle, Emitter, State};
use tracing::info;

use crate::commands::AppState;
use crate::db::models::ChatMessage;
use crate::db::queries;
use crate::error::ZenResult;

use super::helpers::{sanitize_title, DEFAULT_TITLE_PROMPT, TITLE_MAX_CHARS};

#[tauri::command]
pub async fn update_chat_title(
    state: State<'_, AppState>,
    chat_id: String,
    title: String,
) -> ZenResult<()> {
    let db = state.db().await?;
    queries::update_chat_title(&db, &chat_id, &title).await
}

/// Generate a short auto-title for a session using the configured title-maker model
/// (or active chat model as fallback), then persist it via `update_chat_title`.
/// Title is capped at TITLE_MAX_CHARS (50) and stripped of stray quotes/punctuation.
#[tauri::command]
pub async fn generate_session_title(
    state: State<'_, AppState>,
    app: AppHandle,
    chat_id: String,
    first_user_message: String,
) -> ZenResult<String> {
    let db = state.db().await?;

    let title_enabled = queries::get_setting(&db, "chat.title-maker-enabled")
        .await
        .ok()
        .flatten()
        .map(|v| v != "false")
        .unwrap_or(true);
    if !title_enabled {
        return Ok(String::new());
    }

    let snippet = first_user_message.trim();
    if snippet.is_empty() {
        return Ok(String::new());
    }

    // ── Provider identity end-to-end ────────────────────────────────────
    // Prefer the explicit `chat.title-maker-provider` (persisted alongside
    // `chat.title-maker-model` when the user picks a model in the Chat
    // tab picker). A model id alone is ambiguous across the provider
    // fleet — the same id can resolve under ollama, nine_router, etc. —
    // so provider selection must travel with the model.
    //
    // Resolution runs BEFORE the model lookup so a missing provider
    // short-circuits without burning an extra settings round-trip.
    //
    // Stale-explicit recovery: if the persisted title-maker provider is
    // no longer registered (user removed/renamed it in provider config
    // AFTER the picker saved it), the explicit lookup will fail. Fall
    // back to `active_provider` rather than propagating the error.
    //
    // Brand-new-install soft default: if EVERYTHING is empty (neither an
    // explicit picker selection nor an `active_provider` ever set),
    // fall back to ollama — the long-standing historical default — so
    // a fresh install that has never opened Settings still gets
    // auto-titling on the first fresh session.
    let provider = {
        let explicit = queries::get_setting(&db, "chat.title-maker-provider")
            .await
            .ok()
            .flatten()
            .filter(|v| !v.is_empty());
        let active_fallback = queries::get_setting(&db, "active_provider")
            .await
            .ok()
            .flatten()
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| "ollama".to_string());

        // Try the explicit first. If it resolves, use it (single lookup,
        // no TOCTOU between validation and use). If it fails, fall back
        // to active_provider. If THAT fails too, skip generation.
        match explicit {
            Some(explicit_p) => match state.provider_by_name(&explicit_p, &db).await {
                Ok(p) => p,
                Err(e) => {
                    tracing::warn!(
                        explicit_provider = %explicit_p,
                        error = %e,
                        "Title-maker provider lookup failed; falling back to active_provider",
                    );
                    state
                        .provider_by_name(&active_fallback, &db)
                        .await
                        .map_err(|e| {
                            crate::error::ZenError::Internal(format!(
                                "Title provider resolution failed: {e}"
                            ))
                        })?
                }
            },
            None => state
                .provider_by_name(&active_fallback, &db)
                .await
                .map_err(|e| {
                    crate::error::ZenError::Internal(format!(
                        "Title provider resolution failed: {e}"
                    ))
                })?,
        }
    };

    // Check for an explicit title-maker model first, then fall back to active_model
    let model = {
        let explicit = queries::get_setting(&db, "chat.title-maker-model")
            .await
            .ok()
            .flatten()
            .filter(|v| !v.is_empty());
        if let Some(m) = explicit {
            m
        } else {
            let fallback = queries::get_setting(&db, "active_model")
                .await
                .ok()
                .flatten()
                .filter(|v| !v.is_empty());
            match fallback {
                Some(m) => m,
                None => return Ok(String::new()),
            }
        }
    };

    let system_prompt = queries::get_setting(&db, "chat.title-maker-prompt")
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_TITLE_PROMPT.to_string());

    let messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: system_prompt,
            reasoning_details: None,
            images: None,
            tool_calls: None,
            tool_call_id: None,
        },
        ChatMessage {
            role: "user".to_string(),
            content: snippet.to_string(),
            reasoning_details: None,
            images: None,
            tool_calls: None,
            tool_call_id: None,
        },
    ];

    let response = provider
        .chat_stream(
            &model,
            messages,
            None,
            crate::llm::ChatRequestConfig::default(),
            Box::new(|_| {}),
            tokio_util::sync::CancellationToken::new(),
        )
        .await
        .map_err(|e| crate::error::ZenError::Internal(format!("Title generation failed: {e}")))?;

    let raw = response.content;
    let title = sanitize_title(&raw);
    if title.is_empty() {
        return Ok(String::new());
    }
    debug_assert!(title.chars().count() <= TITLE_MAX_CHARS);

    queries::update_chat_title(&db, &chat_id, &title).await?;

    let _ = app.emit(
        "chat:title-updated",
        serde_json::json!({ "chat_id": chat_id, "title": title }),
    );

    info!(chat_id = %chat_id, title = %title, "Auto-generated session title");
    Ok(title)
}
