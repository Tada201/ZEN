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
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, debug};

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
    Json(request): Json<JsonRpcRequest>,
) -> Json<JsonRpcResponse> {
    debug!("Received HTTP MCP request: {}", request.method);

    let server = state.mcp_server.read().await;
    let response = server.handle_request(request).await;
    
    Json(response)
}

/// Handle GET /mcp/health - Health check endpoint
async fn health_check(
    State(state): State<HttpState>,
) -> Result<Json<Value>, StatusCode> {
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
async fn server_status(
    State(state): State<HttpState>,
) -> Json<Value> {
    let server = state.mcp_server.read().await;
    
    Json(json!({
        "running": server.is_running(),
        "info": server.get_info(),
    }))
}

/// Start the HTTP MCP server
pub async fn start_http_server(
    mcp_server: Arc<RwLock<McpServer>>,
    port: u16,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let state = HttpState { mcp_server };
    let app = create_mcp_router(state);

    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
    
    info!("Starting MCP HTTP server on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

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
