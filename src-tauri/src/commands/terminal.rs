use crate::commands::AppState;
use zen_core::error::ZenResult;
use crate::services::terminal::TerminalSpawnParams;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn terminal_request_approval(
    state: State<'_, AppState>,
    chat_id: String,
    cwd: Option<String>,
) -> ZenResult<crate::services::terminal::TerminalApprovalGrant> {
    let workspace = state.workspace_for_chat(&chat_id).await?;
    state
        .terminal
        .request_interactive_approval(&state.security, workspace, chat_id, cwd)
        .await
}

#[tauri::command]
pub async fn terminal_spawn(
    state: State<'_, AppState>,
    app: AppHandle,
    chat_id: String,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    approval_id: String,
) -> ZenResult<String> {
    let workspace = state.workspace_for_chat(&chat_id).await?;
    state
        .terminal
        .spawn_interactive(TerminalSpawnParams {
            manager: &state.terminal_sessions,
            security: &state.security,
            app,
            workspace,
            cols,
            rows,
            cwd,
            approval_id,
            chat_id,
        })
        .await
}

#[tauri::command]
pub async fn terminal_write(state: State<'_, AppState>, chat_id: String, id: String, data: String) -> ZenResult<()> {
    state
        .terminal
        .write_interactive(&state.terminal_sessions, &state.security, &chat_id, id, data)
        .await
}

#[tauri::command]
pub async fn terminal_kill(state: State<'_, AppState>, chat_id: String, id: String) -> ZenResult<()> {
    state
        .terminal
        .kill_interactive(&state.terminal_sessions, &state.security, &chat_id, id)
        .await
}

#[tauri::command]
pub async fn terminal_resize(
    state: State<'_, AppState>,
    chat_id: String,
    id: String,
    cols: u16,
    rows: u16,
) -> ZenResult<()> {
    state
        .terminal
        .resize_interactive(&state.terminal_sessions, &chat_id, id, cols, rows)
        .await
}

#[tauri::command]
pub async fn terminal_read_output(
    state: State<'_, AppState>,
    chat_id: String,
    id: String,
) -> ZenResult<crate::terminal::TerminalOutputSnapshot> {
    state
        .terminal
        .read_interactive_output(&state.terminal_sessions, &chat_id, id)
        .await
}
