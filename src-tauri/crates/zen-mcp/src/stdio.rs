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
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio_util::sync::CancellationToken;
use tracing::{debug, warn};

/// Default timeout for a single stdio request (initialize, tools/list, etc.)
/// when the server config does not specify one.
pub const DEFAULT_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
/// Maximum single newline-delimited JSON-RPC message accepted from or sent to
/// an MCP child process.
pub const MAX_STDIO_MESSAGE_BYTES: usize = 2 * 1024 * 1024;

/// Environment variable names inherited from the host when spawning a stdio
/// MCP child. The child is spawned with `env_clear()` first so it never
/// inherits the parent's full environment (API keys, tokens, session
/// secrets); only these process-baseline vars needed to locate runtimes and
/// resolve a home directory are re-added, then the server's own configured
/// `env` map is layered on top. Names are matched case-insensitively on
/// Windows because the OS treats env keys case-insensitively.
///
/// ponytail: fixed allowlist, not user-configurable — add a per-server
/// `passthrough_env` field if a server ever needs an extra host var.
const CHILD_ENV_ALLOWLIST: &[&str] = &[
    // POSIX runtime/tool resolution.
    "PATH",
    "HOME",
    "LANG",
    "LC_ALL",
    "TMPDIR",
    "TERM",
    "TZ",
    // Windows runtime/tool resolution.
    "Path",
    "PATHEXT",
    "SYSTEMROOT",
    "SystemRoot",
    "WINDIR",
    "windir",
    "COMSPEC",
    "ComSpec",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "HOMEDRIVE",
    "HOMEPATH",
    "APPDATA",
    "LOCALAPPDATA",
    "PROGRAMDATA",
    "ProgramData",
    "PROGRAMFILES",
    "ProgramFiles",
    "PROGRAMFILES(X86)",
    "SYSTEMDRIVE",
    "SystemDrive",
    "NUMBER_OF_PROCESSORS",
    "PROCESSOR_ARCHITECTURE",
];

/// Snapshot the host environment restricted to `CHILD_ENV_ALLOWLIST`. Used as
/// the baseline for a stdio child so it can locate its runtime without
/// inheriting parent secrets.
fn baseline_child_env() -> std::collections::BTreeMap<String, String> {
    let mut baseline = std::collections::BTreeMap::new();
    for name in CHILD_ENV_ALLOWLIST {
        if let Ok(value) = std::env::var(name) {
            baseline.insert((*name).to_string(), value);
        }
    }
    baseline
}

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
    /// OS sandbox confining the child (Windows Job Object; no-op elsewhere).
    /// Held for the child's lifetime — dropping it (with the transport) closes
    /// the job and, via kill-on-close, terminates any process still inside it.
    /// `_sandbox` because it is never read after construction; its Drop is the
    /// entire contract.
    _sandbox: Option<crate::sandbox::Sandbox>,
    /// Per-request timeout, from the server config (default 30s).
    request_timeout: Duration,
    /// Receiver for server→client notification method names (e.g.
    /// `notifications/resources/list_changed`). Taken once by the sync loop
    /// after handshake; `None` after it's been consumed. The channel closes
    /// when the reader task ends (child EOF/error), so a listener spawned on
    /// it terminates deterministically on process loss.
    notifications: Mutex<Option<mpsc::UnboundedReceiver<String>>>,
}

