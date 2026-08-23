//! `sync_external_servers` — the per-server connect/handshake/registration
//! loop for `McpClient`.
//!
//! Split out of `mod.rs` to keep that file under the Rust size cap. This is
//! a child module of `mcp::client`, so it reaches the private `McpClient`
//! fields, the `ServerEndpoint` type, and the parent's free helpers
//! (`build_pending_consent`, `endpoint_*`, `risk_level_from_annotations`,
//! `prefixed_external_tool_name`, `validate_mcp_endpoint_url`). The method
//! stays associated on `McpClient` so `client.sync_external_servers(...)`
//! call sites are unchanged.

use std::sync::Arc;


use tracing::{info, warn};

use crate::config::McpConfigService;
use crate::consent::McpConsentStore;
use crate::discovery::McpDiscoveryService;
use zen_security::service::PermissionDecision;
use zen_security::url_safety::build_pinned_http_client;

use super::{
    build_pending_consent, endpoint_capabilities, endpoint_protocol_version,
    prefixed_external_tool_name, risk_level_from_annotations, validate_mcp_endpoint_url, McpClient,
    ServerEndpoint,
};

impl McpClient {
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
    pub async fn sync_external_servers(self: &Arc<Self>, ui: Option<&crate::ui::UiBridge>) {
        // Serialize concurrent resyncs so rapid UI clicks can't race
        // on the tool registry; subsequent callers wait for the
        // in-flight sync to finish before grabbing the lock.
        let _guard = self.sync_lock.lock().await;
        if let Err(error) = self.discovery.refresh().await {
            warn!(error = %error, "sync_external_servers: inventory refresh failed");
        }

        // Wipe any previously-registered `ext:*` adapters so a re-sync can't leave stale entries behind if a row was removed from `.mcp.json` between syncs. The prefix matches
        // `prefixed_external_tool_name` — used here as a literal so
        // we don't need a new shared constant.
        {
            let cleared = self.registrar.clear_external().await;
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
                // Drop every cached resource/prompt list too — a resync means
                // any private-scope entry's owning session is being rebuilt.
                if let Ok(mut cache) = self.feature_cache.lock() {
                    cache.clear();
                }
            }
        }
        let servers = match self.mcp_config.merged_servers().await {
            Ok(s) => s,
            Err(e) => {
                info!(
                    "sync_external_servers: config read failed ({}), skipping",
                    e
                );
                return;
            }
        };
        if servers.is_empty() {
            return;
        }
        info!(
            "sync_external_servers: {} external servers found",
            servers.len()
        );

