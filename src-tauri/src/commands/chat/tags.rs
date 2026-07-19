//! Tag-related read commands + chat search.

use tauri::State;

use crate::commands::pagination::{normalize_page, page_from_fetch, Page};
use crate::commands::AppState;
use crate::db::models::{ChatTag, SearchResult};
use crate::db::queries;
use crate::error::ZenResult;

#[tauri::command]
pub async fn search_chats(
    state: State<'_, AppState>,
    query: String,
    limit: Option<i64>,
) -> ZenResult<Vec<SearchResult>> {
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
