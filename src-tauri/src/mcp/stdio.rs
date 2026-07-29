//! MCP stdio transport — spawns a child process and pipes JSON-RPC 2.0
//! messages over its stdin/stdout (newline-delimited JSON).
//!
//! Per the MCP spec, the stdio transport:
//! - Uses newline-delimited JSON (NOT Content-Length headers like LSP)
//! - Does NOT use a Mcp-Session-Id (no headers in stdio)
//! - Is implicitly tied to a single session (one child = one session)
//!
//! The transport owns the child process with `kill_on_drop(true)` so the
//! process is terminated when the transport is dropped (e.g. on re-sync
//! or app shutdown).

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter};
use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};
use tokio::sync::{oneshot, Mutex};
use tracing::{debug, warn};

/// Default timeout for a single stdio request (initialize, tools/list, etc.).
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// MCP stdio transport. Owns a child process and provides request/response
/// routing over its stdin/stdout using newline-delimited JSON-RPC 2.0.
pub struct StdioTransport {
    /// Write side of the child's stdin. Guarded so writes serialize.
    stdin: Mutex<BufWriter<ChildStdin>>,
    /// Pending request responders keyed by JSON-RPC id. The background
    /// reader task fulfills these as responses arrive on stdout.
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Value>>>>,
    /// Monotonic id counter for the next request.
    next_id: AtomicU64,
    /// The child process. `kill_on_drop` ensures it's terminated when
    /// the transport (and therefore the child handle) is dropped.
    child: Mutex<Child>,
}

impl StdioTransport {
    /// Spawn a child process and start the background stdout reader.
    /// Returns `Err` if the process can't be spawned.
    pub async fn spawn(command: &str, args: &[String]) -> Result<Arc<Self>, String> {
        let mut cmd = Command::new(command);
        cmd.args(args)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);

