//! HTTP-transport (Streamable HTTP) handshake and tool discovery for
//! `McpClient`.
//!
//! Split out of `mod.rs` to keep that file under the Rust size cap. This is
//! a child module of `mcp::client`, so it reaches the private `HttpEndpoint`
//! / `ServerEndpoint` types and the parent's `http_body::read_rpc_response`;
//! the methods stay associated functions on `McpClient` so call sites
//! (`Self::discover_http_server`, `Self::fetch_external_tools`, …) are
//! unchanged.

use serde_json::{Map, Value};
use tracing::warn;

use crate::mcp::types::{
    initialized_notification, methods, modern_request_meta, ClientCapabilities, Implementation,
    InitializeParams, InitializeResult, ServerCapabilities, ACCEPT_JSON_OR_SSE, HEADER_METHOD,
    HEADER_NAME, HEADER_PROTOCOL_VERSION, HEADER_SESSION_ID, MODERN_PROTOCOL_VERSION,
    PROTOCOL_VERSION,
};
use crate::services::McpCapabilitySummary;

use super::http_body::read_rpc_response;
use super::{next_http_request_id, HttpEndpoint, McpClient, ServerEndpoint};

fn capability_summary(capabilities: &ServerCapabilities) -> McpCapabilitySummary {
    McpCapabilitySummary {
        tools: capabilities.tools.is_some(),
        resources: capabilities.resources.is_some(),
        prompts: capabilities.prompts.is_some(),
    }
}

fn capability_summary_value(value: Option<&Value>) -> McpCapabilitySummary {
    let Some(object) = value.and_then(Value::as_object) else {
        return McpCapabilitySummary::default();
    };
    McpCapabilitySummary {
        tools: object.contains_key("tools"),
        resources: object.contains_key("resources"),
        prompts: object.contains_key("prompts"),
    }
}

