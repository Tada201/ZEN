use crate::commands::AppState;
use crate::error::ZenResult;
use crate::services::terminal::TerminalSpawnParams;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn terminal_request_approval(
    state: State<'_, AppState>,
    cwd: Option<String>,
) -> ZenResult<crate::services::terminal::TerminalApprovalGrant> {
    let workspace = state.workspace_folder.read().await.clone();
    state
        .terminal
        .request_interactive_approval(&state.security, workspace, cwd)
        .await
}

#[tauri::command]
pub async fn terminal_spawn(
    state: State<'_, AppState>,
    app: AppHandle,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    approval_id: String,
) -> ZenResult<String> {
    let workspace = state.workspace_folder.read().await.clone();
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
        })
        .await
}

#[tauri::command]
pub async fn terminal_write(state: State<'_, AppState>, id: String, data: String) -> ZenResult<()> {
    state
        .terminal
        .write_interactive(&state.terminal_sessions, &state.security, id, data)
        .await
}

#[tauri::command]
pub async fn terminal_kill(state: State<'_, AppState>, id: String) -> ZenResult<()> {
    state
        .terminal
        .kill_interactive(&state.terminal_sessions, &state.security, id)
        .await
}

#[tauri::command]
pub async fn terminal_resize(
    state: State<'_, AppState>,
    id: String,
    cols: u16,
    rows: u16,
) -> ZenResult<()> {
    state
        .terminal
        .resize_interactive(&state.terminal_sessions, id, cols, rows)
        .await
}

#[tauri::command]
pub async fn terminal_read_output(
    state: State<'_, AppState>,
    id: String,
) -> ZenResult<String> {
    state
        .terminal
        .read_interactive_output(&state.terminal_sessions, id)
        .await
}
