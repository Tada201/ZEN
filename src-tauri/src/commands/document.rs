use tauri::State;
use crate::error::AppResult;
use crate::commands::AppState;
use crate::db::models::Document;
use std::path::PathBuf;

#[tauri::command]
pub async fn ingest_document(state: State<'_, AppState>, path: String) -> AppResult<Document> {
    state.documents.ingest(PathBuf::from(path)).await
}

#[tauri::command]
pub async fn list_documents(state: State<'_, AppState>) -> AppResult<Vec<Document>> {
    state.documents.list().await
}

#[tauri::command]
pub async fn get_document(state: State<'_, AppState>, doc_id: String) -> AppResult<Document> {
    state.documents.get_by_id(&doc_id).await
}

#[tauri::command]
pub async fn delete_document(state: State<'_, AppState>, doc_id: String) -> AppResult<()> {
    state.documents.delete(&doc_id).await
}
