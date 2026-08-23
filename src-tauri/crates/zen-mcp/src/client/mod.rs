//! MCP Client — connects to external MCP servers configured via `.mcp.json`.
//!
//! Reads the workspace `.mcp.json`, performs the spec-compliant
//! `initialize` + `notifications/initialized` handshake with each server,
//! then discovers `tools/list` from each one and registers the tools with
//! the `ext:{server}:{name}` prefix. Proxies `tools/call` requests,
//! echoing the server-assigned `Mcp-Session-Id` on every request.

use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use tracing::warn;

use zen_core::SecretStore;
use zen_security::risk::RiskLevel;
use zen_security::service::{AuditEvent, PermissionDecision, PrivilegedOperation, SecurityService};
use zen_security::url_safety::validate_public_http_url;

use crate::config::McpConfigService;
use crate::consent::{McpConsentStore, PendingConsent};
use crate::discovery::McpCapabilitySummary;
use crate::discovery::McpDiscoveryService;


use super::stdio::StdioTransport;
use super::types::methods;

/// stdio-transport handshake + tool discovery, split out to keep this
/// file under the Rust size cap. Adds `initialize_stdio_server` and
/// `fetch_external_tools_stdio` as `McpClient` associated functions.
mod stdio_helpers;

/// Streamable-HTTP body decoding (`application/json` or SSE-framed
/// `text/event-stream`), split out for the same reason.
mod http_body;

/// HTTP-transport handshake + tool discovery (`apply_mcp_headers`,
/// `discover_http_server`, `initialize_server`,
/// `send_initialized_notification`, `fetch_external_tools`), split out to
/// keep this file under the Rust size cap. Adds them as `McpClient`
/// associated functions so call sites are unchanged.
mod http_handshake;

/// Per-server connect/handshake/registration loop (`sync_external_servers`),
/// split out to keep this file under the Rust size cap.
mod sync;

/// Generic method dispatch (`request_endpoint`) + bounded freshness cache for
/// the non-tool features, split out to keep this file under the size cap.
mod rpc;

/// Resource/prompt discovery + read (`list_resources`, `read_resource`,
/// `list_resource_templates`, `list_prompts`, `get_prompt`), split out for the
/// same reason. Public methods on `McpClient`.
mod features;

/// Server→client list-change subscription listener (`spawn_stdio_subscription`),
/// split out for the same reason.
mod subscriptions;

/// Multi Round-Trip Requests loop (`request_with_mrtr`) + the elicitation
/// await store, split out for the same reason. The command layer resolves a
/// pending elicitation through `resolve_elicitation`.
pub mod elicit;

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

fn validate_mcp_endpoint_url(raw_url: &str) -> Result<url::Url, String> {
    let parsed = validate_public_http_url(raw_url)?;
    // Remote MCP must use TLS. An operator may explicitly opt into insecure
    // public HTTP for a local development fixture, but the opt-in is never
    // inferred from the URL or supplied by the model.
    if parsed.scheme() == "http"
        && std::env::var("ZEN_MCP_ALLOW_INSECURE_HTTP").as_deref() != Ok("1")
    {
        return Err("remote MCP HTTP requires HTTPS (set ZEN_MCP_ALLOW_INSECURE_HTTP=1 only for development)".to_string());
    }
    Ok(parsed)
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
    ann: Option<&zen_tools::ToolAnnotations>,
) -> zen_security::risk::RiskLevel {

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
    /// Protocol version selected by discovery or legacy initialize.
    protocol_version: Option<String>,
    /// True when `server/discover` succeeded without a legacy handshake.
    modern: bool,
    capabilities: McpCapabilitySummary,
    /// Configured HTTP headers (env-expanded) applied to every request —
    /// the auth channel for HTTP servers (e.g. `Authorization`).
    headers: std::collections::BTreeMap<String, String>,
    /// Per-server request timeout (from config, default 30s).
    request_timeout: std::time::Duration,
}