impl McpClient {
    /// Layer the spec-mandatory MCP headers onto a request builder.
    /// - `Accept: application/json, text/event-stream` is always set.
    /// - `MCP-Protocol-Version` is always set (negotiated version if we
    ///   have one from `initialize`, otherwise the client's preferred).
    /// - `Mcp-Session-Id` is only set when the server assigned one.
    /// - Any configured (env-expanded) custom headers are applied last so
    ///   an auth header from `.mcp.json` overrides nothing spec-mandatory
    ///   but is present for the server's own authorization.
    pub(super) fn apply_mcp_headers(
        builder: reqwest::RequestBuilder,
        endpoint: Option<&HttpEndpoint>,
        method: Option<&str>,
        name: Option<&str>,
    ) -> reqwest::RequestBuilder {
        let negotiated_version = endpoint
            .and_then(|e| e.protocol_version.as_deref())
            .unwrap_or(PROTOCOL_VERSION);
        let mut b = builder.header("Accept", ACCEPT_JSON_OR_SSE);
        b = b.header(HEADER_PROTOCOL_VERSION, negotiated_version);
        if let Some(sid) = endpoint.and_then(|e| e.session_id.as_ref()) {
            b = b.header(HEADER_SESSION_ID, sid);
        }
        if let Some(ep) = endpoint {
            if ep.modern {
                if let Some(value) = method {
                    b = b.header(HEADER_METHOD, value);
                }
                if let Some(value) = name {
                    b = b.header(HEADER_NAME, value);
                }
            }
            for (k, v) in &ep.headers {
                b = b.header(k, v);
            }
        }
        b
    }
    /// Probe the current protocol without creating a legacy session. A
    /// method-not-found/unsupported response is the explicit compatibility
    /// signal that permits the legacy initialize fallback.
    pub(super) async fn discover_http_server(
        client: &reqwest::Client,
        url: &str,
        headers: std::collections::BTreeMap<String, String>,
        timeout: std::time::Duration,
    ) -> Result<Option<ServerEndpoint>, String> {
        let endpoint = HttpEndpoint {
            url: url.to_string(),
            headers: headers.clone(),
            request_timeout: timeout,
            protocol_version: Some(MODERN_PROTOCOL_VERSION.to_string()),
            modern: true,
            ..Default::default()
        };
        let body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": next_http_request_id(),
            "method": methods::DISCOVER,
            "params": modern_request_meta(),
        });
        let response = match Self::apply_mcp_headers(
            client.post(url),
            Some(&endpoint),
            Some(methods::DISCOVER),
            Some("server"),
        )
        .json(&body)
        .timeout(timeout)
        .send()
        .await
        {
            Ok(response) => response,
            Err(error) if error.is_timeout() => return Ok(None),
            Err(error) => return Err(format!("server/discover request failed: {}", error)),
        };

        if matches!(response.status().as_u16(), 400 | 404 | 405 | 415) {
            return Ok(None);
        }
        if !response.status().is_success() {
            return Err(format!("server/discover: server returned HTTP {}", response.status()));
        }
        let json = read_rpc_response(response)
            .await
            .map_err(|error| format!("server/discover: {}", error))?;
        if let Some(error) = json.get("error") {
            let code = error.get("code").and_then(Value::as_i64).unwrap_or_default();
            if code == -32601 || code == -32600 {
                return Ok(None);
            }
            let message = error.get("message").and_then(Value::as_str).unwrap_or("unknown");
            return Err(format!("server/discover: server error: {}", message));
        }
        let result = json
            .get("result")
            .and_then(Value::as_object)
            .ok_or_else(|| "server/discover: missing result".to_string())?;
        let protocol_version = result
            .get("protocolVersion")
            .and_then(Value::as_str)
            .unwrap_or(MODERN_PROTOCOL_VERSION)
            .to_string();
        Ok(Some(ServerEndpoint::Http(HttpEndpoint {
            url: url.to_string(),
            session_id: None,
            protocol_version: Some(protocol_version),
            headers,
            request_timeout: timeout,
            modern: true,
            capabilities: capability_summary_value(result.get("capabilities")),
        })))
    }

    /// Perform the legacy `initialize` handshake against `url`.
    /// `headers` (env-expanded) and `timeout` come from the server config.
    /// Returns the per-server session state the server issued. Errors
    /// are surfaced as `Err(String)` so the caller can log and skip.
    pub(super) async fn initialize_server(
        client: &reqwest::Client,
        url: &str,
        headers: std::collections::BTreeMap<String, String>,
        timeout: std::time::Duration,
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
            "id": next_http_request_id(),
            "method": methods::INITIALIZE,
            "params": init_params,
        });

        // The handshake endpoint carries the configured headers so the
        // server can authorize the `initialize` call itself.
        let handshake_ep = HttpEndpoint {
            url: url.to_string(),
            headers: headers.clone(),
            request_timeout: timeout,
            modern: false,
            ..Default::default()
        };
        let resp = Self::apply_mcp_headers(client.post(url), Some(&handshake_ep), None, None)
            .json(&envelope)
            .timeout(timeout)
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

        let json: serde_json::Value = read_rpc_response(resp)
            .await
            .map_err(|e| format!("initialize: {}", e))?;

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
            headers,
            request_timeout: timeout,
            modern: false,
            capabilities: capability_summary(&init.capabilities),
        }))
    }

    /// Send the spec-required `notifications/initialized` notification.
    /// Per JSON-RPC 2.0, notifications carry NO `id` field.
    pub(super) async fn send_initialized_notification(
        client: &reqwest::Client,
        url: &str,
        endpoint: &HttpEndpoint,
    ) -> Result<(), String> {
        let body = initialized_notification();
        let resp = Self::apply_mcp_headers(
            client.post(url),
            Some(endpoint),
            Some(methods::NOTIFICATIONS_INITIALIZED),
            None,
        )
            .json(&body)
            .timeout(endpoint.request_timeout)
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
    pub(super) const MAX_TOOLS_LIST_PAGES: usize = 100;

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
    pub(super) async fn fetch_external_tools(
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
        let mut next_id: u64 = next_http_request_id();
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
            let mut envelope = serde_json::json!({
                "jsonrpc": "2.0",
                "id": next_id,
                "method": methods::TOOLS_LIST,
                "params": Value::Object(params_obj),
            });
            next_id = next_http_request_id();
            if endpoint.modern {
                if let Value::Object(ref mut params) = envelope["params"] {
                    if let Value::Object(meta) = modern_request_meta() {
                        for (key, value) in meta {
                            params.insert(key, value);
                        }
                    }
                }
            }

            let target_url = if endpoint.modern { &endpoint.url } else { tools_url };
            let resp = match Self::apply_mcp_headers(
                client.post(target_url),
                Some(endpoint),
                Some(methods::TOOLS_LIST),
                Some("tools"),
            )
                .json(&envelope)
                .timeout(endpoint.request_timeout)
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

            let json: serde_json::Value = match read_rpc_response(resp).await {
                Ok(v) => v,
                Err(e) => {
                    warn!(
                        page = page,
                        "fetch_external_tools: tools/list {} (returning {} tools so far)",
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
}

