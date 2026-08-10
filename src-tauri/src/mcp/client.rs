//! MCP Client — connects to external MCP servers configured via `.mcp.json`.
//!
//! Reads the workspace `.mcp.json`, performs the spec-compliant
//! `initialize` + `notifications/initialized` handshake with each server,
//! then discovers `tools/list` from each one and registers the tools with
//! the `ext:{server}:{name}` prefix. Proxies `tools/call` requests,
//! echoing the server-assigned `Mcp-Session-Id` on every request.

use serde_json::{Map, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, RwLock};
use tracing::{info, warn};

use crate::services::McpConfigService;
use crate::tools::ToolRegistry;

use super::stdio::StdioTransport;
use super::types::{
    initialized_notification, methods, ClientCapabilities, Implementation, InitializeParams,
    InitializeResult, ACCEPT_JSON_OR_SSE, HEADER_PROTOCOL_VERSION, HEADER_SESSION_ID,
    PROTOCOL_VERSION,
};

/// Build the LLM-visible prefixed form (`ext:{server}:{tool}`) for an
/// external MCP tool. Centralised in this module so the wire shape is
/// the same on the registration side (where adapters compute their
/// `Tool::name`) and the consumption side (LLM config / `.mcp.json`
/// parsers) — every other location reads it through this helper and
/// never re-derives the format.
pub fn prefixed_external_tool_name(server_name: &str, tool_name: &str) -> String {
    format!("ext:{}:{}", server_name, tool_name)
}

/// Returns true if `name` is the prefixed form (`ext:…`) of an external
/// MCP tool. Replaces `McpClient::is_external_tool` so the test for
/// the `ext:` prefix lives next to the helper that produces the
/// prefix instead of next to legacy string-parsing dispatch.
pub fn is_external_tool_name(name: &str) -> bool {
    name.starts_with("ext:")
}

/// Map an MCP server's optional `annotations` block (the 2025-06-18 spec's
/// `readOnlyHint` / `destructiveHint` / `openWorldHint`) to ZEN's 4-tier
/// `RiskLevel`.
///
/// Per the MCP spec, annotations are HINTS — the server may be lying or
/// may not advertise any annotations at all, so this function is
/// deliberately conservative:
///
/// * When annotations are absent (`None`) we default to `Medium` —
///   matches the pre-refactor behaviour for external tools and gives
///   the standard `ask`/`auto_edit` permission flow enough room to
///   gate destructive-looking operations.
/// * `destructiveHint = true` always wins. Destructive means the tool
///   "may perform destructive updates", regardless of any other flag.
///   Pairing `destructiveHint=true` with `openWorldHint=true` (i.e.
///   destructive + cross-network) escalates to `Critical`; non-network
///   destructive stays at `High` (matches the ZEN tier used for
///   `write_file`/`edit_file`/`apply_patch`).
/// * `readOnlyHint = true` with no destruction flag drops to `Low`.
///   MCP spec explicitly says destructive=true is only meaningful when
///   `readOnlyHint = false`, so we trust the spec pairing here.
/// * `openWorldHint = true` alone (network calls but no destruction
///   declared) maps to `Medium` (matches `web_search`'s tier).
/// * Mangled server replies where destructive and read-only contradict
///   resolve to the destructive branch (above), surfaced at
///   `High`/`Critical` so the user is forced to confirm.
pub fn risk_level_from_annotations(
    ann: Option<&crate::tools::ToolAnnotations>,
) -> crate::tools::permission::RiskLevel {
    use crate::tools::permission::RiskLevel;

    match ann {
        None => RiskLevel::Medium,
        Some(a) => {
            // Destructive wins over everything per the MCP spec.
            if a.destructive_hint == Some(true) {
                if a.open_world_hint == Some(true) {
                    return RiskLevel::Critical;
                }
                return RiskLevel::High;
            }
            // Explicit read-only (and not destructive, which we already
            // handled) ⇒ safely auto-allowable.
            if a.read_only_hint == Some(true) {
                return RiskLevel::Low;
            }
            // Open-world non-destructive (e.g. fetch-only network tool).
            if a.open_world_hint == Some(true) {
                return RiskLevel::Medium;
            }
            // Default for "present but non-committal" annotations.
            RiskLevel::Medium
        }
    }
}

