use crate::commands::pagination::{normalize_page, page_from_fetch, Page};
use crate::commands::AppState;
use zen_db::models::Artifact;
use zen_core::error::ZenResult;
use tauri::State;

#[tauri::command]
pub async fn list_artifacts_page(
    state: State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> ZenResult<Page<Artifact>> {
    let db = state.db().await?;
    let (limit, offset) = normalize_page(limit, offset);
    let items = zen_db::queries::get_all_artifacts_page(&db, limit + 1, offset).await?;
    Ok(page_from_fetch(items, limit, offset))
}

#[tauri::command]
pub async fn list_chat_artifacts_page(
    state: State<'_, AppState>,
    chat_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> ZenResult<Page<Artifact>> {
    let db = state.db().await?;
    let (limit, offset) = normalize_page(limit, offset);
    let items =
        zen_db::queries::get_chat_artifacts_page(&db, &chat_id, limit + 1, offset).await?;
    Ok(page_from_fetch(items, limit, offset))
}
