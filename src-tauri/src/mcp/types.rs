/// MCP (Model Context Protocol) Types — JSON-RPC 2.0 subset used by the client.
///
/// Only the types needed for making JSON-RPC calls to external MCP servers
/// are kept. Server-only types (resources, prompts, capabilities, etc.) removed.
use serde::{Deserialize, Serialize};
use serde_json::Value;

// ─── MCP Protocol Constants ──────────────────────────────────────────────

/// MCP protocol version this client speaks. The server replies with its
/// own version; if it advertises an unsupported one, the client logs a
/// warning but continues (forward-compatible per spec: servers must pick
/// a version they support).
///
/// Per https://modelcontextprotocol.io/, `2025-06-18` is widely supported
/// by official reference SDKs.
pub const PROTOCOL_VERSION: &str = "2025-06-18";
/// Current-protocol probe/version. Legacy servers are retained behind the
/// compatibility fallback until the transport path is fully modernized.
pub const MODERN_PROTOCOL_VERSION: &str = "2026-07-28";

/// HTTP header the client sets on every MCP request so the server knows
/// it accepts both `application/json` and `text/event-stream` responses.
pub const HEADER_PROTOCOL_VERSION: &str = "MCP-Protocol-Version";

/// HTTP header carrying the session id assigned by the server during
/// `initialize`. Required on every request after the handshake completes.
pub const HEADER_SESSION_ID: &str = "Mcp-Session-Id";
pub const HEADER_METHOD: &str = "Mcp-Method";
pub const HEADER_NAME: &str = "Mcp-Name";

/// Required `Accept` value per the Streamable HTTP transport spec.
pub const ACCEPT_JSON_OR_SSE: &str = "application/json, text/event-stream";

// ─── JSON-RPC 2.0 Base Types ───

/// JSON-RPC 2.0 request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<Value>,
}

impl JsonRpcRequest {
    pub fn new(method: impl Into<String>, params: Option<Value>, id: Option<Value>) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            method: method.into(),
            params,
            id,
        }
    }
}

/// JSON-RPC 2.0 response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<Value>,
}

impl JsonRpcResponse {
    pub fn success(result: Value, id: Option<Value>) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            result: Some(result),
            error: None,
            id,
        }
    }
    pub fn failure(error: JsonRpcError, id: Option<Value>) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            result: None,
            error: Some(error),
            id,
        }
    }
}

/// JSON-RPC 2.0 error
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

impl JsonRpcError {
    pub fn new(code: i32, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            data: None,
        }
    }
    pub fn parse_error(message: impl Into<String>) -> Self {
        Self::new(-32700, message)
    }
    pub fn invalid_request(message: impl Into<String>) -> Self {
        Self::new(-32600, message)
    }
    pub fn method_not_found(method: impl Into<String>) -> Self {
        Self::new(-32601, format!("Method not found: {}", method.into()))
    }
    pub fn invalid_params(message: impl Into<String>) -> Self {
        Self::new(-32602, message)
    }
    pub fn internal_error(message: impl Into<String>) -> Self {
        Self::new(-32603, message)
    }
}

// ─── MCP Lifecycle Types ────────────────────────────────────────────────

/// Identifies the speaking party in the MCP handshake (client or server).
/// Mirrors the MCP spec `Implementation` schema exactly.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Implementation {
    pub name: String,
    pub version: String,
}

/// Optional capabilities advertised by the client. The spec allows any
/// combination of nested objects; we keep this enum-free so callers can
/// pass `{}` for "no capabilities" without ceremony.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ClientCapabilities {
    /// Empty struct fields are skipped by serde so default `{}` is sent.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub experimental: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sampling: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub roots: Option<Value>,
}

/// `params` payload for the `initialize` request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitializeParams {
    #[serde(rename = "protocolVersion")]
    pub protocol_version: String,
    pub capabilities: ClientCapabilities,
    #[serde(rename = "clientInfo")]
    pub client_info: Implementation,
}

/// Server-advertised capabilities. We only care about the `tools` key —
/// if absent, the server has no tools and the client should skip it.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ServerCapabilities {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tools: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub resources: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub prompts: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub experimental: Option<Value>,
}

/// Successful `initialize` response. All fields are spec-required except
/// `session_id` (Mcp-Session-Id header is the canonical source).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitializeResult {
    #[serde(rename = "protocolVersion")]
    pub protocol_version: String,
    pub capabilities: ServerCapabilities,
    #[serde(rename = "serverInfo", skip_serializing_if = "Option::is_none", default)]
    pub server_info: Option<Implementation>,
    /// Optional; canonical source is the `Mcp-Session-Id` response header.
    #[serde(rename = "sessionId", skip_serializing_if = "Option::is_none", default)]
    pub session_id: Option<String>,
}

// ─── Method Name Constants (subset used by client) ───

pub mod methods {
    pub const DISCOVER: &str = "server/discover";
    pub const INITIALIZE: &str = "initialize";
    pub const NOTIFICATIONS_INITIALIZED: &str = "notifications/initialized";
    pub const TOOLS_LIST: &str = "tools/list";
    pub const TOOLS_CALL: &str = "tools/call";
    pub const RESOURCES_LIST: &str = "resources/list";
    pub const RESOURCES_READ: &str = "resources/read";
    pub const RESOURCES_TEMPLATES_LIST: &str = "resources/templates/list";
    pub const PROMPTS_LIST: &str = "prompts/list";
    pub const PROMPTS_GET: &str = "prompts/get";

    // Server → client notifications (list-change + resource subscription).
    pub const NOTIFICATIONS_TOOLS_LIST_CHANGED: &str = "notifications/tools/list_changed";
    pub const NOTIFICATIONS_RESOURCES_LIST_CHANGED: &str = "notifications/resources/list_changed";
    pub const NOTIFICATIONS_PROMPTS_LIST_CHANGED: &str = "notifications/prompts/list_changed";
    pub const NOTIFICATIONS_RESOURCES_UPDATED: &str = "notifications/resources/updated";
}

/// Builds a JSON-RPC notification (no `id`). MCP uses notifications for
/// one-way signals like the post-handshake `notifications/initialized`.
/// Per JSON-RPC 2.0, the absence of `id` makes the message a notification.
/// Per MCP spec strict validators, the `params` field must be omitted when
/// empty (NOT serialised as `null`). We conditionally include it.
pub fn notification(method: impl Into<String>, params: Option<Value>) -> Value {
    let mut map = serde_json::Map::new();
    map.insert("jsonrpc".to_string(), Value::String("2.0".to_string()));
    map.insert("method".to_string(), Value::String(method.into()));
    if let Some(p) = params {
        map.insert("params".to_string(), p);
    }
    Value::Object(map)
}

/// Sentinel payload for the `notifications/initialized` notification.
/// The MCP spec says params SHOULD be empty — we send `{}` so pre-handshake
/// ledger consumers can branch on field presence without crashing.
/// Per-request metadata used by the current protocol era. Server-provided
/// values are never merged into this object; it is client-owned only.
pub fn modern_request_meta() -> Value {
    serde_json::json!({
        "_meta": {
            "io.modelcontextprotocol/protocolVersion": MODERN_PROTOCOL_VERSION,
            "io.modelcontextprotocol/clientInfo": {
                "name": "zen",
                "version": env!("CARGO_PKG_VERSION"),
            },
            "io.modelcontextprotocol/clientCapabilities": {},
        }
    })
}

pub fn initialized_notification() -> Value {
    notification(methods::NOTIFICATIONS_INITIALIZED, Some(serde_json::json!({})))
}
