use anyhow::{Context, Result};
use portable_pty::{native_pty_system, Child, CommandBuilder, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use tokio::sync::Mutex;

const OUTPUT_BUFFER_LIMIT: usize = 64 * 1024; // 64KB max buffer per session
type OutputCallback = Box<dyn Fn(&str, u64, &str) + Send + 'static>;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Apply Windows hidden-process configuration to non-interactive commands so that
/// PowerShell windows do not flash on screen. Interactive PTY spawns (via
/// `portable_pty`) are explicitly excluded — they require a visible PTY surface.
#[cfg(target_os = "windows")]
fn hide_console(cmd: &mut tokio::process::Command) {
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn hide_console(_cmd: &mut tokio::process::Command) {}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputSnapshot {
    pub sequence: u64,
    pub data: String,
}

struct TerminalOutputBuffer {
    sequence: u64,
    data: String,
}

/// A single PTY session — holds only Send+Sync-safe handles.
/// The MasterPty is consumed during construction; we only keep the writer + reader task.
pub struct PtySession {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
    /// Accumulated output buffer from the background reader
    output_buffer: Arc<std::sync::RwLock<TerminalOutputBuffer>>,
    /// Background reader task handle
    _reader_handle: tokio::task::JoinHandle<()>,
    /// Master PTY handle MUST be kept alive. Dropping it closes the connection.
    pub master: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    /// Session ID for process manager tracking
    session_id: String,
}

impl PtySession {
    /// Check if the child process has exited.
    pub async fn try_wait(&self) -> Result<Option<portable_pty::ExitStatus>> {
        let mut child = self.child.lock().await;
        child.try_wait().map_err(|e| anyhow::anyhow!("{}", e))
    }

    /// Kill the child process.
    pub async fn kill(&self) -> Result<()> {
        let mut child = self.child.lock().await;
        tracing::info!(session_id = %self.session_id, "Killing PTY session");
        child.kill().map_err(|e| anyhow::anyhow!("{}", e))
    }

    /// Write data (keystrokes) to the PTY.
    pub async fn write_data(&self, data: &str) -> Result<()> {
        let mut writer = self.writer.lock().await;
        writer.write_all(data.as_bytes())?;
        writer.flush()?;
        Ok(())
    }

    /// Read and drain the accumulated output buffer.
    pub async fn read_output(&self) -> TerminalOutputSnapshot {
        let mut buf = self.output_buffer.write().unwrap();
        TerminalOutputSnapshot {
            sequence: buf.sequence,
            data: std::mem::take(&mut buf.data),
        }
    }

    /// Get the current output without draining.
    pub async fn peek_output(&self) -> TerminalOutputSnapshot {
        let buf = self.output_buffer.read().unwrap();
        TerminalOutputSnapshot {
            sequence: buf.sequence,
            data: buf.data.clone(),
        }
    }
}

/// Manages multiple PTY sessions identified by UUID strings.
pub struct TerminalManager {
    sessions: HashMap<String, PtySession>,
    /// Optional reference to process manager for cleanup tracking
    process_manager: Option<Arc<crate::services::process_manager::ProcessManager>>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
            process_manager: None,
        }
    }

    /// Create a new TerminalManager with process manager integration
    pub fn with_process_manager(
        process_manager: Arc<crate::services::process_manager::ProcessManager>,
    ) -> Self {
        Self {
            sessions: HashMap::new(),
            process_manager: Some(process_manager),
        }
    }

    /// Spawn a new PTY session running the default shell.
    /// Returns the session_id.
    pub fn spawn(
        &mut self,
        cwd: Option<String>,
        cols: u16,
        rows: u16,
        on_output: Option<OutputCallback>,
    ) -> Result<String> {
        // Build shell command (PowerShell on Windows, bash/zsh on Unix)
        let cmd = if cfg!(target_os = "windows") {
            let mut c = CommandBuilder::new("powershell.exe");
            c.args(["-NoLogo", "-NoProfile"]);
            c
        } else {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
            CommandBuilder::new(shell)
        };

        self.spawn_with_command(cmd, cwd, cols, rows, on_output)
    }

    /// Spawn a new PTY session with a specific command.
    pub fn spawn_with_command(
        &mut self,
        mut cmd: CommandBuilder,
        cwd: Option<String>,
        cols: u16,
        rows: u16,
        on_output: Option<OutputCallback>,
    ) -> Result<String> {
        let session_id = uuid::Uuid::new_v4().to_string();

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| anyhow::anyhow!("Failed to open PTY: {}", e))?;

        if let Some(dir) = cwd {
            cmd.cwd(dir);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| anyhow::anyhow!("Failed to spawn command: {}", e))?;

        let pid = child.process_id().unwrap_or(0);

        // Clone reader and writer from master BEFORE dropping master
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| anyhow::anyhow!("Failed to clone PTY reader: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| anyhow::anyhow!("Failed to clone PTY writer: {}", e))?;

        // Set up background reader that accumulates output
        let output_buffer = Arc::new(std::sync::RwLock::new(TerminalOutputBuffer {
            sequence: 0,
            data: String::new(),
        }));
        let buffer_clone = output_buffer.clone();
        let reader_done = Arc::new(tokio::sync::Notify::new());
        let reader_done_clone = reader_done.clone();
        let sid = session_id.clone();

        let reader_handle = tokio::task::spawn_blocking(move || {
            let mut chunk = [0u8; 4096];
            tracing::info!("PTY Reader thread started");
            loop {
                match reader.read(&mut chunk) {
                    Ok(0) => {
                        tracing::info!("PTY Reader encountered EOF");
                        break;
                    }
                    Ok(n) => {
                        let text = String::from_utf8_lossy(&chunk[..n]).to_string();
                        // tracing::debug!("PTY Read {} bytes: {:?}", n, text);
                        let sequence = {
                            let mut b = buffer_clone.write().unwrap();
                            b.sequence = b.sequence.saturating_add(1);
                            b.data.push_str(&text);
                            if b.data.len() > OUTPUT_BUFFER_LIMIT {
                                let start = b.data.len() - OUTPUT_BUFFER_LIMIT;
                                b.data = b.data[start..].to_string();
                            }
                            b.sequence
                        };
                        if let Some(ref cb) = on_output {
                            cb(&sid, sequence, &text);
                        }
                    }
                    Err(e) => {
                        tracing::error!("PTY Read error: {}", e);
                        break;
                    }
                }
            }
            tracing::info!("PTY Reader thread exiting");
            reader_done_clone.notify_waiters();
        });

        let session = PtySession {
            writer: Arc::new(Mutex::new(writer)),
            child: Mutex::new(child),
            output_buffer,
            _reader_handle: reader_handle,
            master: Arc::new(Mutex::new(pair.master)),
            session_id: session_id.clone(),
        };

        self.sessions.insert(session_id.clone(), session);

        // Register with process manager if available
        if let Some(ref pm) = self.process_manager {
            let pm_clone = pm.clone();
            let sid = session_id.clone();
            tokio::spawn(async move {
                pm_clone.register(&sid, "pty-session", pid).await;
            });
        }

        tracing::info!(session_id = %session_id, "PTY session spawned");
        Ok(session_id)
    }

    /// Execute a one-shot command and return output. Used by the agent tool.
    pub async fn execute_command(
        &mut self,
        command: &str,
        cwd: Option<String>,
        timeout_ms: u64,
    ) -> Result<CommandResult> {
        let mut child = if cfg!(target_os = "windows") {
            let mut c = tokio::process::Command::new("powershell.exe");
            c.args([
                "-NonInteractive",
                "-NoLogo",
                "-NoProfile",
                "-Command",
                command,
            ]);
            hide_console(&mut c);
            c
        } else {
            let mut c = tokio::process::Command::new("sh");
            c.args(["-c", command]);
            c
        };

        if let Some(dir) = cwd {
            child.current_dir(dir);
        }

        // Capture output
        child.stdout(std::process::Stdio::piped());
        child.stderr(std::process::Stdio::piped());
        child.stdin(std::process::Stdio::null());

        let mut spawned = child.spawn().context("Failed to spawn command process")?;

        let mut stdout = spawned.stdout.take().context("Failed to take stdout")?;
        let mut stderr = spawned.stderr.take().context("Failed to take stderr")?;

        let stdout_handle = tokio::spawn(async move {
            let mut out = Vec::new();
            let _ = tokio::io::copy(&mut stdout, &mut out).await;
            out
        });
        let stderr_handle = tokio::spawn(async move {
            let mut out = Vec::new();
            let _ = tokio::io::copy(&mut stderr, &mut out).await;
            out
        });

        // Wait with timeout
        let result = tokio::time::timeout(
            tokio::time::Duration::from_millis(timeout_ms),
            spawned.wait(),
        )
        .await;

        match result {
            Ok(Ok(status)) => {
                let stdout_out = stdout_handle.await.unwrap_or_default();
                let stderr_out = stderr_handle.await.unwrap_or_default();
                let stdout_str = String::from_utf8_lossy(&stdout_out).to_string();
                let stderr_str = String::from_utf8_lossy(&stderr_out).to_string();
                let combined = if stderr_str.is_empty() {
                    stdout_str
                } else {
                    format!("{}{}", stdout_str, stderr_str)
                };

                Ok(CommandResult {
                    output: combined,
                    exit_code: status.code().map(|c| c as u32),
                    timed_out: false,
                    was_truncated: false,
                })
            }
            Ok(Err(e)) => Err(anyhow::anyhow!("Command execution failed: {}", e)),
            Err(_) => {
                // Timeout occurred — kill process but capture any partial output
                let _ = spawned.kill().await;
                let stdout_out = stdout_handle.await.unwrap_or_default();
                let stderr_out = stderr_handle.await.unwrap_or_default();
                let stdout_str = String::from_utf8_lossy(&stdout_out).to_string();
                let stderr_str = String::from_utf8_lossy(&stderr_out).to_string();
                let combined = if stderr_str.is_empty() {
                    stdout_str
                } else {
                    format!("{}{}", stdout_str, stderr_str)
                };
                Ok(CommandResult {
                    output: combined,
                    exit_code: None,
                    timed_out: true,
                    was_truncated: false,
                })
            }
        }
    }

    pub fn get(&self, session_id: &str) -> Option<&PtySession> {
        self.sessions.get(session_id)
    }

    pub fn get_mut(&mut self, session_id: &str) -> Option<&mut PtySession> {
        self.sessions.get_mut(session_id)
    }

    pub fn kill_session(&mut self, session_id: &str) -> Result<()> {
        if let Some(session) = self.sessions.remove(session_id) {
            // Kill asynchronously — best effort
            let session_id_owned = session_id.to_string();
            let pm_clone = self.process_manager.clone();

            tokio::spawn(async move {
                // The process manager uses a Windows process-tree kill. Run it
                // before the PTY child fallback so compiler/server descendants
                // cannot survive a terminal tab closing.
                if let Some(pm) = pm_clone {
                    if !pm.kill_process(&session_id_owned).await {
                        let _ = session.kill().await;
                    }
                } else {
                    let _ = session.kill().await;
                }
            });
            tracing::info!(session_id = %session_id, "PTY session killed");
        }
        Ok(())
    }

    /// Kill all sessions - call this on app exit
    pub async fn kill_all_sessions(&mut self) {
        let session_ids: Vec<String> = self.sessions.keys().cloned().collect();

        for session_id in session_ids {
            if let Err(e) = self.kill_session(&session_id) {
                tracing::error!(session_id = %session_id, error = %e, "Failed to kill session");
            }
        }

        // Unregister all from process manager
        if let Some(ref pm) = self.process_manager {
            pm.kill_all().await;
        }

        self.sessions.clear();
        tracing::info!("All terminal sessions cleaned up");
    }
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Result of a one-shot command execution.
#[derive(Debug, Clone)]
pub struct CommandResult {
    pub output: String,
    pub exit_code: Option<u32>,
    pub timed_out: bool,
    pub was_truncated: bool,
}

impl CommandResult {
    /// Format the result for the LLM, similar to Zed's process_content.
    pub fn format_for_llm(&self, command: &str) -> String {
        let content = self.output.trim();
        let is_empty = content.is_empty();

        // Truncate output if too large (16KB limit for LLM context)
        let max_chars = 16 * 1024;
        let (content, was_truncated_now) = if content.chars().count() > max_chars {
            (
                content
                    .chars()
                    .rev()
                    .take(max_chars)
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .collect::<String>(),
                true,
            )
        } else {
            (content.to_string(), false)
        };

        let truncation_warning = if was_truncated_now || self.was_truncated {
            "[OUTPUT TRUNCATED - showing last 16KB]\n"
        } else {
            ""
        };

        let content_block = format!("{}```\n{}\n```", truncation_warning, content);

        if self.timed_out {
            if is_empty {
                format!("Command \"{}\" timed out with no output captured.", command)
            } else {
                format!(
                    "Command \"{}\" timed out. Partial output:\n\n{}",
                    command, content_block
                )
            }
        } else {
            match self.exit_code {
                Some(0) => {
                    if is_empty {
                        "Command executed successfully.".to_string()
                    } else {
                        content_block
                    }
                }
                Some(code) => {
                    if is_empty {
                        format!("Command \"{}\" failed with exit code {}.", command, code)
                    } else {
                        format!(
                            "Command \"{}\" failed with exit code {}. Output:\n\n{}",
                            command, code, content_block
                        )
                    }
                }
                None => {
                    if is_empty {
                        "Command terminated. No output was captured.".to_string()
                    } else {
                        format!("Command completed. Output:\n\n{}", content_block)
                    }
                }
            }
        }
    }
}
