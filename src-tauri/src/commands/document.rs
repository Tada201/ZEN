use crate::commands::pagination::{normalize_page, page_from_fetch, Page};
use crate::commands::AppState;
use crate::db::models::Document;
use crate::error::AppResult;
use tauri::State;

#[tauri::command]
pub async fn ingest_document(state: State<'_, AppState>, path: String) -> AppResult<Document> {
    let workspace = state.workspace_folder.read().await.clone();
    state.documents.ingest(path, workspace).await
}

#[tauri::command]
pub async fn list_documents(state: State<'_, AppState>) -> AppResult<Vec<Document>> {
    state.documents.list().await
}

#[tauri::command]
pub async fn list_documents_page(
    state: State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> AppResult<Page<Document>> {
    let (limit, offset) = normalize_page(limit, offset);
    let items = state.documents.list_page(limit + 1, offset).await?;
    Ok(page_from_fetch(items, limit, offset))
}

#[tauri::command]
pub async fn get_document(state: State<'_, AppState>, doc_id: String) -> AppResult<Document> {
    state.documents.get_by_id(&doc_id).await
}

#[tauri::command]
pub async fn delete_document(state: State<'_, AppState>, doc_id: String) -> AppResult<()> {
    state.documents.delete(&doc_id).await
}
