use crate::commands::AppState;
use crate::error::ZenResult;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn terminal_spawn(
    state: State<'_, AppState>,
    app: AppHandle,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
) -> ZenResult<String> {
    let workspace = state.workspace_folder.read().await.clone();
    state
        .terminal
        .spawn_interactive(
            &state.terminal_sessions,
            &state.security,
            app,
            workspace,
            cols,
            rows,
            cwd,
        )
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
