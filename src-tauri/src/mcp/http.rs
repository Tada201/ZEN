/// MCP HTTP Transport Layer
///
/// Implements JSON-RPC 2.0 over HTTP/WebSocket.
/// This allows remote MCP clients to connect to the ZEN MCP server.
///
/// ## Endpoints
/// - POST /mcp - JSON-RPC requests
/// - GET /mcp/health - Health check
/// - WS /mcp/ws - WebSocket for bidirectional communication
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Json,
    routing::{get, post},
    Router,
};
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info};

use crate::mcp::server::McpServer;
use crate::mcp::types::{JsonRpcRequest, JsonRpcResponse};

/// Application state for HTTP server
#[derive(Clone)]
pub struct HttpState {
    pub mcp_server: Arc<RwLock<McpServer>>,
}

/// Create the HTTP router for MCP endpoints
pub fn create_mcp_router(state: HttpState) -> Router {
    Router::new()
        .route("/mcp", post(handle_mcp_request))
        .route("/mcp/health", get(health_check))
        .route("/mcp/status", get(server_status))
        .with_state(state)
}

/// Handle POST /mcp - JSON-RPC request
async fn handle_mcp_request(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(request): Json<JsonRpcRequest>,
) -> Json<JsonRpcResponse> {
    debug!("Received HTTP MCP request: {}", request.method);

    let mut server = state.mcp_server.write().await;
    let provided_token = headers
        .get("x-zen-mcp-token")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");

    if provided_token != server.http_auth_token() {
        return Json(JsonRpcResponse::failure(
            crate::mcp::types::JsonRpcError::invalid_params("Missing or invalid MCP auth token"),
            request.id,
        ));
    }

    if !server.check_http_rate_limit() {
        return Json(JsonRpcResponse::failure(
            crate::mcp::types::JsonRpcError::internal_error("MCP rate limit exceeded"),
            request.id,
        ));
    }

    let response = server.handle_request(request).await;

    Json(response)
}

/// Handle GET /mcp/health - Health check endpoint
async fn health_check(State(state): State<HttpState>) -> Result<Json<Value>, StatusCode> {
    let server = state.mcp_server.read().await;

    if server.is_running() {
        Ok(Json(json!({
            "status": "healthy",
            "server": server.get_info(),
        })))
    } else {
        Err(StatusCode::SERVICE_UNAVAILABLE)
    }
}

/// Handle GET /mcp/status - Detailed server status
async fn server_status(State(state): State<HttpState>) -> Json<Value> {
    let server = state.mcp_server.read().await;

    Json(json!({
        "running": server.is_running(),
        "info": server.get_info(),
    }))
}

/// Start the HTTP MCP server with a pre-bound listener.
/// The caller must bind the listener first so that the server
/// state is only set to Running once binding succeeds.
pub async fn start_http_server(
    mcp_server: Arc<RwLock<McpServer>>,
    listener: tokio::net::TcpListener,
    shutdown_rx: tokio::sync::oneshot::Receiver<()>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let state = HttpState { mcp_server };
    let app = create_mcp_router(state);

    info!(
        "MCP HTTP server listening on http://{}",
        listener.local_addr()?
    );

    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            let _ = shutdown_rx.await;
        })
        .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_health_check() {
        // This would require a running server instance
        // Placeholder for future integration tests
    }

    #[test]
    fn test_parse_json_rpc_request() {
        let json = r#"{"jsonrpc":"2.0","method":"tools/list","id":1}"#;
        let request: Result<JsonRpcRequest, _> = serde_json::from_str(json);
        assert!(request.is_ok());
    }
}
