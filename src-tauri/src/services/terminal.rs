use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, RwLock};

use crate::error::{ZenError, ZenResult};
use crate::services::{
    AuditEvent, PermissionDecision, PermissionRequest, PrivilegedOperation, RiskLevel,
    SecurityService,
};
use crate::terminal::TerminalManager;

pub struct TerminalSession {
    pub id: String,
    pub writer: Box<dyn Write + Send>,
}

pub struct TerminalService {
    pub sessions: Arc<Mutex<Vec<TerminalSession>>>,
}

impl TerminalService {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn spawn(&self, id: String, app_handle: AppHandle) -> Result<(), String> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e: anyhow::Error| e.to_string())?;

        let shell = if cfg!(windows) {
            "powershell.exe"
        } else {
            "bash"
        };
        let cmd = CommandBuilder::new(shell);

        let _child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e: anyhow::Error| e.to_string())?;

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e: anyhow::Error| e.to_string())?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e: anyhow::Error| e.to_string())?;

        let session = TerminalSession {
            id: id.clone(),
            writer,
        };

        let sessions = self.sessions.clone();
        tauri::async_runtime::spawn(async move {
            sessions.lock().await.push(session);
        });

        // Spawn read thread
        let id_clone = id.clone();
        std::thread::spawn(move || {
            let mut reader = reader;
            let mut buffer = [0u8; 1024];
            while let Ok(n) = reader.read(&mut buffer) {
                if n == 0 {
                    break;
                }
                let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                let _ = app_handle.emit(&format!("terminal-stdout-{}", id_clone), data);
            }
        });

        Ok(())
    }

    pub async fn write(&self, id: String, data: String) -> Result<(), String> {
        let mut sessions = self.sessions.lock().await;
        if let Some(session) = sessions.iter_mut().find(|s| s.id == id) {
            session
                .writer
                .write_all(data.as_bytes())
                .map_err(|e: std::io::Error| e.to_string())?;
            session
                .writer
                .flush()
                .map_err(|e: std::io::Error| e.to_string())?;
            Ok(())
        } else {
            Err("Session not found".to_string())
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn spawn_interactive(
        &self,
        manager: &RwLock<TerminalManager>,
        security: &SecurityService,
        app: AppHandle,
        workspace: PathBuf,
        cols: u16,
        rows: u16,
        cwd: Option<String>,
        user_approved: bool,
    ) -> ZenResult<String> {
        let resolved_cwd = match cwd {
            Some(path) => Some(
                crate::workspace::resolve_workspace_path(&workspace, &path)
                    .map_err(|e| ZenError::Custom(format!("Workspace violation: {}", e)))?,
            ),
            None => Some(workspace.clone()),
        };

        if let Some(ref dir) = resolved_cwd {
            if !dir.exists() || !dir.is_dir() {
                return Err(ZenError::Custom(format!(
                    "Terminal cwd is not a directory: {}",
                    dir.display()
                )));
            }
        }

        let decision = security.evaluate(&PermissionRequest {
            operation: PrivilegedOperation::ShellCommand,
            risk: RiskLevel::Critical,
            caller: "terminal_spawn".to_string(),
            target: Some("interactive_shell".to_string()),
            workspace: Some(workspace),
            reason: Some("frontend requested interactive terminal shell".to_string()),
        });

        let explicitly_allowed = decision == PermissionDecision::Ask && user_approved;
        if decision != PermissionDecision::Allow && !explicitly_allowed {
            security
                .record_audit(AuditEvent {
                    operation: PrivilegedOperation::ShellCommand,
                    decision,
                    caller: "terminal_spawn".to_string(),
                    target: Some("interactive_shell".to_string()),
                    reason: Some("terminal spawn requires an explicit allow decision".to_string()),
                })
                .await;
            return Err(ZenError::Custom(
                "Terminal spawn requires explicit approval by security policy".to_string(),
            ));
        }

        if explicitly_allowed {
            security
                .record_audit(AuditEvent {
                    operation: PrivilegedOperation::ShellCommand,
                    decision: PermissionDecision::Allow,
                    caller: "terminal_spawn".to_string(),
                    target: Some("interactive_shell".to_string()),
                    reason: Some("user explicitly approved interactive terminal spawn".to_string()),
                })
                .await;
        }

        let mut manager = manager.write().await;
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
        security
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

    pub async fn write_interactive(
        &self,
        manager: &RwLock<TerminalManager>,
        security: &SecurityService,
        id: String,
        data: String,
    ) -> ZenResult<()> {
        let manager = manager.read().await;
        if let Some(session) = manager.get(&id) {
            session.write_data(&data).await?;
            security
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
            Err(ZenError::Custom("Terminal session not found".to_string()))
        }
    }

    pub async fn kill_interactive(
        &self,
        manager: &RwLock<TerminalManager>,
        security: &SecurityService,
        id: String,
    ) -> ZenResult<()> {
        let mut manager = manager.write().await;
        manager.kill_session(&id)?;
        security
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

    pub async fn resize_interactive(
        &self,
        manager: &RwLock<TerminalManager>,
        id: String,
        cols: u16,
        rows: u16,
    ) -> ZenResult<()> {
        let manager = manager.read().await;
        if let Some(session) = manager.get(&id) {
            let master = session.master.lock().await;
            master.resize(portable_pty::PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })?;
            Ok(())
        } else {
            Err(ZenError::Custom("Terminal session not found".to_string()))
        }
    }
}

impl Default for TerminalService {
    fn default() -> Self {
        Self::new()
    }
}
