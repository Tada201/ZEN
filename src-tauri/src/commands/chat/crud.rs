//! Basic chat CRUD: create / get / list / get-messages / delete / bulk-delete.

use tauri::State;
use tracing::info;

use crate::commands::pagination::{normalize_page, page_from_fetch, Page};
use crate::commands::AppState;
use crate::db::models::{Chat, Message};
use crate::db::queries;
use crate::error::ZenResult;

#[tauri::command]
pub async fn create_chat(
    state: State<'_, AppState>,
    title: String,
    model: Option<String>,
) -> ZenResult<Chat> {
    info!(title = ?title, model = ?model, "Creating new chat session");
    let db = state.db().await?;
    let workspace_root = state.workspace_folder.read().await.clone();
    let chat = queries::create_chat(
        &db,
        &title,
        model.as_deref(),
        Some(workspace_root.to_string_lossy().as_ref()),
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
    let canonical_root = match workspace_root {
        Some(root) if !root.trim().is_empty() => Some(
            crate::workspace::canonicalize_workspace_root(std::path::Path::new(&root))
                .map_err(|e| crate::error::ZenError::Custom(format!("Invalid workspace root: {}", e)))?,
        ),
        _ => None,
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
pub fn validate_steps_json(steps_json: &str) -> crate::error::ZenResult<()> {
    if steps_json.len() > MAX_STEPS_JSON_SIZE {
        return Err(crate::error::ZenError::Custom(
            STEPS_JSON_SIZE_ERROR.to_string(),
        ));
    }

    // Validate JSON early so corrupt payloads never reach the database.
    if serde_json::from_str::<serde_json::Value>(steps_json).is_err() {
        return Err(crate::error::ZenError::Custom(
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
) -> ZenResult<()> {
    validate_steps_json(&steps_json)?;

    let db = state.db().await?;
    queries::update_message_steps(&db, &chat_id, &message_id, &steps_json).await?;
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
