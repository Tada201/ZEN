//! stdio-transport handshake and tool discovery for `McpClient`.
//!
//! Split out of `client.rs` to keep that file under the Rust size cap.
//! This is a child module of `mcp::client`, so it can reach the private
//! `StdioEndpoint` type and `McpClient::MAX_TOOLS_LIST_PAGES`; the two
//! methods stay associated functions on `McpClient` so call sites
//! (`Self::initialize_stdio_server` / `Self::fetch_external_tools_stdio`)
//! are unchanged.

use serde_json::{Map, Value};
use tracing::warn;

use crate::stdio::StdioTransport;
use crate::types::{
    methods, modern_request_meta, ClientCapabilities, Implementation, InitializeParams,
    InitializeResult, ServerCapabilities, MODERN_PROTOCOL_VERSION, PROTOCOL_VERSION,
};
use crate::discovery::McpCapabilitySummary;


use super::{McpClient, StdioEndpoint};

impl McpClient {
    /// Perform the spec-compliant `initialize` handshake over a stdio
    /// transport. Spawns the child process (with `env`, values pre-expanded
    /// by the caller, and `timeout`), sends `initialize`, parses the
    /// response, then sends `notifications/initialized`. Returns the
    /// `StdioEndpoint` (which owns the transport / child process).
    pub(super) async fn initialize_stdio_server(
        command: &str,
        args: &[String],
        env: &std::collections::BTreeMap<String, String>,
        timeout: std::time::Duration,
    ) -> Result<StdioEndpoint, String> {
        let transport = StdioTransport::spawn(command, args, env, timeout).await?;

        // Probe modern servers first. A method-not-found/invalid-request or
        // timeout is the compatibility signal for the legacy initialize path.
        let discovery_params = modern_request_meta();
        match transport
            .send_request(methods::DISCOVER, Some(discovery_params))
            .await
        {
            Ok(response) => {
                let result = response
                    .get("result")
                    .and_then(Value::as_object)
                    .ok_or_else(|| "stdio server/discover: missing result".to_string())?;
                let protocol_version = result
                    .get("protocolVersion")
                    .and_then(Value::as_str)
                    .unwrap_or(MODERN_PROTOCOL_VERSION)
                    .to_string();
                return Ok(StdioEndpoint {
                    transport,
                    protocol_version: Some(protocol_version),
                    modern: true,
                    capabilities: capability_summary_value(result.get("capabilities")),
                });
            }
            Err(error) if is_legacy_probe_error(&error) => {
                warn!(error = %error, "stdio server/discover unsupported; using legacy initialize");
            }
            Err(error) => return Err(format!("stdio server/discover failed: {}", error)),
        }

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
            modern: false,
            capabilities: capability_summary(&init.capabilities),
        })
    }

    /// Fetch every tool a stdio MCP server exposes, looping on
    /// `nextCursor` until exhaustion. Same pagination logic as the
    /// HTTP variant but routed through the stdio transport.
    pub(super) async fn fetch_external_tools_stdio(
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
            let mut params = Value::Object(params_obj);
            if endpoint.modern {
                if let Value::Object(ref mut object) = params {
                    if let Value::Object(meta) = modern_request_meta() {
                        for (key, value) in meta {
                            object.insert(key, value);
                        }
                    }
                }
            }
            let resp = match endpoint
                .transport
                .send_request(methods::TOOLS_LIST, Some(params))
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
}

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

fn is_legacy_probe_error(error: &str) -> bool {
    let lower = error.to_ascii_lowercase();
    lower.contains("method not found")
        || lower.contains("-32601")
        || lower.contains("invalid request")
        || lower.contains("-32600")
        || lower.contains("timeout")
}