        for (server_name, server_cfg) in &servers {
            let Some(server_object) = server_cfg.as_object() else {
                let error = "MCP server entry is not an object".to_string();
                self.discovery.mark_failed(server_name, &error).await;
                self.emit_server_status(ui, server_name, "failed", Some(error));
                continue;
            };
            if let Err(error) = McpConfigService::validate_entry(server_name, server_object) {
                let message = error.to_string();
                self.audit_mcp_connection(
                    server_name,
                    PermissionDecision::Deny,
                    format!("MCP configuration rejected: {}", McpDiscoveryService::error_code(&message)),
                )
                .await;
                self.discovery.mark_failed(server_name, &message).await;
                self.emit_server_status(ui, server_name, "failed", Some(message));
                continue;
            }

            // Skip disabled rows: their tools stay unregistered but the
            // config is preserved on disk for a later re-enable.
            if server_cfg
                .get("disabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
            {
                info!("sync_external_servers: '{}' is disabled, skipping", server_name);
                self.discovery.mark_disabled(server_name).await;
                self.consent.clear_pending(server_name).await;
                self.emit_server_status(ui, server_name, "disabled", None);
                continue;
            }

            // ── Human-in-the-loop connection consent gate ──
            // Fingerprint the connection-relevant config and refuse to spawn /
            // connect unless the user has approved exactly this fingerprint.
            // Un-grandfathered: a never-approved server (including one saved
            // before this gate existed) is held in AwaitingConsent until the
            // settings UI approves it. Any command/url/args/header-key/env-key
            // change re-triggers consent.
            let fingerprint = McpConsentStore::fingerprint(server_cfg);
            if !self.consent.is_approved(server_name, &fingerprint).await {
                let pending = build_pending_consent(server_name, server_cfg, fingerprint);
                self.consent.record_pending(pending).await;
                self.audit_mcp_connection(
                    server_name,
                    PermissionDecision::Ask,
                    "MCP server awaiting human connection consent",
                )
                .await;
                self.discovery.mark_awaiting_consent(server_name).await;
                self.emit_server_status(ui, server_name, "awaiting_consent", None);
                continue;
            }
            self.consent.clear_pending(server_name).await;

            // Per-server request timeout (default 30s).
            let timeout = server_cfg
                .get("timeout_ms")
                .and_then(|v| v.as_u64())
                .map(std::time::Duration::from_millis)
                .unwrap_or_else(|| std::time::Duration::from_secs(30));

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
                self.discovery.mark_connecting(server_name).await;
                self.emit_server_status(ui, server_name, "reconnecting", None);

                // Configured HTTP headers, env-expanded at connect time so
                // `${env:TOKEN}` never has to be persisted literally.
                let mut headers =
                    Self::expand_str_map(server_cfg.get("headers"), self.secrets.as_ref()).await;
                // Layer in a stored OAuth token (keyring-backed) as the
                // Authorization header unless the operator already set one
                // explicitly in `.mcp.json`. Expired tokens are skipped so the
                // handshake surfaces a 401 that triggers re-authorization
                // rather than sending a stale credential.
                if !headers.contains_key("Authorization") {
                    if let Ok(Some(token)) =
                        crate::oauth::load_token(self.secrets.as_ref(), server_name).await
                    {
                        if !token.is_expired(60) {
                            headers.insert(
                                "Authorization".to_string(),
                                token.authorization_header(),
                            );
                        }
                    }
                }
                let parsed_url = match validate_mcp_endpoint_url(url) {
                    Ok(parsed) => parsed,
                    Err(error) => {
                        self.audit_mcp_connection(
                            server_name,
                            PermissionDecision::Deny,
                            format!("MCP endpoint rejected by URL policy: {}", McpDiscoveryService::error_code(&error)),
                        )
                        .await;
                        self.discovery.mark_failed(server_name, &error).await;
                        self.emit_server_status(ui, server_name, "failed", Some(error));
                        continue;
                    }
                };
                let client = match build_pinned_http_client(&parsed_url, timeout).await {
                    Ok(client) => client,
                    Err(error) => {
                        self.audit_mcp_connection(
                            server_name,
                            PermissionDecision::Deny,
                            format!("MCP endpoint rejected by DNS/network policy: {}", McpDiscoveryService::error_code(&error)),
                        )
                        .await;
                        self.discovery.mark_failed(server_name, &error).await;
                        self.emit_server_status(ui, server_name, "failed", Some(error));
                        continue;
                    }
                };

                // Step 1: probe the current protocol. Only an explicit
                // unsupported-method response permits the legacy fallback.
                let http_endpoint = match Self::discover_http_server(
                    &client,
                    url,
                    headers.clone(),
                    timeout,
                )
                .await
                {
                    Ok(Some(ServerEndpoint::Http(endpoint))) => endpoint,
                    Ok(Some(_)) => unreachable!("HTTP discovery returns an HTTP endpoint"),
                    Ok(None) => match Self::initialize_server(&client, url, headers, timeout).await {
                        Ok(ServerEndpoint::Http(endpoint)) => endpoint,
                        Ok(_) => unreachable!("legacy HTTP initialize returns HTTP endpoint"),
                        Err(error) => {
                            warn!(
                                "sync_external_servers: legacy initialize for '{}' failed: {}",
                                server_name, error
                            );
                            self.discovery.mark_failed(server_name, &error).await;
                            self.emit_server_status(ui, server_name, "failed", Some(error));
                            continue;
                        }
                    },
                    Err(error) => {
                        warn!(
                            "sync_external_servers: protocol discovery for '{}' failed: {}",
                            server_name, error
                        );
                        self.discovery.mark_failed(server_name, &error).await;
                        self.emit_server_status(ui, server_name, "failed", Some(error));
                        continue;
                    }
                };
                self.audit_mcp_connection(
                    server_name,
                    PermissionDecision::Allow,
                    "MCP endpoint passed URL, DNS, redirect, and header policy",
                )
                .await;
                info!(
                    server = %server_name,
                    protocol = http_endpoint.protocol_version.as_deref().unwrap_or("?"),
                    era = if http_endpoint.modern { "modern_2026" } else { "legacy_2025" },
                    "sync_external_servers: protocol negotiation complete"
                );

                // Step 2: only legacy servers receive the old notification.
                if !http_endpoint.modern {
                    if let Err(error) =
                        Self::send_initialized_notification(&client, url, &http_endpoint).await
                    {
                        warn!(
                            "sync_external_servers: '{}' notifications/initialized failed: {}",
                            server_name, error
                        );
                        self.discovery.mark_failed(server_name, &error).await;
                        self.emit_server_status(ui, server_name, "failed", Some(error));
                        continue;
                    }
                }

                // Step 3: persist endpoint for later dispatch
                {
                    let mut endpoints = self.external_endpoints.lock().unwrap();
                    endpoints.insert(
                        server_name.clone(),
                        ServerEndpoint::Http(http_endpoint.clone()),
                    );
                }

                // Step 4: tools/list (paginated). Streamable HTTP sends every
                // JSON-RPC message to the single MCP endpoint URL for both
                // protocol eras — there is no per-method subpath. Pass the base
                // URL so legacy servers hit `/mcp`, not a bogus
                // `/mcp/tools/list` (which real servers 404).
                let tools = Self::fetch_external_tools(&client, &http_endpoint, url).await;

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

                // stdio `env`, env-expanded so `${env:VAR}` references
                // resolve from the host at spawn time (never persisted).
                let env = Self::expand_str_map(server_cfg.get("env"), self.secrets.as_ref()).await;

                info!(
                    "sync_external_servers: spawning '{}' ({} {})",
                    server_name, command, args.join(" ")
                );
                self.discovery.mark_connecting(server_name).await;
                self.emit_server_status(ui, server_name, "reconnecting", None);

                // Steps 1+2: initialize + notifications/initialized
                let stdio_endpoint =
                    match Self::initialize_stdio_server(command, &args, &env, timeout).await {
                        Ok(s) => s,
                        Err(e) => {
                            warn!(
                                "sync_external_servers: stdio initialize for '{}' failed: {}",
                                server_name, e
                            );
                            self.discovery.mark_failed(server_name, &e).await;
                            self.emit_server_status(ui, server_name, "failed", Some(e.clone()));
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

                // Subscribe to this server's list-change notifications. The
                // transport hands over its notification receiver exactly once;
                // the listener ends when the child dies (channel closes) or the
                // next resync rebuilds the transport, so it never accumulates.
                if let Some(notifications) = stdio_endpoint.transport.take_notifications().await {
                    self.spawn_stdio_subscription(
                        server_name.clone(),
                        notifications,
                        ui.map(|b| std::sync::Arc::new(b.clone())),
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
                self.discovery
                    .mark_failed(server_name, "missing 'url' or 'command' field")
                    .await;
                self.emit_server_status(
                    ui,
                    server_name,
                    "failed",
                    Some("missing 'url' or 'command' field".to_string()),
                );
                continue;
            };

            if tools.is_empty() {
                // No tools to register (server returned 0 pages, or all pages
                // failed) — log and move on.
                self.discovery
                    .mark_ready(
                        server_name,
                        endpoint_protocol_version(&_endpoint),
                        0,
                        endpoint_capabilities(&_endpoint),
                    )
                    .await;
                self.emit_server_status(
                    ui,
                    server_name,
                    "connected",
                    Some("handshake ok, server advertised no tools".to_string()),
                );
                continue;
            }

            let mut registered = 0usize;
            let mut seen_names: std::collections::HashSet<String> = std::collections::HashSet::new();
            for tool_json in tools {
                let name = tool_json["name"].as_str().unwrap_or("unknown").to_string();

                // Idempotent within a server: a server that advertises the
                // same tool name twice would otherwise register two adapters
                // racing on the same `ext:{server}:{name}` key. Keep the first.
                if !seen_names.insert(name.clone()) {
                    warn!(
                        server = %server_name,
                        tool = %name,
                        "sync_external_servers: duplicate tool name from server, skipping"
                    );
                    continue;
                }

                let description = tool_json["description"].as_str().unwrap_or("").to_string();
                let parameters = tool_json
                    .get("inputSchema")
                    .or_else(|| tool_json.get("input_schema"))
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!({"type": "object"}));
                let output_schema = tool_json
                    .get("outputSchema")
                    .or_else(|| tool_json.get("output_schema"))
                    .filter(|value| !value.is_null())
                    .cloned();

                // Untrusted descriptor validation (Phase 4): a malformed input
                // or output schema, or an unsafe `x-mcp-header` extension, drops
                // just this tool — the rest of the server's tools still register.
                if let Err(error) = crate::tool_schema::validate_tool_schema("inputSchema", &parameters)
                    .and_then(|_| match &output_schema {
                        Some(schema) => crate::tool_schema::validate_tool_schema("outputSchema", schema),
                        None => Ok(()),
                    })
                    .and_then(|_| crate::tool_schema::tool_header_extension_is_safe(&tool_json))
                {
                    warn!(
                        server = %server_name,
                        tool = %name,
                        error = %error,
                        "sync_external_servers: rejected tool with malformed schema or unsafe header"
                    );
                    continue;
                }

                let annotations: Option<zen_tools::ToolAnnotations> =
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
                let annotations = crate::tool_schema::fold_title(&tool_json, annotations);
                let risk_level = risk_level_from_annotations(annotations.as_ref());

                // Phase 8 construction inversion: the adapter type lives in
                // the host crate (it implements `Tool<AppHandle>`), so the
                // client hands a validated spec to the registrar port and
                // the app wraps it. The `Weak<McpClient>` back-reference is
                // owned by the registrar impl, preserving the old cycle
                // break.
                self.registrar
                    .register_external(crate::registrar::ExternalToolSpec {
                        server_name: server_name.clone(),
                        tool_name: name.clone(),
                        description,
                        parameters,
                        output_schema,
                        annotations,
                        risk_level,
                    })
                    .await;
                registered += 1;
                info!(
                    "sync_external_servers: registered {} as {:?} from '{}'",
                    prefixed_external_tool_name(server_name, &name),
                    risk_level,
                    server_name,
                );
            }
            // Fire after the per-tools loop so `server_name` is
            // still in scope; status is `connected` once
            // registration finishes. `tool_count` reflects tools actually
            // registered, not the raw advertised count, so a server whose
            // tools were all rejected reads as ready-with-zero.
            let tool_count = registered;
            self.discovery
                .mark_ready(
                    server_name,
                    endpoint_protocol_version(&_endpoint),
                    tool_count,
                    endpoint_capabilities(&_endpoint),
                )
                .await;
            self.emit_server_status(ui, server_name, "connected", None);
        }
    }
}