        // On Windows, hide the console window so spawned MCP servers
        // don't pop up a visible terminal in the GUI app.
        #[cfg(target_os = "windows")]
        {
            // tokio::process::Command on Windows exposes
            // `creation_flags` directly — no trait import needed.
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("stdio transport: failed to spawn '{}': {}", command, e))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "stdio transport: child stdin not captured".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "stdio transport: child stdout not captured".to_string())?;

        // Take stderr for logging (best-effort; don't fail if missing).
        let stderr = child.stderr.take();

        let pending = Arc::new(Mutex::new(HashMap::<u64, oneshot::Sender<Value>>::new()));

        // Background reader: routes JSON-RPC responses by id.
        let pending_clone = pending.clone();
        let tag = command.to_string();
        tokio::spawn(async move {
            Self::reader_task(stdout, pending_clone, &tag).await;
        });

        // Background stderr logger for troubleshooting.
        if let Some(stderr) = stderr {
            let tag = command.to_string();
            tokio::spawn(async move {
                Self::stderr_task(stderr, &tag).await;
            });
        }

        Ok(Arc::new(Self {
            stdin: Mutex::new(BufWriter::new(stdin)),
            pending,
            next_id: AtomicU64::new(1),
            child: Mutex::new(child),
        }))
    }

    /// Background task that reads stdout line-by-line, parses each line
    /// as a JSON-RPC response, and routes it to the waiting sender by id.
    /// Server-initiated notifications (no `id` field) are logged and
    /// dropped — we don't handle server→client notifications yet.
    async fn reader_task(
        stdout: ChildStdout,
        pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Value>>>>,
        server_tag: &str,
    ) {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line).await {
                Ok(0) => {
                    // EOF — child closed stdout. Cancel all pending
                    // requests so callers don't hang forever.
                    debug!(server = %server_tag, "stdio reader: child stdout closed (EOF)");
                    let mut map = pending.lock().await;
                    for (_, sender) in map.drain() {
                        let _ = sender.send(Value::Null);
                    }
                    break;
                }
                Ok(_) => {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    let parsed: Value = match serde_json::from_str(trimmed) {
                        Ok(v) => v,
                        Err(e) => {
                            warn!(
                                server = %server_tag,
                                error = %e,
                                "stdio reader: unparseable line, skipping"
                            );
                            continue;
                        }
                    };
                    // Responses carry an `id`; notifications don't.
                    if let Some(id) = parsed.get("id").and_then(|v| v.as_u64()) {
                        let mut map = pending.lock().await;
                        if let Some(sender) = map.remove(&id) {
                            let _ = sender.send(parsed);
                        } else {
                            warn!(
                                server = %server_tag,
                                id = id,
                                "stdio reader: response with no pending request"
                            );
                        }
                    } else {
                        debug!(
                            server = %server_tag,
                            method = ?parsed.get("method"),
                            "stdio reader: server notification (ignored)"
                        );
                    }
                }
                Err(e) => {
                    warn!(
                        server = %server_tag,
                        error = %e,
                        "stdio reader: read error, stopping reader task"
                    );
                    let mut map = pending.lock().await;
                    for (_, sender) in map.drain() {
                        let _ = sender.send(Value::Null);
                    }
                    break;
                }
            }
        }
    }

    /// Background task that logs stderr output at debug level for
    /// troubleshooting. Best-effort — errors are silently dropped.
    async fn stderr_task(stderr: ChildStderr, server_tag: &str) {
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line).await {
                Ok(0) => break,
                Ok(_) => {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        debug!(server = %server_tag, "stdio stderr: {}", trimmed);
                    }
                }
                Err(_) => break,
            }
        }
    }

    /// Send a JSON-RPC request and wait for the matching response.
    /// Returns the full response value (caller extracts `result`).
    /// Times out after [`REQUEST_TIMEOUT`] to avoid hanging on an
    /// unresponsive child process.
    pub async fn send_request(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let envelope = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params.unwrap_or(Value::Object(serde_json::Map::new())),
        });
        let line = serde_json::to_string(&envelope)
            .map_err(|e| format!("stdio send_request: serialize failed: {}", e))?;

        let (tx, rx) = oneshot::channel();
        {
            let mut map = self.pending.lock().await;
            map.insert(id, tx);
        }

        {
            let mut stdin = self.stdin.lock().await;
            stdin
                .write_all(line.as_bytes())
                .await
                .map_err(|e| format!("stdio send_request: write failed: {}", e))?;
            stdin
                .write_all(b"\n")
                .await
                .map_err(|e| format!("stdio send_request: write newline failed: {}", e))?;
            stdin
                .flush()
                .await
                .map_err(|e| format!("stdio send_request: flush failed: {}", e))?;
        }

        let resp = tokio::time::timeout(REQUEST_TIMEOUT, rx)
            .await
            .map_err(|_| {
                format!("stdio send_request: timeout waiting for response to '{}'", method)
            })?
            .map_err(|_| "stdio send_request: response channel closed".to_string())?;

        // Check for JSON-RPC error and surface the message.
        if let Some(err) = resp.get("error") {
            let msg = err
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("unknown");
            return Err(format!("stdio request '{}' failed: {}", method, msg));
        }

        Ok(resp)
    }

    /// Send a JSON-RPC notification (no `id`, no response expected).
    /// Per JSON-RPC 2.0, the absence of `id` makes the message a
    /// notification. Used for the spec-mandatory `notifications/initialized`.
    pub async fn send_notification(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> Result<(), String> {
        let mut envelope = serde_json::json!({
            "jsonrpc": "2.0",
            "method": method,
        });
        if let Some(p) = params {
            envelope["params"] = p;
        }
        let line = serde_json::to_string(&envelope)
            .map_err(|e| format!("stdio send_notification: serialize failed: {}", e))?;

        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| format!("stdio send_notification: write failed: {}", e))?;
        stdin
            .write_all(b"\n")
            .await
            .map_err(|e| format!("stdio send_notification: write newline failed: {}", e))?;
        stdin
            .flush()
            .await
            .map_err(|e| format!("stdio send_notification: flush failed: {}", e))?;
        Ok(())
    }

    /// Check if the child process is still running. Useful for
    /// deciding whether to attempt a re-handshake or report the
    /// server as dead.
    pub async fn is_alive(&self) -> bool {
        let mut child = self.child.lock().await;
        match child.try_wait() {
            Ok(None) => true,
            Ok(Some(_)) => false,
            Err(_) => false,
        }
    }
}
