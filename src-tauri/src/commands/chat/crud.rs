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