/// stdio-based endpoint state (child process transport). Owns the
/// `StdioTransport` which in turn owns the child process with
/// `kill_on_drop(true)` — dropping this endpoint terminates the child.
#[derive(Clone)]
struct StdioEndpoint {
    transport: Arc<StdioTransport>,
    protocol_version: Option<String>,
    modern: bool,
    capabilities: McpCapabilitySummary,
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

static HTTP_REQUEST_ID: AtomicU64 = AtomicU64::new(1);

fn next_http_request_id() -> u64 {
    HTTP_REQUEST_ID.fetch_add(1, Ordering::Relaxed)
}

/// Map an MCP `tools/call` result into ZEN's success/error contract.
///
/// The JSON-RPC `error` object is a *protocol* failure and is handled by the
/// caller. This handles the *tool-level* failure the MCP spec defines: a
/// successful JSON-RPC response whose `result.isError == true` means the tool
/// ran but reported an error, and its `content` blocks carry the error
/// message meant for the model. Returning that payload as `Ok` would let the
/// runner record a failed tool as a success; instead we surface it as `Err`
/// with the text extracted from the content blocks so it flows through the
/// same failure path as a transport error.
fn map_tool_call_result(payload: Value) -> Result<Value, String> {
    let is_error = payload
        .get("isError")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !is_error {
        return Ok(payload);
    }
    let message = payload
        .get("content")
        .and_then(Value::as_array)
        .map(|blocks| {
            blocks
                .iter()
                .filter_map(|block| block.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .filter(|text| !text.is_empty())
        .unwrap_or_else(|| "tool reported an error".to_string());
    Err(format!("External tool error: {}", message))
}

/// Build the credential-free pending-consent description for a server the
/// gate is currently blocking. Header/env *values* are never included — only
/// their key names — so the UI can show what the server will be handed
/// without exposing `${env:}`/`${secret:}` references.
fn build_pending_consent(name: &str, cfg: &Value, fingerprint: String) -> PendingConsent {
    let obj = cfg.as_object();
    let is_http = obj
        .and_then(|o| o.get("type"))
        .and_then(Value::as_str)
        .is_some_and(|t| t == "http")
        || obj.is_some_and(|o| o.contains_key("url"));
    let (transport, origin, args) = if is_http {
        let url = obj
            .and_then(|o| o.get("url"))
            .and_then(Value::as_str)
            .unwrap_or("");
        // Show only the origin, never the full path/query which can carry
        // opaque routing tokens.
        let origin = url::Url::parse(url)
            .ok()
            .and_then(|parsed| parsed.host_str().map(|host| {
                match parsed.port() {
                    Some(port) => format!("{}://{}:{}", parsed.scheme(), host, port),
                    None => format!("{}://{}", parsed.scheme(), host),
                }
            }))
            .unwrap_or_else(|| "(invalid url)".to_string());
        ("http".to_string(), origin, Vec::new())
    } else {
        let command = obj
            .and_then(|o| o.get("command"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let args: Vec<String> = obj
            .and_then(|o| o.get("args"))
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(Value::as_str).map(str::to_string).collect())
            .unwrap_or_default();
        ("stdio".to_string(), command, args)
    };
    let mut credential_keys: Vec<String> = Vec::new();
    for field in ["headers", "env"] {
        if let Some(map) = obj.and_then(|o| o.get(field)).and_then(Value::as_object) {
            credential_keys.extend(map.keys().cloned());
        }
    }
    credential_keys.sort();
    let scope = obj
        .and_then(|o| o.get("__scope"))
        .and_then(Value::as_str)
        .unwrap_or("workspace")
        .to_string();
    PendingConsent {
        name: name.to_string(),
        scope,
        transport,
        origin,
        args,
        credential_keys,
        fingerprint,
    }
}

fn endpoint_protocol_version(endpoint: &ServerEndpoint) -> Option<&str> {
    match endpoint {
        ServerEndpoint::Http(value) => value.protocol_version.as_deref(),
        ServerEndpoint::Stdio(value) => value.protocol_version.as_deref(),
    }
}

fn endpoint_capabilities(endpoint: &ServerEndpoint) -> McpCapabilitySummary {
    match endpoint {
        ServerEndpoint::Http(value) => value.capabilities.clone(),
        ServerEndpoint::Stdio(value) => value.capabilities.clone(),
    }
}

/// Client for connecting to external MCP servers.
pub struct McpClient {
    registrar: Arc<dyn crate::registrar::ExternalToolRegistrar>,
    mcp_config: Arc<McpConfigService>,
    discovery: Arc<McpDiscoveryService>,
    /// Central security/audit boundary for remote connection attempts. Tool
    /// execution remains gated by ToolService; this field covers the network
    /// connection itself and keeps unsafe endpoints out of the transport.
    security: Arc<SecurityService>,
    secrets: Arc<dyn SecretStore>,
    /// Human-in-the-loop connection consent gate. A server with no matching
    /// approved fingerprint is held in `AwaitingConsent` and never spawned or
    /// contacted until the user approves it in settings.
    consent: Arc<McpConsentStore>,
    /// Per-server endpoint state (URL + session id + negotiated protocol
    /// version). Populated by `sync_external_servers()` after a successful
    /// `initialize` + `notifications/initialized` handshake.
    external_endpoints: std::sync::Mutex<HashMap<String, ServerEndpoint>>,
    /// Serializes concurrent calls to `sync_external_servers`. Rapid
    /// UI `add_server` clicks queue rather than racing on the
    /// registry, and stale `ext:*` adapters are guaranteed to be
    /// cleared exactly once before the new set is registered.
    sync_lock: Arc<Mutex<()>>,
    /// Bounded in-memory freshness cache for `resources/list` / `prompts/list`
    /// results keyed by `{server}\0{method}`. Only populated when a server
    /// returns a positive `ttlMs`; entries expire on their TTL and are dropped
    /// wholesale for a server on teardown/resync/list-change. Never persisted.
    feature_cache: std::sync::Mutex<HashMap<String, rpc::CacheEntry>>,
    /// In-flight MRTR elicitations awaiting a user decision, keyed by a
    /// client-generated id echoed back by `mcp_resolve_elicitation`. Each value
    /// holds the one-shot sender the transport loop is blocked on plus the emit
    /// payload, so a freshly-mounted or reloaded UI can replay what's pending.
    /// Never persisted; dropped on resolve, timeout, or cancel.
    elicitations: std::sync::Mutex<HashMap<String, elicit::PendingElicit>>,
}

impl McpClient {
    pub fn new(
        registrar: Arc<dyn crate::registrar::ExternalToolRegistrar>,
        mcp_config: Arc<McpConfigService>,
        discovery: Arc<McpDiscoveryService>,
        security: Arc<SecurityService>,
        secrets: Arc<dyn SecretStore>,
        consent: Arc<McpConsentStore>,
    ) -> Self {
        Self {
            registrar,
            mcp_config,
            discovery,
            security,
            secrets,
            consent,
            external_endpoints: std::sync::Mutex::new(HashMap::new()),
            sync_lock: Arc::new(Mutex::new(())),
            feature_cache: std::sync::Mutex::new(HashMap::new()),
            elicitations: std::sync::Mutex::new(HashMap::new()),
        }
    }

    /// Read-only handle to the consent gate for the command layer
    /// (`mcp_list_pending` / `mcp_approve_server` / `mcp_deny_server`).
    pub fn consent(&self) -> &Arc<McpConsentStore> {
        &self.consent
    }

    // The HTTP handshake helpers (`apply_mcp_headers`, `discover_http_server`,
    // `initialize_server`, `send_initialized_notification`,
    // `fetch_external_tools`) live in the `http_handshake` child module, and
    // `initialize_stdio_server` / `fetch_external_tools_stdio` live in
    // `stdio_helpers`, to keep this file under the size cap; all remain
    // associated functions so call sites are unchanged.

    /// Expand a `.mcp.json` string→string map (e.g. `env` / `headers`),
    /// resolving `${env:VAR}` / `$VAR` references from the host at
    /// connect time. Non-string values are skipped. Missing/non-object
    /// input yields an empty map.
    async fn expand_str_map(
        value: Option<&Value>,
        secrets: &dyn SecretStore,
    ) -> std::collections::BTreeMap<String, String> {
        let mut expanded = std::collections::BTreeMap::new();
        if let Some(map) = value.and_then(|v| v.as_object()) {
            for (key, value) in map {
                if let Some(raw) = value.as_str() {
                    let env_expanded = super::env::expand_env_refs(raw);
                    let resolved = super::env::expand_secret_refs(&env_expanded, secrets).await;
                    expanded.insert(key.clone(), resolved);
                }
            }
        }
        expanded
    }

    async fn audit_mcp_connection(
        &self,
        server_name: &str,
        decision: PermissionDecision,
        reason: impl Into<String>,
    ) {
        self.security
            .record_audit(AuditEvent {
                operation: PrivilegedOperation::NetworkFetch,
                decision,
                caller: "mcp_client".to_string(),
                target: Some(format!("mcp_server:{}", server_name)),
                reason: Some(reason.into()),
            })
            .await;
    }


    /// Best-effort emit helper for the typed settings UI. Logs and
    /// swallows all emit errors so a broken UI handler can never abort
    /// the sync. `status` values: `"reconnecting"` |
    /// `"connected"` | `"failed"`. `error` is only attached for the
    /// `failed` variant; the UI ignores it otherwise.
    fn emit_server_status(
        &self,
        ui: Option<&crate::ui::UiBridge>,
        name: &str,
        status: &str,
        error: Option<String>,
    ) {
        let Some(ui) = ui else {
            return;
        };
        let mut payload = serde_json::json!({
            "name": name,
            "status": status,
        });
        if let Some(e) = error {
            payload["error"] = serde_json::Value::String(
                McpDiscoveryService::error_code(&e),
            );
        }
        if let Err(e) = ui.sink.emit_result("mcp:server:status", &payload) {
            warn!(
                server = %name,
                status = %status,
                "emit_server_status: sink emit failed: {} (UI may not show status update)",
                e
            );
        }
        let discovery = self.discovery.clone();
        let sink = ui.sink.clone();
        tokio::spawn(async move {
            let inventory = discovery.snapshot().await;
            let inventory = serde_json::to_value(&inventory).unwrap_or_default();
            if let Err(error) = sink.emit_result("mcp:inventory", &inventory) {
                warn!("emit_server_status: inventory event failed: {}", error);
            }
        });
    }

    /// Call a tool on an external MCP server.
    /// `server_name` and `tool_name` are passed as separate, un-prefixed
    /// strings — the caller (`McpToolAdapter::execute`) already splits
    /// them. There is no string parsing here.
    ///
    /// `cancel` cooperatively aborts an in-flight call. `app`, when present,
    /// lets the client satisfy a modern server's MRTR `InputRequiredResult` by
    /// prompting the user (elicitation); without it an input-required result
    /// fails closed. A JSON-RPC `error` or a `result.isError == true` tool
    /// result both surface as `Err` so the runner records the tool as failed
    /// rather than feeding a spurious success payload back to the model.
    pub async fn call_external_tool(
        &self,
        ui: Option<&crate::ui::UiBridge>,
        server_name: &str,
        tool_name: &str,
        arguments: serde_json::Value,
        cancel: Option<CancellationToken>,
    ) -> Result<serde_json::Value, String> {
        let base_params = serde_json::json!({
            "name": tool_name,
            "arguments": arguments,
        });
        let payload = self
            .request_with_mrtr(
                ui,
                server_name,
                methods::TOOLS_CALL,
                base_params,
                cancel.as_ref(),
                Some(tool_name),
            )
            .await?;
        map_tool_call_result(payload)
    }
}

#[cfg(test)]
mod tests {
    use super::{validate_mcp_endpoint_url, McpClient, ServerEndpoint};
    use std::collections::BTreeMap;
    use std::time::Duration;
    use wiremock::matchers::{body_string_contains, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[test]
    fn endpoint_policy_requires_tls_and_rejects_private_ips() {
        assert!(validate_mcp_endpoint_url("http://8.8.8.8/mcp").is_err());
        assert!(validate_mcp_endpoint_url("https://127.0.0.1:8443/mcp").is_err());
        assert!(validate_mcp_endpoint_url("https://[::ffff:169.254.169.254]/mcp").is_err());
    }

    #[tokio::test]
    async fn modern_http_uses_one_endpoint_for_discovery_and_tools() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/mcp"))
            .and(body_string_contains("server/discover"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "result": {
                    "protocolVersion": "2026-07-28",
                    "capabilities": { "tools": {}, "resources": {}, "prompts": {} }
                }
            })))
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .and(path("/mcp"))
            .and(body_string_contains("tools/list"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "jsonrpc": "2.0",
                "id": 2,
                "result": {
                    "tools": [{
                        "name": "echo",
                        "description": "Echo",
                        "inputSchema": { "type": "object" }
                    }]
                }
            })))
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let endpoint = McpClient::discover_http_server(
            &client,
            &format!("{}/mcp", server.uri()),
            BTreeMap::new(),
            Duration::from_secs(5),
        )
        .await
        .expect("modern probe")
        .expect("modern server");
        assert!(matches!(endpoint, ServerEndpoint::Http(ref value) if value.modern));

        let endpoint = match endpoint {
            ServerEndpoint::Http(value) => value,
            ServerEndpoint::Stdio(_) => unreachable!(),
        };
        let tools = McpClient::fetch_external_tools(
            &client,
            &endpoint,
            "http://127.0.0.1:9/tools/list",
        )
        .await;
        assert_eq!(tools[0]["inputSchema"]["type"], "object");
    }

    #[tokio::test]
    async fn unsupported_modern_probe_returns_legacy_fallback_signal() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/mcp"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "error": { "code": -32601, "message": "Method not found" }
            })))
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let probe = McpClient::discover_http_server(
            &client,
            &format!("{}/mcp", server.uri()),
            BTreeMap::new(),
            Duration::from_secs(5),
        )
        .await
        .expect("probe response");
        assert!(probe.is_none());
    }
}
