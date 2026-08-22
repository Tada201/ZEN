use crate::commands::pagination::{normalize_page, page_from_fetch, Page};
use crate::commands::AppState;
use crate::db::models::Document;
use crate::error::{AppError, AppResult};
use base64::Engine;
use tauri::{AppHandle, Manager, State};

fn app_data_dir(app: &AppHandle) -> AppResult<std::path::PathBuf> {
    app.path()
        .app_data_dir()
        .map_err(|e| AppError::Custom(format!("Could not resolve app data directory: {e}")))
}

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

// ─── Per-chat attachments (Phase 1) ───

/// Upload one file to a chat's attachment workspace. `data_base64` is the raw
/// file bytes (base64) — the frontend never sends text/extracted content here.
#[tauri::command]
pub async fn attach_file_to_chat(
    app: AppHandle,
    state: State<'_, AppState>,
    chat_id: String,
    filename: String,
    data_base64: String,
) -> AppResult<Document> {
    // Reject oversized payloads before decoding: base64 inflates to ~3/4 its
    // length, so a huge string would otherwise allocate the full decoded Vec
    // just to fail the size gate in attach_to_chat.
    use crate::services::attachment_store as store;
    let max_encoded = store::MAX_ATTACHMENT_BYTES / 3 * 4 + 4;
    if data_base64.len() > max_encoded {
        return Err(AppError::Custom(format!(
            "Attachment exceeds the {} MB limit",
            store::MAX_ATTACHMENT_BYTES / (1024 * 1024)
        )));
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|e| AppError::Custom(format!("Invalid attachment encoding: {e}")))?;
    let dir = app_data_dir(&app)?;
    state
        .documents
        .attach_to_chat(dir, chat_id, filename, bytes)
        .await
}

#[tauri::command]
pub async fn list_chat_attachments(
    state: State<'_, AppState>,
    chat_id: String,
) -> AppResult<Vec<Document>> {
    state.documents.list_for_chat(&chat_id).await
}

#[tauri::command]
pub async fn delete_chat_attachment(
    app: AppHandle,
    state: State<'_, AppState>,
    doc_id: String,
) -> AppResult<()> {
    let dir = app_data_dir(&app)?;
    state.documents.delete_chat_attachment(&dir, &doc_id).await
}

/// Extracted-text preview for one attachment (capped server-side). Images have
/// no useful sidecar; the panel previews those from the message bubble instead.
#[tauri::command]
pub async fn read_chat_attachment_text(
    state: State<'_, AppState>,
    doc_id: String,
) -> AppResult<String> {
    state.documents.read_chat_attachment_text(&doc_id).await
}
