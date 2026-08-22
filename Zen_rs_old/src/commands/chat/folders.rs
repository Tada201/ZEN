//! Chat-folder CRUD.

use tauri::State;

use crate::commands::AppState;
use crate::db::models::ChatFolder;
use crate::db::queries;
use crate::error::ZenResult;

#[tauri::command]
pub async fn create_chat_folder(
    state: State<'_, AppState>,
    name: String,
    color: Option<String>,
    icon: Option<String>,
) -> ZenResult<ChatFolder> {
    let db = state.db().await?;
    queries::create_chat_folder(&db, &name, color.as_deref(), icon.as_deref()).await
}

#[tauri::command]
pub async fn list_chat_folders(state: State<'_, AppState>) -> ZenResult<Vec<ChatFolder>> {
    let db = state.db().await?;
    queries::list_chat_folders(&db).await
}

#[tauri::command]
pub async fn move_chat_to_folder(
    state: State<'_, AppState>,
    chat_id: String,
    folder_id: String,
) -> ZenResult<()> {
    let db = state.db().await?;
    queries::move_chat_to_folder(&db, &chat_id, &folder_id).await
}

#[tauri::command]
pub async fn delete_chat_folder(state: State<'_, AppState>, folder_id: String) -> ZenResult<()> {
    let db = state.db().await?;
    queries::delete_chat_folder(&db, &folder_id).await
}

#[tauri::command]
pub async fn update_chat_folder(
    state: State<'_, AppState>,
    folder_id: String,
    name: Option<String>,
    color: Option<String>,
) -> ZenResult<()> {
    let db = state.db().await?;
    queries::update_chat_folder(&db, &folder_id, name.as_deref(), color.as_deref()).await
}

#[tauri::command]
pub async fn remove_chat_from_folder(state: State<'_, AppState>, chat_id: String) -> ZenResult<()> {
    let db = state.db().await?;
    queries::remove_chat_from_folder(&db, &chat_id).await
}