impl StdioTransport {
    /// Spawn a child process and start the background stdout reader.
    /// `env` pairs are applied to the child (values pre-expanded by the
    /// caller); `timeout` bounds every request. Returns `Err` if the
    /// process can't be spawned.
    pub async fn spawn(
        command: &str,
        args: &[String],
        env: &std::collections::BTreeMap<String, String>,
        timeout: Duration,
    ) -> Result<Arc<Self>, String> {
        let mut cmd = Command::new(command);
        cmd.args(args)
            .env_clear()
            .envs(baseline_child_env())
            .envs(env)
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
            .map_err(|e| format!("stdio transport: failed to spawn '{command}': {e}"))?;

        // Confine the child in an OS sandbox (Windows Job Object; no-op on other
        // platforms) before touching its pipes. Fail closed: if the OS refuses
        // to apply the limits, kill the child rather than run it unconfined.
        #[cfg(windows)]
        let sandbox = match crate::sandbox::Sandbox::confine(child.raw_handle()) {
            Ok(sandbox) => sandbox,
            Err(error) => {
                let _ = child.kill().await;
                return Err(format!(
                    "stdio transport: failed to sandbox '{command}': {error}"
                ));
            }
        };
        #[cfg(not(windows))]
        let sandbox = crate::sandbox::Sandbox::confine::<std::convert::Infallible>(None)
            .ok()
            .flatten();

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

        // Notification channel: the reader task forwards each server→client
        // notification's method name here so the sync loop can react to
        // list-change signals. Unbounded so the reader never blocks; method
        // names are tiny and the receiver drains promptly.
        let (notify_tx, notify_rx) = mpsc::unbounded_channel::<String>();

        // Background reader: routes JSON-RPC responses by id.
        let pending_clone = pending.clone();
        let tag = command.to_string();
        tokio::spawn(async move {
            Self::reader_task(stdout, pending_clone, notify_tx, &tag).await;
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
            _sandbox: sandbox,
            request_timeout: timeout,
            notifications: Mutex::new(Some(notify_rx)),
        }))
    }

    /// Background task that reads stdout line-by-line, parses each line
    /// as a JSON-RPC response, and routes it to the waiting sender by id.
    /// Server-initiated notifications (no `id` field) have their method name
    /// forwarded on `notify_tx` so the sync loop can react to list-change
    /// signals; the payload itself is dropped (never fed to the model).
    async fn reader_task(
        stdout: ChildStdout,
        pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Value>>>>,
        notify_tx: mpsc::UnboundedSender<String>,
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
                    if line.len() > MAX_STDIO_MESSAGE_BYTES {
                        warn!(
                            server = %server_tag,
                            limit = MAX_STDIO_MESSAGE_BYTES,
                            "stdio reader: message exceeds size limit, skipping"
                        );
                        line.clear();
                        continue;
                    }
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
                        // Server→client notification. Forward only the method
                        // name (a small, safe label) so the sync loop can react
                        // to list-change signals; the payload is never surfaced.
                        if let Some(method) = parsed.get("method").and_then(|v| v.as_str()) {
                            debug!(
                                server = %server_tag,
                                method = %method,
                                "stdio reader: server notification"
                            );
                            let _ = notify_tx.send(method.to_string());
                        }
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
    /// Times out after the configured `request_timeout` to avoid hanging
    /// on an unresponsive child process.
    pub async fn send_request(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> Result<Value, String> {
        self.send_request_cancelable(method, params, None).await
    }

    /// Send a request with cooperative cancellation. Cancellation emits the
    /// standard `notifications/cancelled` notification and removes the
    /// pending response so a late server reply cannot mutate client state.
    pub async fn send_request_cancelable(
        &self,
        method: &str,
        params: Option<Value>,
        cancellation: Option<&CancellationToken>,
    ) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let envelope = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params.unwrap_or(Value::Object(serde_json::Map::new())),
        });
        let line = serde_json::to_string(&envelope)
            .map_err(|e| format!("stdio send_request: serialize failed: {e}"))?;
        if line.len() > MAX_STDIO_MESSAGE_BYTES {
            return Err(format!(
                "stdio send_request: message exceeds {MAX_STDIO_MESSAGE_BYTES} byte limit"
            ));
        }

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
                .map_err(|e| format!("stdio send_request: write failed: {e}"))?;
            stdin
                .write_all(b"\n")
                .await
                .map_err(|e| format!("stdio send_request: write newline failed: {e}"))?;
            stdin
                .flush()
                .await
                .map_err(|e| format!("stdio send_request: flush failed: {e}"))?;
        }

        let response = async {
            tokio::time::timeout(self.request_timeout, rx)
                .await
                .map_err(|_| {
                    format!("stdio send_request: timeout waiting for response to '{method}'")
                })?
                .map_err(|_| "stdio send_request: response channel closed".to_string())
        };
        let response_result = if let Some(token) = cancellation {
            tokio::select! {
                result = response => result,
                _ = token.cancelled() => {
                    let _ = self
                        .send_notification(
                            "notifications/cancelled",
                            Some(serde_json::json!({ "requestId": id, "reason": "client_cancelled" })),
                        )
                        .await;
                    let mut pending = self.pending.lock().await;
                    pending.remove(&id);
                    return Err(format!("stdio request '{method}' cancelled"));
                }
            }
        } else {
            response.await
        };
        let resp = match response_result {
            Ok(value) => value,
            Err(error) => {
                let mut pending = self.pending.lock().await;
                pending.remove(&id);
                return Err(error);
            }
        };

        // Check for JSON-RPC error and surface the message.
        if let Some(err) = resp.get("error") {
            let msg = err
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("unknown");
            return Err(format!("stdio request '{method}' failed: {msg}"));
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
            .map_err(|e| format!("stdio send_notification: serialize failed: {e}"))?;
        if line.len() > MAX_STDIO_MESSAGE_BYTES {
            return Err(format!(
                "stdio send_notification: message exceeds {MAX_STDIO_MESSAGE_BYTES} byte limit"
            ));
        }

        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| format!("stdio send_notification: write failed: {e}"))?;
        stdin
            .write_all(b"\n")
            .await
            .map_err(|e| format!("stdio send_notification: write newline failed: {e}"))?;
        stdin
            .flush()
            .await
            .map_err(|e| format!("stdio send_notification: flush failed: {e}"))?;
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

    /// Take the server→client notification receiver. Returns `Some` exactly
    /// once per transport (the sync loop consumes it after handshake to spawn a
    /// list-change listener); subsequent calls return `None`. The stream ends
    /// when the reader task stops, i.e. on child EOF/error, so a listener built
    /// on it terminates deterministically on process loss.
    pub async fn take_notifications(&self) -> Option<mpsc::UnboundedReceiver<String>> {
        self.notifications.lock().await.take()
    }
}
