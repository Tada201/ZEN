//! Basic chat CRUD: create / get / list / get-messages / delete / bulk-delete.

use tauri::{AppHandle, Manager, State};
use tracing::info;

use crate::commands::pagination::{normalize_page, page_from_fetch, Page};
use crate::commands::AppState;
use zen_db::models::{Chat, Message};
use zen_db::queries;
use zen_core::error::ZenResult;

#[tauri::command]
pub async fn create_chat(
    state: State<'_, AppState>,
    title: String,
    model: Option<String>,
    workspace_root: Option<String>,
) -> ZenResult<Chat> {
    info!(title = ?title, model = ?model, workspace_root = ?workspace_root, "Creating new chat session");
    let db = state.db().await?;
    let workspace_root = match workspace_root {
        Some(root) if !root.trim().is_empty() => Some(
            zen_agent::utils::canonicalize_workspace_root(std::path::Path::new(&root))
                .map_err(|e| zen_core::error::ZenError::Custom(format!("Invalid workspace root: {e}")))?,
        ),
        _ => Some(state.workspace_folder.read().await.clone()),
    };
    let workspace_root_string = workspace_root
        .as_ref()
        .map(|root| root.to_string_lossy().to_string());
    let chat = queries::create_chat(
        &db,
        &title,
        model.as_deref(),
        workspace_root_string.as_deref(),
    )
    .await?;
    info!(chat_id = %chat.id, "Chat session created successfully");
    Ok(chat)
}

