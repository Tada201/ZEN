use crate::commands::AppState;
use zen_core::error::ZenResult;
use tauri::State;

/// Return whether a completed file mutation can be safely undone.
///
/// Checkpoints are process-local in this first slice; the response therefore
/// describes availability without implying durable Git/worktree snapshots.
#[tauri::command]
pub async fn get_tool_checkpoint(
    state: State<'_, AppState>,
    chat_id: String,
    tool_call_id: String,
) -> ZenResult<Option<crate::services::CheckpointInfo>> {
    Ok(state.checkpoints.info(&chat_id, &tool_call_id).await)
}

/// Undo one completed file-mutating tool call after a fail-closed workspace
/// verification. External edits cause a conflict result and no writes.
#[tauri::command]
pub async fn undo_tool_call(
    state: State<'_, AppState>,
    chat_id: String,
    tool_call_id: String,
) -> Result<crate::services::UndoResult, String> {
    let workspace_root = state
        .workspace_for_chat(&chat_id)
        .await
        .map_err(|error| error.to_string())?;
    state
        .checkpoints
        .undo_tool_call(&chat_id, &tool_call_id, &workspace_root)
        .await
}