/// HTTP-based endpoint state (Streamable HTTP transport). URL and
/// session live together so the dispatch lookup can grab both in a
/// single critical section (no TOCTOU window between separate maps).
#[derive(Debug, Clone, Default)]
struct HttpEndpoint {
    /// Base URL from `.mcp.json` for this server.
    url: String,
    /// Server-assigned session id (from `Mcp-Session-Id` response header).
    /// `None` if the server is stateless — we still send the handshake to
    /// negotiate version/capabilities, we just never echo back a session id.
    session_id: Option<String>,
    /// Protocol version the server replied with during `initialize`.
    /// Echoed back as `MCP-Protocol-Version` on subsequent calls.
    protocol_version: Option<String>,
}

/// stdio-based endpoint state (child process transport). Owns the
/// `StdioTransport` which in turn owns the child process with
/// `kill_on_drop(true)` — dropping this endpoint terminates the child.
#[derive(Clone)]
struct StdioEndpoint {
    transport: Arc<StdioTransport>,
    protocol_version: Option<String>,
}

impl std::fmt::Debug for StdioEndpoint {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("StdioEndpoint")
            .field("protocol_version", &self.protocol_version)
            .finish_non_exhaustive()
    }
}

/// Per-server endpoint state captured during the MCP `initialize` handshake.
/// Two variants matching the two transports ZEN's MCP client supports:
/// - `Http` — Streamable HTTP transport (reqwest-based, `url` field in `.mcp.json`)
/// - `Stdio` — child process transport (`command`+`args` fields in `.mcp.json`)
#[derive(Clone, Debug)]
enum ServerEndpoint {
    Http(HttpEndpoint),
    Stdio(StdioEndpoint),
}

/// Client for connecting to external MCP servers.
pub struct McpClient {
    tool_registry: Arc<RwLock<ToolRegistry>>,
    mcp_config: Arc<McpConfigService>,
    /// Per-server endpoint state (URL + session id + negotiated protocol
    /// version). Populated by `sync_external_servers()` after a successful
    /// `initialize` + `notifications/initialized` handshake.
    external_endpoints: std::sync::Mutex<HashMap<String, ServerEndpoint>>,
    /// Serializes concurrent calls to `sync_external_servers`. Rapid
    /// UI `add_server` clicks queue rather than racing on the
    /// registry, and stale `ext:*` adapters are guaranteed to be
    /// cleared exactly once before the new set is registered.
    sync_lock: Arc<Mutex<()>>,
}

impl McpClient {
    pub fn new(
        tool_registry: Arc<RwLock<ToolRegistry>>,
        mcp_config: Arc<McpConfigService>,
    ) -> Self {
        Self {
            tool_registry,
            mcp_config,
            external_endpoints: std::sync::Mutex::new(HashMap::new()),
            sync_lock: Arc::new(Mutex::new(())),
        }
    }

    /// Layer the spec-mandatory MCP headers onto a request builder.
    /// - `Accept: application/json, text/event-stream` is always set.
    /// - `MCP-Protocol-Version` is always set (negotiated version if we
    ///   have one from `initialize`, otherwise the client's preferred).
    /// - `Mcp-Session-Id` is only set when the server assigned one.
    fn apply_mcp_headers(
        builder: reqwest::RequestBuilder,
        endpoint: Option<&HttpEndpoint>,
    ) -> reqwest::RequestBuilder {
        let negotiated_version = endpoint
            .and_then(|e| e.protocol_version.as_deref())
            .unwrap_or(PROTOCOL_VERSION);
        let mut b = builder.header("Accept", ACCEPT_JSON_OR_SSE);
        b = b.header(HEADER_PROTOCOL_VERSION, negotiated_version);
        if let Some(sid) = endpoint.and_then(|e| e.session_id.as_ref()) {
            b = b.header(HEADER_SESSION_ID, sid);
        }
        b
    }

