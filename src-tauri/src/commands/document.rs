use tauri::State;
use crate::error::AppResult;
use crate::commands::AppState;
use std::path::PathBuf;

#[tauri::command]
pub async fn ingest_document(state: State<'_, AppState>, path: String) -> AppResult<String> {
    state.documents.ingest(PathBuf::from(path)).await
}

#[tauri::command]
pub async fn list_documents(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    state.documents.list().await
}