#[tauri::command]
pub async fn set_chat_workspace(
    state: State<'_, AppState>,
    chat_id: String,
    workspace_root: Option<String>,
) -> ZenResult<Chat> {
    let db = state.db().await?;
    let chat = queries::get_chat(&db, &chat_id).await?;
    if chat.workspace_root.is_some() {
        return Err(zen_core::error::ZenError::Custom(
            "Chat workspace is immutable after initialization".to_string(),
        ));
    }

    let canonical_root = match workspace_root {
        Some(root) if !root.trim().is_empty() => Some(
            zen_agent::utils::canonicalize_workspace_root(std::path::Path::new(&root))
                .map_err(|e| zen_core::error::ZenError::Custom(format!("Invalid workspace root: {e}")))?,
        ),
        _ => return Err(zen_core::error::ZenError::Custom(
            "A workspace root is required when assigning a legacy chat".to_string(),
        )),
    };
    let root_string = canonical_root
        .as_ref()
        .map(|root| root.to_string_lossy().to_string());
    queries::set_chat_workspace(&db, &chat_id, root_string.as_deref()).await?;
    queries::get_chat(&db, &chat_id).await
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

/// Maximum size of the serialized `steps_json` payload for a single assistant
/// message timeline. This prevents a single chat row from growing unbounded
/// with large tool outputs or subagent transcripts.
const MAX_STEPS_JSON_SIZE: usize = 2 * 1024 * 1024; // 2 MB

const STEPS_JSON_SIZE_ERROR: &str = "steps_json exceeds maximum allowed size (2 MB)";
const STEPS_JSON_INVALID_ERROR: &str = "steps_json must be valid JSON";
const EXECUTION_TRACE_VERSION: u64 = 2;

/// Wrap a compact frontend timeline in a backend-authored checkpoint envelope.
/// The backend owns the version, status, and persistence timestamp while the
/// redacted `steps` projection remains compatible with older history readers.
pub fn normalize_trace_checkpoint(
    steps_json: &str,
    trace_status: Option<&str>,
) -> zen_core::error::ZenResult<String> {
    validate_steps_json(steps_json)?;
    let value: serde_json::Value = serde_json::from_str(steps_json).map_err(|_| {
        zen_core::error::ZenError::Custom(STEPS_JSON_INVALID_ERROR.to_string())
    })?;
    let steps = match value {
        serde_json::Value::Array(steps) => steps,
        serde_json::Value::Object(object) => object
            .get("steps")
            .and_then(serde_json::Value::as_array)
            .cloned()
            .ok_or_else(|| zen_core::error::ZenError::Custom(STEPS_JSON_INVALID_ERROR.to_string()))?,
        _ => return Err(zen_core::error::ZenError::Custom(STEPS_JSON_INVALID_ERROR.to_string())),
    };
    let status = match trace_status.unwrap_or("checkpoint") {
        "running" | "completed" | "cancelled" | "failed" | "interrupted" | "checkpoint" => {
            trace_status.unwrap_or("checkpoint")
        }
        _ => "checkpoint",
    };
    let envelope = serde_json::json!({
        "trace_version": EXECUTION_TRACE_VERSION,
        "trace_status": status,
        "saved_at": chrono::Utc::now().to_rfc3339(),
        "steps": steps,
    });
    let serialized = serde_json::to_string(&envelope)
        .map_err(|_| zen_core::error::ZenError::Custom(STEPS_JSON_INVALID_ERROR.to_string()))?;
    if serialized.len() > MAX_STEPS_JSON_SIZE {
        return Err(zen_core::error::ZenError::Custom(STEPS_JSON_SIZE_ERROR.to_string()));
    }
    Ok(serialized)
}

/// Validate that `steps_json` is acceptable to persist.
///
/// Returns `Ok(())` if the payload is valid JSON and does not exceed the size
/// cap; otherwise returns a `ZenError::Custom` describing the problem.
///
/// # Examples
///
/// ```
/// use crate::commands::chat::crud::validate_steps_json;
///
/// assert!(validate_steps_json(r#"[{"type":"text","content":"hi"}]"#).is_ok());
/// ```
///
/// ```
/// use crate::commands::chat::crud::validate_steps_json;
///
/// assert!(validate_steps_json("not json").is_err());
/// ```
pub fn validate_steps_json(steps_json: &str) -> zen_core::error::ZenResult<()> {
    if steps_json.len() > MAX_STEPS_JSON_SIZE {
        return Err(zen_core::error::ZenError::Custom(
            STEPS_JSON_SIZE_ERROR.to_string(),
        ));
    }

    // Validate JSON early so corrupt payloads never reach the database.
    if serde_json::from_str::<serde_json::Value>(steps_json).is_err() {
        return Err(zen_core::error::ZenError::Custom(
            STEPS_JSON_INVALID_ERROR.to_string(),
        ));
    }

    Ok(())
}

/// Persist the frontend execution timeline (`steps_json`) for a single assistant
/// message.
///
/// The payload is validated (valid JSON, max 2 MB) and only applied to rows that
/// belong to the requested chat and have role `assistant`. Returns an error if
/// no matching row is found.
#[tauri::command]
pub async fn update_message_steps(
    state: State<'_, AppState>,
    chat_id: String,
    message_id: String,
    steps_json: String,
    trace_status: Option<String>,
) -> ZenResult<()> {
    let checkpoint = normalize_trace_checkpoint(&steps_json, trace_status.as_deref())?;

    let db = state.db().await?;
    queries::update_message_steps(&db, &chat_id, &message_id, &checkpoint).await?;
    Ok(())
}

/// Persist an AI-repaired assistant message body (self-healing diagrams).
///
/// The edited `content` — and, when provided, the rewritten execution timeline
/// `steps_json` (wrapped in the same backend checkpoint envelope as
/// `update_message_steps`) — replaces the stored message so the fix survives
/// app reloads on both the content and timeline render paths. Only assistant
/// rows belonging to the requested chat are updated.
#[tauri::command]
pub async fn update_message_content(
    state: State<'_, AppState>,
    chat_id: String,
    message_id: String,
    content: String,
    steps_json: Option<String>,
    trace_status: Option<String>,
) -> ZenResult<()> {
    if content.trim().is_empty() {
        return Err(zen_core::error::ZenError::Custom(
            "Updated message content must not be empty".to_string(),
        ));
    }

    let checkpoint = match steps_json {
        Some(raw) => Some(normalize_trace_checkpoint(&raw, trace_status.as_deref())?),
        None => None,
    };

    let db = state.db().await?;
    queries::update_message_content(
        &db,
        &chat_id,
        &message_id,
        &content,
        checkpoint.as_deref(),
    )
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_steps_json_accepts_valid_json() {
        let json = r#"[{"type":"text","content":"hello"}]"#;
        assert!(validate_steps_json(json).is_ok());
    }

    #[test]
    fn validate_steps_json_rejects_invalid_json() {
        assert!(validate_steps_json("not json").is_err());
        assert!(validate_steps_json("{\"broken\": }").is_err());
    }

    #[test]
    fn validate_steps_json_enforces_size_cap() {
        // Build a JSON array whose byte length exceeds the 2 MB cap.
        let oversized = format!("{{\"padding\":\"{}\"}}", "x".repeat(MAX_STEPS_JSON_SIZE));
        let result = validate_steps_json(&oversized);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), STEPS_JSON_SIZE_ERROR);
    }

    #[test]
    fn validate_steps_json_accepts_empty_array() {
        assert!(validate_steps_json("[]").is_ok());
    }

    #[test]
    fn normalize_trace_checkpoint_adds_backend_metadata() {
        let checkpoint = normalize_trace_checkpoint("[{\"type\":\"text\",\"content\":\"ok\"}]", Some("completed")).unwrap();
        let value: serde_json::Value = serde_json::from_str(&checkpoint).unwrap();
        assert_eq!(value["trace_version"], EXECUTION_TRACE_VERSION);
        assert_eq!(value["trace_status"], "completed");
        assert!(value["saved_at"].is_string());
        assert!(value["steps"].is_array());
    }

    #[test]
    fn normalize_trace_checkpoint_rejects_object_without_steps() {
        assert!(normalize_trace_checkpoint("{\"trace_status\":\"running\"}", None).is_err());
    }
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
pub async fn delete_chat(
    app: AppHandle,
    state: State<'_, AppState>,
    chat_id: String,
) -> ZenResult<()> {
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

    // 0a. Prune in-memory session permissions, recall cache, and graph sessions
    //     to guarantee complete resource isolation and prevent memory leaks.
    {
        let mut perms = state.session_permissions.lock().await;
        perms.remove(&chat_id);
    }
    {
        let mut cache = state.recall_cache.lock().await;
        cache.remove(&chat_id);
    }
    {
        let mut cache = state.context_breakdown_cache.write().await;
        cache.remove(&chat_id);
    }
    {
        let mut graphs = state.graph_sessions.lock().await;
        graphs.remove(&chat_id);
    }

    // 1. Remove SQLite rows first (primary source of truth)
    // 1a. Attachment rows: chat_id was added by ALTER TABLE, so SQLite has no
    //     FK cascade for it — delete the documents rows explicitly, then GC the
    //     blob directory under appdata.
    let _ = queries::delete_documents_for_chat(&db, &chat_id).await;
    queries::delete_chat(&db, &chat_id).await?;
    if let Ok(dir) = app.path().app_data_dir() {
        if let Err(e) =
            crate::services::attachment_store::delete_chat_attachments(&dir, &chat_id).await
        {
            tracing::warn!(chat_id = %chat_id, error = %e, "delete_chat: failed to remove attachment blobs");
        }
    }
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
pub async fn bulk_delete_chats(
    app: AppHandle,
    state: State<'_, AppState>,
    chat_ids: Vec<String>,
) -> ZenResult<()> {
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

    // 0a. Prune in-memory session permissions, recall cache, and graph sessions
    {
        let mut perms = state.session_permissions.lock().await;
        for chat_id in &chat_ids {
            perms.remove(chat_id);
        }
    }
    {
        let mut cache = state.recall_cache.lock().await;
        for chat_id in &chat_ids {
            cache.remove(chat_id);
        }
    }
    {
        let mut cache = state.context_breakdown_cache.write().await;
        for chat_id in &chat_ids {
            cache.remove(chat_id);
        }
    }
    {
        let mut graphs = state.graph_sessions.lock().await;
        for chat_id in &chat_ids {
            graphs.remove(chat_id);
        }
    }
    {
        let mut cache = state.context_breakdown_cache.write().await;
        for chat_id in &chat_ids {
            cache.remove(chat_id);
        }
    }

    // 1. Remove SQLite rows first
    for chat_id in &chat_ids {
        let _ = queries::delete_documents_for_chat(&db, chat_id).await;
    }
    queries::bulk_delete_chats(&db, &chat_ids).await?;
    if let Ok(dir) = app.path().app_data_dir() {
        for chat_id in &chat_ids {
            if let Err(e) =
                crate::services::attachment_store::delete_chat_attachments(&dir, chat_id).await
            {
                tracing::warn!(chat_id = %chat_id, error = %e, "bulk_delete_chats: failed to remove attachment blobs");
            }
        }
    }
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