    /// Perform the spec-compliant `initialize` handshake against `url`.
    /// Returns the per-server session state the server issued. Errors
    /// are surfaced as `Err(String)` so the caller can log and skip.
    async fn initialize_server(
        client: &reqwest::Client,
        url: &str,
    ) -> Result<ServerEndpoint, String> {
        let init_params = serde_json::to_value(InitializeParams {
            protocol_version: PROTOCOL_VERSION.to_string(),
            capabilities: ClientCapabilities::default(),
            client_info: Implementation {
                name: "zen".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            },
        })
        .map_err(|e| format!("initialize: serialize failed: {}", e))?;
        let envelope = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": methods::INITIALIZE,
            "params": init_params,
        });

        let resp = Self::apply_mcp_headers(client.post(url), None)
            .json(&envelope)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| format!("initialize POST failed: {}", e))?;

        // Reject transport-level failures (401/5xx) BEFORE attempting to
        // parse JSON — otherwise an HTML error page bubbles up as a
        // confusing "bad JSON" message.
        let status = resp.status();
        if !status.is_success() {
            return Err(format!("initialize: server returned HTTP {}", status));
        }

        // Canonical source of the session id is the response header.
        // Body field is also accepted for stateless-on-header servers.
        let header_session = resp
            .headers()
            .get(HEADER_SESSION_ID)
            .and_then(|h| h.to_str().ok())
            .map(str::to_string);

        let json: serde_json::Value = resp
            .json::<serde_json::Value>()
            .await
            .map_err(|e| format!("initialize: bad JSON: {}", e))?;

        if let Some(err) = json.get("error") {
            let msg = err
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("unknown");
            return Err(format!("initialize: server error: {}", msg));
        }
        let init: InitializeResult = serde_json::from_value(
            json.get("result")
                .cloned()
                .ok_or_else(|| "initialize: missing result".to_string())?,
        )
        .map_err(|e| format!("initialize: deserialize failed: {}", e))?;

        if init.protocol_version != PROTOCOL_VERSION {
            // Forward-compat: MCP servers should pick a version they support
            // even if it's older than ours. We continue but log the mismatch so
            // an operator can spot a too-new server.
            warn!(
                server_protocol = %init.protocol_version,
                client_protocol = %PROTOCOL_VERSION,
                "initialize: server replied with different protocol version (continuing)"
            );
        }

        Ok(ServerEndpoint::Http(HttpEndpoint {
            url: url.to_string(),
            session_id: header_session.or(init.session_id),
            protocol_version: Some(init.protocol_version),
        }))
    }

    /// Send the spec-required `notifications/initialized` notification.
    /// Per JSON-RPC 2.0, notifications carry NO `id` field.
    async fn send_initialized_notification(
        client: &reqwest::Client,
        url: &str,
        endpoint: &HttpEndpoint,
    ) -> Result<(), String> {
        let body = initialized_notification();
        let resp = Self::apply_mcp_headers(client.post(url), Some(endpoint))
            .json(&body)
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await
            .map_err(|e| format!("notifications/initialized send failed: {}", e))?;
        if !resp.status().is_success() {
            return Err(format!(
                "notifications/initialized: server returned HTTP {}",
                resp.status()
            ));
        }
        Ok(())
    }

    /// Safety cap on `tools/list` pagination. The MCP spec leaves the
    /// upper bound on page count open (a server could chain indefinitely);
    /// 100 pages is well beyond any realistic catalog and prevents the
    /// runner from spinning forever against a buggy or hostile server.
    const MAX_TOOLS_LIST_PAGES: usize = 100;

    /// Fetch every tool an external MCP server exposes, looping on
    /// `nextCursor` until exhaustion. Returns the merged list of raw
    /// tool JSON values in stable, page-by-page order.
    ///
    /// Per the MCP 2025-06-18 spec, each `tools/list` request accepts
    /// `params.cursor` (string) and the response carries `nextCursor`
    /// only when more pages remain. We always send `params` (empty object
    /// on the first call) so we don't accidentally emit `"params": null`,
    /// and we tolerate the server returning `nextCursor: ""` (treated as
    /// terminal, not a further loop signal).
    async fn fetch_external_tools(
        client: &reqwest::Client,
        endpoint: &HttpEndpoint,
        tools_url: &str,
    ) -> Vec<serde_json::Value> {
        let mut all: Vec<serde_json::Value> = Vec::new();
        let mut cursor: Option<String> = None;
        let mut page: usize = 0;
        // JSON-RPC ids must be unique per in-flight request. We use a page
        // counter starting at 2 (after `initialize`'s id=1) to avoid id
        // collisions within the same handshake lifecycle for a single server.
        let mut next_id: u64 = 2;
        loop {
            page += 1;
            if page > Self::MAX_TOOLS_LIST_PAGES {
                warn!(
                    max_pages = Self::MAX_TOOLS_LIST_PAGES,
                    "fetch_external_tools: pagination cap reached, truncating tool list"
                );
                break;
            }
            // Build the request envelope. Always include `params` (object,
            // possibly empty) so the wire shape matches the spec exactly.
            let mut params_obj = Map::new();
            if let Some(c) = cursor.as_deref() {
                params_obj.insert("cursor".to_string(), Value::String(c.to_string()));
            }
            let envelope = serde_json::json!({
                "jsonrpc": "2.0",
                "id": next_id,
                "method": methods::TOOLS_LIST,
                "params": Value::Object(params_obj),
            });
            next_id += 1;

            let resp = match Self::apply_mcp_headers(client.post(tools_url), Some(endpoint))
                .json(&envelope)
                .timeout(std::time::Duration::from_secs(10))
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    warn!(
                        page = page,
                        "fetch_external_tools: tools/list request failed: {} (returning {} tools so far)",
                        e,
                        all.len()
                    );
                    return all;
                }
            };

            let status = resp.status();
            if !status.is_success() {
                warn!(
                    page = page,
                    "fetch_external_tools: tools/list HTTP {} (returning {} tools so far)",
                    status,
                    all.len()
                );
                return all;
            }

            let json: serde_json::Value = match resp.json().await {
                Ok(v) => v,
                Err(e) => {
                    warn!(
                        page = page,
                        "fetch_external_tools: tools/list bad JSON: {} (returning {} tools so far)",
                        e,
                        all.len()
                    );
                    return all;
                }
            };

            if let Some(err) = json.get("error") {
                let msg = err
                    .get("message")
                    .and_then(|m| m.as_str())
                    .unwrap_or("unknown");
                warn!(
                    page = page,
                    "fetch_external_tools: tools/list server error: {} (returning {} tools so far)",
                    msg,
                    all.len()
                );
                return all;
            }

            let Some(result) = json.get("result") else {
                warn!(
                    page = page,
                    "fetch_external_tools: tools/list missing result (returning {} tools so far)",
                    all.len()
                );
                return all;
            };
            match result["tools"].as_array() {
                Some(t) => all.extend(t.iter().cloned()),
                None => {
                    warn!(
                        page = page,
                        "fetch_external_tools: tools/list missing tools[] (returning {} tools so far)",
                        all.len()
                    );
                    return all;
                }
            }

            // Pagination: "nextCursor" is absent or empty string ⇒ terminal.
            // The spec defines `nextCursor` as opaque client-side; treat any
            // non-empty string as a continuation signal.
            match result.get("nextCursor").and_then(|v| v.as_str()) {
                Some(c) if !c.is_empty() => {
                    cursor = Some(c.to_string());
                    // Continue looping.
                }
                _ => break,
            }
        }
        all
    }

    /// Perform the spec-compliant `initialize` handshake over a stdio
    /// transport. Spawns the child process, sends `initialize`, parses
    /// the response, then sends `notifications/initialized`. Returns
    /// the `StdioEndpoint` (which owns the transport / child process).
    async fn initialize_stdio_server(
        command: &str,
        args: &[String],
    ) -> Result<StdioEndpoint, String> {
        let transport = StdioTransport::spawn(command, args).await?;

        let init_params = serde_json::to_value(InitializeParams {
            protocol_version: PROTOCOL_VERSION.to_string(),
            capabilities: ClientCapabilities::default(),
            client_info: Implementation {
                name: "zen".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            },
        })
        .map_err(|e| format!("stdio initialize: serialize failed: {}", e))?;

        // Step 1: initialize request
        let resp = transport
            .send_request(methods::INITIALIZE, Some(init_params))
            .await?;

        let init: InitializeResult = serde_json::from_value(
            resp.get("result")
                .cloned()
                .ok_or_else(|| "stdio initialize: missing result".to_string())?,
        )
        .map_err(|e| format!("stdio initialize: deserialize failed: {}", e))?;

        if init.protocol_version != PROTOCOL_VERSION {
            warn!(
                server_protocol = %init.protocol_version,
                client_protocol = %PROTOCOL_VERSION,
                "stdio initialize: server replied with different protocol version (continuing)"
            );
        }

        // Step 2: notifications/initialized (spec-mandatory)
        transport
            .send_notification(
                methods::NOTIFICATIONS_INITIALIZED,
                Some(serde_json::json!({})),
            )
            .await?;

        Ok(StdioEndpoint {
            transport,
            protocol_version: Some(init.protocol_version),
        })
    }

    /// Fetch every tool a stdio MCP server exposes, looping on
    /// `nextCursor` until exhaustion. Same pagination logic as the
    /// HTTP variant but routed through the stdio transport.
    async fn fetch_external_tools_stdio(
        endpoint: &StdioEndpoint,
    ) -> Vec<serde_json::Value> {
        let mut all: Vec<serde_json::Value> = Vec::new();
        let mut cursor: Option<String> = None;
        let mut page: usize = 0;
        loop {
            page += 1;
            if page > Self::MAX_TOOLS_LIST_PAGES {
                warn!(
                    max_pages = Self::MAX_TOOLS_LIST_PAGES,
                    "fetch_external_tools_stdio: pagination cap reached"
                );
                break;
            }
            let mut params_obj = Map::new();
            if let Some(c) = cursor.as_deref() {
                params_obj.insert("cursor".to_string(), Value::String(c.to_string()));
            }
            let resp = match endpoint
                .transport
                .send_request(methods::TOOLS_LIST, Some(Value::Object(params_obj)))
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    warn!(
                        page = page,
                        "fetch_external_tools_stdio: tools/list failed: {} (returning {} tools so far)",
                        e,
                        all.len()
                    );
                    return all;
                }
            };

            let Some(result) = resp.get("result") else {
                warn!(
                    page = page,
                    "fetch_external_tools_stdio: missing result (returning {} tools so far)",
                    all.len()
                );
                return all;
            };
            match result["tools"].as_array() {
                Some(t) => all.extend(t.iter().cloned()),
                None => {
                    warn!(
                        page = page,
                        "fetch_external_tools_stdio: missing tools[] (returning {} tools so far)",
                        all.len()
                    );
                    return all;
                }
            }

            match result.get("nextCursor").and_then(|v| v.as_str()) {
                Some(c) if !c.is_empty() => {
                    cursor = Some(c.to_string());
                }
                _ => break,
            }
        }
        all
    }

    /// Sync external servers from `.mcp.json` into the tool registry.
    /// Each external server's tools are registered as an
    /// `Arc<McpToolAdapter>` participating in the same v2 `Tool`
    /// registry as built-in tools. Failures for individual servers are
    /// logged but do not block. When `app` is `Some`, emits
    /// `mcp:server:status` events for each row the UI subscribes to
    /// so the typed settings UI can show a live per-row status pill;
    /// passing `None` (boot path) keeps the method event-free.
    ///
    /// Receives `&Arc<Self>` so adapters can hold a `Weak<McpClient>`
    /// back-reference to break the
    /// `McpClient → registry → adapter → McpClient` reference cycle.
    /// Call via `client.method()` where `client: Arc<McpClient>` —
    /// auto-ref to `&Arc<Self>` rules apply, so no caller change is
    /// required even though the receiver looks unusual.
    pub async fn sync_external_servers(self: &Arc<Self>, app: Option<&AppHandle>) {
        // Serialize concurrent resyncs so rapid UI clicks can't race
        // on the tool registry; subsequent callers wait for the
        // in-flight sync to finish before grabbing the lock.
        let _guard = self.sync_lock.lock().await;

        // Wipe any previously-registered `ext:*` adapters so a
        // re-sync can't leave stale entries behind if a row was
        // removed from `.mcp.json` between syncs. The prefix matches
        // `prefixed_external_tool_name` — used here as a literal so
        // we don't need a new shared constant.
        {
            let mut registry = self.tool_registry.write().await;
            let cleared = registry.remove_by_prefix("ext:");
            if cleared > 0 {
                info!(
                    cleared,
                    "sync_external_servers: cleared stale external adapters"
                );
                // Best-effort cleanup of session endpoints too;
                // any tool routes through `external_endpoints` so a
                // removed server name should also drop its session.
                if let Ok(mut endpoints) = self.external_endpoints.lock() {
                    // Clear all endpoints; the loop below re-inserts
                    // only the ones whose handshake succeeds, so
                    // there's no replacement ordering to worry about.
                    endpoints.clear();
                }
            }
        }
        let config = match self.mcp_config.read_config().await {
            Ok(c) => c,
            Err(e) => {
                info!(
                    "sync_external_servers: config read failed ({}), skipping",
                    e
                );
                return;
            }
        };
        let servers = match config["mcpServers"].as_object() {
            Some(s) => s,
            None => return,
        };
        if servers.is_empty() {
            return;
        }
        info!(
            "sync_external_servers: {} external servers found",
            servers.len()
        );

        for (server_name, server_cfg) in servers {
            // ── Transport detection ──
            // A server entry with a `url` field uses the Streamable HTTP
            // transport; an entry with a `command` field uses stdio.
            // Entries with neither are rejected as malformed.
            let (_endpoint, tools) = if let Some(url) = server_cfg["url"].as_str() {
                // ── Streamable HTTP transport ──
                info!(
                    "sync_external_servers: connecting to '{}' at {}",
                    server_name, url
                );
                Self::emit_server_status(app, server_name, "reconnecting", None);

                let client = reqwest::Client::new();

                // Step 1: initialize handshake
                let http_endpoint = match Self::initialize_server(&client, url).await {
                    Ok(ServerEndpoint::Http(h)) => h,
                    Ok(_) => unreachable!("initialize_server always returns Http variant"),
                    Err(e) => {
                        warn!(
                            "sync_external_servers: initialize for '{}' failed: {}",
                            server_name, e
                        );
                        Self::emit_server_status(app, server_name, "failed", Some(e.clone()));
                        continue;
                    }
                };
                info!(
                    server = %server_name,
                    session_id = http_endpoint.session_id.as_deref().unwrap_or("<stateless>"),
                    protocol = http_endpoint.protocol_version.as_deref().unwrap_or("?"),
                    "sync_external_servers: handshake complete"
                );

                // Step 2: notifications/initialized
                if let Err(e) =
                    Self::send_initialized_notification(&client, url, &http_endpoint).await
                {
                    warn!(
                        "sync_external_servers: '{}' notifications/initialized failed: {}",
                        server_name, e
                    );
                    Self::emit_server_status(app, server_name, "failed", Some(e.clone()));
                    continue;
                }

                // Step 3: persist endpoint for later dispatch
                {
                    let mut endpoints = self.external_endpoints.lock().unwrap();
                    endpoints.insert(
                        server_name.clone(),
                        ServerEndpoint::Http(http_endpoint.clone()),
                    );
                }

                // Step 4: tools/list (paginated)
                let tools_url = url.trim_end_matches('/').to_string() + "/tools/list";
                let tools = Self::fetch_external_tools(&client, &http_endpoint, &tools_url).await;

                (ServerEndpoint::Http(http_endpoint), tools)
            } else if let Some(command) = server_cfg["command"].as_str() {
                // ── stdio transport ──
                let args: Vec<String> = server_cfg["args"]
                    .as_array()
                    .map(|a| {
                        a.iter()
                            .filter_map(|v| v.as_str().map(str::to_string))
                            .collect()
                    })
                    .unwrap_or_default();

                info!(
                    "sync_external_servers: spawning '{}' ({} {})",
                    server_name, command, args.join(" ")
                );
                Self::emit_server_status(app, server_name, "reconnecting", None);

                // Steps 1+2: initialize + notifications/initialized
                let stdio_endpoint = match Self::initialize_stdio_server(command, &args).await {
                    Ok(s) => s,
                    Err(e) => {
                        warn!(
                            "sync_external_servers: stdio initialize for '{}' failed: {}",
                            server_name, e
                        );
                        Self::emit_server_status(app, server_name, "failed", Some(e.clone()));
                        continue;
                    }
                };
                info!(
                    server = %server_name,
                    protocol = stdio_endpoint.protocol_version.as_deref().unwrap_or("?"),
                    "sync_external_servers: stdio handshake complete"
                );

                // Step 3: persist endpoint for later dispatch
                {
                    let mut endpoints = self.external_endpoints.lock().unwrap();
                    endpoints.insert(
                        server_name.clone(),
                        ServerEndpoint::Stdio(stdio_endpoint.clone()),
                    );
                }

                // Step 4: tools/list (paginated)
                let tools = Self::fetch_external_tools_stdio(&stdio_endpoint).await;

                (ServerEndpoint::Stdio(stdio_endpoint), tools)
            } else {
                warn!(
                    "sync_external_servers: server '{}' has neither 'url' nor 'command', skipping",
                    server_name
                );
                Self::emit_server_status(
                    app,
                    server_name,
                    "failed",
                    Some("missing 'url' or 'command' field".to_string()),
                );
                continue;
            };

            if tools.is_empty() {
                // No tools to register (server returned 0 pages, or all pages
                // failed) — log and move on.
                Self::emit_server_status(
                    app,
                    server_name,
                    "connected",
                    Some("handshake ok, server advertised no tools".to_string()),
                );
                continue;
            }

            // Build the Weak<McpClient> back-reference once per server so
            // each adapter's `execute` can upgrade to a Strong ref for the
            // duration of the call without extending the client's lifetime.
            let mcp_weak = Arc::downgrade(self);

            let mut registry = self.tool_registry.write().await;
            for tool_json in tools {
                let name = tool_json["name"].as_str().unwrap_or("unknown").to_string();
                let description = tool_json["description"].as_str().unwrap_or("").to_string();
                let parameters = tool_json["input_schema"].clone();
                let output_schema = Some(tool_json["output_schema"].clone());

                let annotations: Option<crate::tools::ToolAnnotations> =
                    match serde_json::from_value(tool_json["annotations"].clone()) {
                        Ok(a) => Some(a),
                        Err(e) if tool_json.get("annotations").is_some() => {
                            warn!(
                                server = %server_name,
                                tool = %name,
                                error = %e,
                                "sync_external_servers: malformed annotations block, treating as no hints"
                            );
                            None
                        }
                        Err(_) => None,
                    };
                let risk_level = risk_level_from_annotations(annotations.as_ref());

                let adapter = crate::services::mcp_adapter::McpToolAdapter::new(
                    server_name.clone(),
                    name.clone(),
                    description,
                    parameters,
                    output_schema,
                    annotations,
                    risk_level,
                    mcp_weak.clone(),
                );
                registry.register(Arc::new(adapter));
                info!(
                    "sync_external_servers: registered {} as {:?} from '{}'",
                    prefixed_external_tool_name(server_name, &name),
                    risk_level,
                    server_name,
                );
            }
            // Fire after the per-tools loop so `server_name` is
            // still in scope; status is `connected` once
            // registration finishes.
            Self::emit_server_status(app, server_name, "connected", None);
        }
    }

    /// Best-effort emit helper for the typed settings UI. Logs and
    /// swallows all emit errors so a broken UI handler can never abort
    /// the sync. `status` values: `"reconnecting"` |
    /// `"connected"` | `"failed"`. `error` is only attached for the
    /// `failed` variant; the UI ignores it otherwise.
    fn emit_server_status(
        app: Option<&AppHandle>,
        name: &str,
        status: &str,
        error: Option<String>,
    ) {
        let Some(app) = app else {
            return;
        };
        let mut payload = serde_json::json!({
            "name": name,
            "status": status,
        });
        if let Some(e) = error {
            payload["error"] = serde_json::Value::String(e);
        }
        if let Err(e) = app.emit("mcp:server:status", payload) {
            warn!(
                server = %name,
                status = %status,
                "emit_server_status: app.emit failed: {} (UI may not show status update)",
                e
            );
        }
    }

    /// Call a tool on an external MCP server via HTTP POST.
    /// `server_name` and `tool_name` are passed as separate, un-prefixed
    /// strings — the caller (`McpToolAdapter::execute`) already splits
    /// them. There is no string parsing here; if the caller's contract
    /// breaks, this method just sends the wrong server/tool pair over
    /// the wire, which is a logical bug, not a panic.
    pub async fn call_external_tool(
        &self,
        server_name: &str,
        tool_name: &str,
        arguments: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        // Single critical section grabs the endpoint atomically — no
        // window where a concurrent re-sync leaves the map out of date.
        let endpoint = {
            let endpoints = self.external_endpoints.lock().unwrap();
            endpoints
                .get(server_name)
                .cloned()
                .ok_or_else(|| {
                    format!("No endpoint for external MCP server '{}'", server_name)
                })?
        };

        match endpoint {
            ServerEndpoint::Http(endpoint) => {
                let call_url =
                    format!("{}/tools/call", endpoint.url.trim_end_matches('/'));
                let body = serde_json::json!({
                    "jsonrpc": "2.0",
                    "method": methods::TOOLS_CALL,
                    "params": {
                        "name": tool_name,
                        "arguments": arguments,
                    },
                    "id": 1,
                });

                let client = reqwest::Client::new();
                let resp = Self::apply_mcp_headers(client.post(&call_url), Some(&endpoint))
                    .json(&body)
                    .timeout(std::time::Duration::from_secs(30))
                    .send()
                    .await
                    .map_err(|e| format!("External MCP call failed: {}", e))?;

                let result: serde_json::Value = resp
                    .json()
                    .await
                    .map_err(|e| format!("Bad JSON from external server: {}", e))?;

                if let Some(error) = result.get("error") {
                    let msg = error
                        .get("message")
                        .and_then(|m| m.as_str())
                        .unwrap_or("Unknown error");
                    return Err(format!("External tool error: {}", msg));
                }

                result
                    .get("result")
                    .cloned()
                    .ok_or_else(|| "External tool returned no result".to_string())
            }
            ServerEndpoint::Stdio(stdio_endpoint) => {
                // Route the tools/call through the stdio transport.
                // The transport owns the child process; we just send a
                // request and wait for the matching response.
                let params = serde_json::json!({
                    "name": tool_name,
                    "arguments": arguments,
                });
                let resp = stdio_endpoint
                    .transport
                    .send_request(methods::TOOLS_CALL, Some(params))
                    .await?;

                if let Some(error) = resp.get("error") {
                    let msg = error
                        .get("message")
                        .and_then(|m| m.as_str())
                        .unwrap_or("Unknown error");
                    return Err(format!("External tool error: {}", msg));
                }

                resp
                    .get("result")
                    .cloned()
                    .ok_or_else(|| "External tool returned no result".to_string())
            }
        }
    }
}
