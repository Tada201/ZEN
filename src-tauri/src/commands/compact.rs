//! Tauri IPC commands for manual context compaction (`/compact`). Thin
//! adapters over `services::compact`, which owns the workflow and the
//! `context:compacted` event contract.

use tauri::AppHandle;

use crate::services::compact::{self as compact_service, CompactOutcome};

/// Summarize the chat's active history into a persisted summary and mark
/// the covered messages compacted, immediately. No message is sent to the
/// model. Optional free-text `instructions` focus the summary.
#[tauri::command]
pub async fn compact_chat_context(
    app: AppHandle,
    chat_id: String,
    instructions: Option<String>,
) -> Result<CompactOutcome, String> {
    compact_service::compact_chat_context(&app, &chat_id, instructions).await
}
