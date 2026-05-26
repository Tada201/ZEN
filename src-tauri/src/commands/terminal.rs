use crate::commands::AppState;
use crate::error::ZenResult;
use crate::services::{
    AuditEvent, PermissionDecision, PermissionRequest, PrivilegedOperation, RiskLevel,
};
use crate::terminal::TerminalManager;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{RwLockReadGuard, RwLockWriteGuard};

#[tauri::command]
pub async fn terminal_spawn(
    state: State<'_, AppState>,
    app: AppHandle,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
) -> ZenResult<String> {
    let workspace = state.workspace_folder.read().await.clone();
    let resolved_cwd = match cwd {
        Some(path) => Some(
            crate::workspace::resolve_workspace_path(&workspace, &path).map_err(|e| {
                crate::error::ZenError::Custom(format!("Workspace violation: {}", e))
            })?,
        ),
        None => Some(workspace.clone()),
    };

    if let Some(ref dir) = resolved_cwd {
        if !dir.exists() || !dir.is_dir() {
            return Err(crate::error::ZenError::Custom(format!(
                "Terminal cwd is not a directory: {}",
                dir.display()
            )));
        }
    }

    let decision = state.security.evaluate(&PermissionRequest {
        operation: PrivilegedOperation::ShellCommand,
        risk: RiskLevel::Critical,
        caller: "terminal_spawn".to_string(),
        target: Some("interactive_shell".to_string()),
        workspace: Some(workspace),
        reason: Some("frontend requested interactive terminal shell".to_string()),
    });

    if decision == PermissionDecision::Deny {
        state
            .security
            .record_audit(AuditEvent {
                operation: PrivilegedOperation::ShellCommand,
                decision: PermissionDecision::Deny,
                caller: "terminal_spawn".to_string(),
                target: Some("interactive_shell".to_string()),
                reason: Some("terminal spawn denied by security policy".to_string()),
            })
            .await;
        return Err(crate::error::ZenError::Custom(
            "Terminal spawn denied by security policy".to_string(),
        ));
    }

    let mut manager: RwLockWriteGuard<TerminalManager> = state.terminal_sessions.write().await;

    // Set up output callback that emits to frontend
    let app_handle = app.clone();
    let on_output = move |session_id: &str, data: &str| {
        let _ = app_handle.emit(&format!("terminal:output:{}", session_id), data);
    };

    let session_id = manager.spawn(
        resolved_cwd.map(|p| p.to_string_lossy().to_string()),
        cols,
        rows,
        Some(Box::new(on_output)),
    )?;
    state
        .security
        .record_audit(AuditEvent {
            operation: PrivilegedOperation::ShellCommand,
            decision: PermissionDecision::Allow,
            caller: "terminal_spawn".to_string(),
            target: Some(session_id.clone()),
            reason: Some("interactive terminal spawned in workspace".to_string()),
        })
        .await;
    Ok(session_id)
}

#[tauri::command]
pub async fn terminal_write(state: State<'_, AppState>, id: String, data: String) -> ZenResult<()> {
    let manager: RwLockReadGuard<TerminalManager> = state.terminal_sessions.read().await;
    if let Some(session) = manager.get(&id) {
        let session: &crate::terminal::PtySession = session;
        session.write_data(&data).await?;
        state
            .security
            .record_audit(AuditEvent {
                operation: PrivilegedOperation::ShellCommand,
                decision: PermissionDecision::Allow,
                caller: "terminal_write".to_string(),
                target: Some(id),
                reason: Some(format!("wrote {} bytes to terminal session", data.len())),
            })
            .await;
        Ok(())
    } else {
        Err(crate::error::ZenError::Custom(
            "Terminal session not found".to_string(),
        ))
    }
}

#[tauri::command]
pub async fn terminal_kill(state: State<'_, AppState>, id: String) -> ZenResult<()> {
    let mut manager: RwLockWriteGuard<TerminalManager> = state.terminal_sessions.write().await;
    manager.kill_session(&id)?;
    state
        .security
        .record_audit(AuditEvent {
            operation: PrivilegedOperation::ShellCommand,
            decision: PermissionDecision::Allow,
            caller: "terminal_kill".to_string(),
            target: Some(id),
            reason: Some("terminal session killed".to_string()),
        })
        .await;
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
        Err(crate::error::ZenError::Custom(
            "Terminal session not found".to_string(),
        ))
    }
}
