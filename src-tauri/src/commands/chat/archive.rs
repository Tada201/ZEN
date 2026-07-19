//! Pin / archive / unarchive / list-archived chat commands.

use tauri::State;

use crate::commands::pagination::{normalize_page, page_from_fetch, Page};
use crate::commands::AppState;
use crate::db::models::Chat;
use crate::db::queries;
use crate::error::ZenResult;

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
