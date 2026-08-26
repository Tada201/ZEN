use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, RwLock};

use zen_core::error::{ZenError, ZenResult};
use zen_security::service::{AuditEvent, PermissionDecision, PrivilegedOperation, SecurityService};
use crate::terminal::TerminalManager;

pub struct TerminalSession {
    pub id: String,
    pub writer: Box<dyn Write + Send>,
}

/// Parameters for spawning an interactive terminal session.
pub struct TerminalSpawnParams<'a> {
    pub manager: &'a RwLock<TerminalManager>,
    pub security: &'a SecurityService,
    pub app: AppHandle,
    pub workspace: PathBuf,
    pub cols: u16,
    pub rows: u16,
    pub cwd: Option<String>,
    pub approval_id: String,
    pub chat_id: String,
}

const INTERACTIVE_APPROVAL_TTL: Duration = Duration::from_secs(60);

struct InteractiveTerminalApproval {
    chat_id: String,
    cwd: PathBuf,
    decision: PermissionDecision,
    expires_at: Instant,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalApprovalGrant {
    pub approval_id: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputEvent {
    pub session_id: String,
    pub sequence: u64,
    pub data: String,
}

pub struct TerminalService {
    pub sessions: Arc<Mutex<Vec<TerminalSession>>>,
    approvals: Arc<Mutex<HashMap<String, InteractiveTerminalApproval>>>,
    owners: Arc<Mutex<HashMap<String, String>>>,
}

impl TerminalService {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(Vec::new())),
            approvals: Arc::new(Mutex::new(HashMap::new())),
            owners: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn request_interactive_approval(
        &self,
        security: &SecurityService,
        workspace: PathBuf,
        chat_id: String,
        cwd: Option<String>,
    ) -> ZenResult<TerminalApprovalGrant> {
        let cwd = resolve_terminal_cwd(&workspace, cwd)?;

        let approval_id = uuid::Uuid::new_v4().to_string();
        let expires_at = Instant::now() + INTERACTIVE_APPROVAL_TTL;
        let mut approvals = self.approvals.lock().await;
        approvals.retain(|_, approval| approval.expires_at > Instant::now());
        approvals.insert(
            approval_id.clone(),
            InteractiveTerminalApproval {
                chat_id,
                cwd,
                decision: PermissionDecision::Allow,
                expires_at,
            },
        );
        drop(approvals);

        security
            .grant_interactive_terminal_approval(
                "terminal_request_approval",
                Some("interactive_shell".to_string()),
                Some(
                    "interactive terminal shell requested from the workbench terminal tab"
                        .to_string(),
                ),
            )
            .await;

        Ok(TerminalApprovalGrant {
            approval_id,
            expires_at: (chrono::Utc::now()
                + chrono::Duration::seconds(INTERACTIVE_APPROVAL_TTL.as_secs() as i64))
            .to_rfc3339(),
        })
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
        let id_clone = id;
        std::thread::spawn(move || {
            let mut reader = reader;
            let mut buffer = [0u8; 1024];
            while let Ok(n) = reader.read(&mut buffer) {
                if n == 0 {
                    break;
                }
                let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                let _ = app_handle.emit(&format!("terminal-stdout-{id_clone}"), data);
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

    pub async fn spawn_interactive(&self, params: TerminalSpawnParams<'_>) -> ZenResult<String> {
        let TerminalSpawnParams {
            manager,
            security,
            app,
            workspace,
            cols,
            rows,
            cwd,
            approval_id,
            chat_id,
        } = params;
        let resolved_cwd = resolve_terminal_cwd(&workspace, cwd)?;
        let approval = self.approvals.lock().await.remove(&approval_id);
        let Some(approval) = approval else {
            security
                .record_audit(AuditEvent {
                    operation: PrivilegedOperation::ShellCommand,
                    decision: PermissionDecision::Deny,
                    caller: "terminal_spawn".to_string(),
                    target: Some("interactive_shell".to_string()),
                    reason: Some("terminal spawn attempted without a valid approval".to_string()),
                })
                .await;
            return Err(ZenError::Custom(
                "Terminal approval is missing, expired, or already used".to_string(),
            ));
        };
        if approval.expires_at <= Instant::now() || approval.cwd != resolved_cwd || approval.chat_id != chat_id {
            security
                .record_audit(AuditEvent {
                    operation: PrivilegedOperation::ShellCommand,
                    decision: PermissionDecision::Deny,
                    caller: "terminal_spawn".to_string(),
                    target: Some("interactive_shell".to_string()),
                    reason: Some(
                        "terminal approval did not match the requested session".to_string(),
                    ),
                })
                .await;
            return Err(ZenError::Custom(
                "Terminal approval expired or does not match the requested directory".to_string(),
            ));
        }
        let decision = approval.decision;
        if decision != PermissionDecision::Allow {
            security
                .record_audit(AuditEvent {
                    operation: PrivilegedOperation::ShellCommand,
                    decision: PermissionDecision::Deny,
                    caller: "terminal_spawn".to_string(),
                    target: Some("interactive_shell".to_string()),
                    reason: Some(
                        "interactive terminal spawn requires explicit approval".to_string(),
                    ),
                })
                .await;
            return Err(ZenError::Custom(
                "Interactive terminal spawn requires explicit approval".to_string(),
            ));
        }

        let mut manager = manager.write().await;
        let app_handle = app.clone();
        let on_output = move |session_id: &str, sequence: u64, data: &str| {
            if let Err(error) = app_handle.emit(
                "terminal:output",
                TerminalOutputEvent {
                    session_id: session_id.to_string(),
                    sequence,
                    data: data.to_string(),
                },
            ) {
                tracing::warn!(%error, session_id, "Failed to emit terminal output event");
            }
        };

        let session_id = manager.spawn(
            Some(shell_cwd(&resolved_cwd)),
            cols,
            rows,
            Some(Box::new(on_output)),
        ).map_err(crate::error::other_err)?;
        self.owners.lock().await.insert(session_id.clone(), chat_id);
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
        _security: &SecurityService,
        chat_id: &str,
        id: String,
        data: String,
    ) -> ZenResult<()> {
        let manager = manager.read().await;
        if self.owners.lock().await.get(&id).map(String::as_str) != Some(chat_id) {
            return Err(ZenError::Custom("Terminal session belongs to another chat".to_string()));
        }
        if let Some(session) = manager.get(&id) {
            session.write_data(&data).await.map_err(crate::error::other_err)?;
            // Interactive keystrokes are intentionally not audited individually.
            // Session creation and destruction retain the privileged audit trail.
            Ok(())
        } else {
            Err(ZenError::Custom("Terminal session not found".to_string()))
        }
    }

    pub async fn kill_interactive(
        &self,
        manager: &RwLock<TerminalManager>,
        security: &SecurityService,
        chat_id: &str,
        id: String,
    ) -> ZenResult<()> {
        if self.owners.lock().await.get(&id).map(String::as_str) != Some(chat_id) {
            return Err(ZenError::Custom("Terminal session belongs to another chat".to_string()));
        }
        let mut manager = manager.write().await;
        manager.kill_session(&id).map_err(crate::error::other_err)?;
        self.owners.lock().await.remove(&id);
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
        chat_id: &str,
        id: String,
        cols: u16,
        rows: u16,
    ) -> ZenResult<()> {
        let manager = manager.read().await;
        if self.owners.lock().await.get(&id).map(String::as_str) != Some(chat_id) {
            return Err(ZenError::Custom("Terminal session belongs to another chat".to_string()));
        }
        if let Some(session) = manager.get(&id) {
            let master = session.master.lock().await;
            master.resize(portable_pty::PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            }).map_err(crate::error::other_err)?;
            Ok(())
        } else {
            Err(ZenError::Custom("Terminal session not found".to_string()))
        }
    }

    pub async fn read_interactive_output(
        &self,
        manager: &RwLock<TerminalManager>,
        chat_id: &str,
        id: String,
    ) -> ZenResult<crate::terminal::TerminalOutputSnapshot> {
        let manager = manager.read().await;
        if self.owners.lock().await.get(&id).map(String::as_str) != Some(chat_id) {
            return Err(ZenError::Custom("Terminal session belongs to another chat".to_string()));
        }
        if let Some(session) = manager.get(&id) {
            Ok(session.read_output().await)
        } else {
            Err(ZenError::Custom("Terminal session not found".to_string()))
        }
    }
}

fn resolve_terminal_cwd(workspace: &std::path::Path, cwd: Option<String>) -> ZenResult<PathBuf> {
    let resolved = match cwd {
        Some(path) => crate::workspace::resolve_workspace_path(workspace, &path)
            .map_err(|e| ZenError::Custom(format!("Workspace violation: {e}")))?,
        None => workspace.to_path_buf(),
    };

    if !resolved.exists() || !resolved.is_dir() {
        return Err(ZenError::Custom(format!(
            "Terminal cwd is not a directory: {}",
            resolved.display()
        )));
    }

    Ok(resolved)
}

fn shell_cwd(path: &std::path::Path) -> String {
    // `canonicalize` on Windows can yield a `\\?\` extended-length path. It is
    // valid for file APIs but makes the PowerShell prompt noisy and unfamiliar.
    let path = path.to_string_lossy();
    path.strip_prefix("\\\\?\\").unwrap_or(&path).to_string()
}

impl Default for TerminalService {
    fn default() -> Self {
        Self::new()
    }
}
