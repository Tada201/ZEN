use tauri::{AppHandle, State, Emitter};
use crate::error::ZenResult;
use crate::commands::AppState;
use crate::terminal::TerminalManager;
use tokio::sync::{RwLockWriteGuard, RwLockReadGuard};

#[tauri::command]
pub async fn terminal_spawn(
    state: State<'_, AppState>,
    app: AppHandle,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
) -> ZenResult<String> {
    let mut manager: RwLockWriteGuard<TerminalManager> = state.terminal_sessions.write().await;
    
    // Set up output callback that emits to frontend
    let app_handle = app.clone();
    let on_output = move |session_id: &str, data: &str| {
        let _ = app_handle.emit(&format!("terminal:output:{}", session_id), data);
    };

    let session_id = manager.spawn(cwd, cols, rows, Some(Box::new(on_output)))?;
    Ok(session_id)
}

#[tauri::command]
pub async fn terminal_write(
    state: State<'_, AppState>,
    id: String,
    data: String,
) -> ZenResult<()> {
    let manager: RwLockReadGuard<TerminalManager> = state.terminal_sessions.read().await;
    if let Some(session) = manager.get(&id) {
        let session: &crate::terminal::PtySession = session;
        session.write_data(&data).await?;
        Ok(())
    } else {
        Err(crate::error::ZenError::Custom("Terminal session not found".to_string()))
    }
}

#[tauri::command]
pub async fn terminal_kill(
    state: State<'_, AppState>,
    id: String,
) -> ZenResult<()> {
    let mut manager: RwLockWriteGuard<TerminalManager> = state.terminal_sessions.write().await;
    manager.kill_session(&id)?;
    Ok(())
}

#[tauri::command]
pub async fn terminal_resize(
    state: State<'_, AppState>,
    id: String,
    cols: u16,
    rows: u16,
) -> ZenResult<()> {
    let manager: RwLockReadGuard<TerminalManager> = state.terminal_sessions.read().await;
    if let Some(session) = manager.get(&id) {
        let session: &crate::terminal::PtySession = session;
        let master = session.master.lock().await;
        master.resize(portable_pty::PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;
        Ok(())
    } else {
        Err(crate::error::ZenError::Custom("Terminal session not found".to_string()))
    }
}
