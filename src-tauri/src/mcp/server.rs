use serde_json::{json, Value};
/// MCP (Model Context Protocol) Server
///
/// Implements an MCP server that exposes ZEN agent tools to external clients.
/// Supports:
/// - JSON-RPC 2.0 protocol
/// - Tool registration and discovery
/// - Tool execution with result formatting
/// - stdio and HTTP transport layers
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, error, info};
use uuid::Uuid;

use crate::mcp::http;
use crate::mcp::stdio;
use crate::mcp::types::*;
use crate::services::ToolService;
use crate::tools::ToolRegistry;

/// MCP Server configuration
#[derive(Debug, Clone)]
pub struct McpServerConfig {
    pub server_name: String,
    pub server_version: String,
    pub stdio_enabled: bool,
    pub http_enabled: bool,
    pub http_bind_host: String,
    pub http_port: u16,
    pub http_auth_token: String,
    pub http_window_started_at: Instant,
    pub http_window_requests: u32,
}

impl Default for McpServerConfig {
    fn default() -> Self {
        Self {
            server_name: "zen-mcp".to_string(),
            server_version: env!("CARGO_PKG_VERSION").to_string(),
            stdio_enabled: false,
            http_enabled: true,
            http_bind_host: "127.0.0.1".to_string(),
            http_port: 8989,
            http_auth_token: Uuid::new_v4().to_string(),
            http_window_started_at: Instant::now(),
            http_window_requests: 0,
        }
    }
}

/// MCP Server state
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum McpServerState {
    Stopped,
    Starting,
    Running,
    Stopping,
}

/// MCP Server instance
pub struct McpServer {
    config: McpServerConfig,
    state: McpServerState,
    tool_registry: Arc<RwLock<ToolRegistry>>,
    initialized: bool,
    event_tx: broadcast::Sender<McpEvent>,
    app_handle: Option<tauri::AppHandle>,
    tool_service: Option<Arc<ToolService>>,
    http_task: Option<tokio::task::JoinHandle<()>>,
    http_shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
    stdio_task: Option<tokio::task::JoinHandle<()>>,
}

/// MCP Server events
#[derive(Debug, Clone)]
pub enum McpEvent {
    ServerStarted,
    ServerStopped,
    ClientConnected { client_id: String },
    ClientDisconnected { client_id: String },
    ToolCalled { tool_name: String, success: bool },
    ToolRegistered { tool_name: String },
}

impl McpServer {
    /// Create a new MCP server instance
    pub fn new(
        config: McpServerConfig,
        tool_registry: Arc<RwLock<ToolRegistry>>,
        app_handle: Option<tauri::AppHandle>,
    ) -> Self {
        let (event_tx, _) = broadcast::channel(256);

        Self {
            config,
            state: McpServerState::Stopped,
            tool_registry,
            initialized: false,
            event_tx,
            app_handle,
            tool_service: None,
            http_task: None,
            http_shutdown_tx: None,
            stdio_task: None,
        }
    }

    /// Set or update the live AppHandle
    pub fn set_app_handle(&mut self, app_handle: tauri::AppHandle) {
        self.app_handle = Some(app_handle);
    }

    /// Set or update the canonical app tool service.
    pub fn set_tool_service(&mut self, tool_service: Arc<ToolService>) {
        self.tool_service = Some(tool_service);
    }

    /// Start the MCP server.
    ///
    /// Binds transport listeners BEFORE transitioning state to `Running` so that
    /// a failed bind never reports the server as healthy.  If any bind fails the
    /// state stays `Stopped` and an error is returned immediately.
    pub async fn start(&mut self, server_arc: Arc<RwLock<McpServer>>) -> Result<(), McpError> {
        if self.state == McpServerState::Running {
            return Err(McpError::AlreadyRunning);
        }
        if self.app_handle.is_none() {
            return Err(McpError::Transport(
                "MCP server requires a live AppHandle before startup".to_string(),
            ));
        }
        if self.tool_service.is_none() {
            return Err(McpError::Transport(
                "MCP server requires ToolService before startup".to_string(),
            ));
        }
        if self.config.http_enabled && !is_loopback_host(&self.config.http_bind_host) {
            return Err(McpError::Transport(format!(
                "MCP HTTP remote bind '{}' is disabled; use localhost, 127.0.0.1, or ::1",
                self.config.http_bind_host
            )));
        }

        info!(
            "Starting MCP server v{} on {}:{}",
            self.config.server_version, self.config.http_bind_host, self.config.http_port
        );

        // Pre-bind the TCP listener so we only go to Running after bind succeeds.
        let http_listener = if self.config.http_enabled {
            let addr = format!("{}:{}", self.config.http_bind_host, self.config.http_port)
                .parse::<std::net::SocketAddr>()
                .map_err(|e| McpError::Transport(format!("Invalid MCP HTTP bind address: {e}")))?;
            match tokio::net::TcpListener::bind(addr).await {
                Ok(l) => Some(l),
                Err(e) => {
                    error!("MCP HTTP bind failed on {}: {}", addr, e);
                    return Err(McpError::Io(e));
                }
            }
        } else {
            None
        };

        self.state = McpServerState::Running;
        self.initialized = true;

        // Start HTTP server with the pre-bound listener
        if let Some(listener) = http_listener {
            let (tx, rx) = tokio::sync::oneshot::channel::<()>();
            self.http_shutdown_tx = Some(tx);

            let server_clone = server_arc.clone();

            let handle = tokio::spawn(async move {
                if let Err(e) = http::start_http_server(server_clone.clone(), listener, rx).await {
                    error!("MCP HTTP server error: {}", e);
                    let mut s = server_clone.write().await;
                    if s.state == McpServerState::Running {
                        s.state = McpServerState::Stopped;
                        s.initialized = false;
                    }
                }
            });
            self.http_task = Some(handle);

            info!(
                "MCP HTTP server started on {}:{}",
                self.config.http_bind_host, self.config.http_port
            );
        }

        // Start stdio server if enabled
        if self.config.stdio_enabled {
            let server_clone = server_arc.clone();

            let handle = tokio::spawn(async move {
                if let Err(e) = stdio::run_stdio_server(server_clone).await {
                    error!("MCP stdio server error: {}", e);
                }
            });
            self.stdio_task = Some(handle);

            info!("MCP stdio server started");
        }

        let _ = self.event_tx.send(McpEvent::ServerStarted);
        info!("MCP server started successfully");

        Ok(())
    }

    /// Stop the MCP server
    pub async fn stop(&mut self) -> Result<(), McpError> {
        if self.state != McpServerState::Running {
            return Ok(());
        }

        info!("Stopping MCP server...");
        self.state = McpServerState::Stopping;

        // Trigger axum HTTP server shutdown
        if let Some(tx) = self.http_shutdown_tx.take() {
            let _ = tx.send(());
        }

        // Await HTTP task graceful shutdown
        if let Some(handle) = self.http_task.take() {
            let _ = handle.await;
        }

        // Abort and await stdio task
        if let Some(handle) = self.stdio_task.take() {
            handle.abort();
            let _ = handle.await;
        }

        self.state = McpServerState::Stopped;
        self.initialized = false;

        let _ = self.event_tx.send(McpEvent::ServerStopped);
        info!("MCP server stopped");

        Ok(())
    }

    /// Clone server for transport layer (stripped-down version for spawning)
    pub fn clone_for_stdio(&self) -> McpServer {
        McpServer {
            config: self.config.clone(),
            state: self.state,
            tool_registry: self.tool_registry.clone(),
            initialized: self.initialized,
            event_tx: self.event_tx.clone(),
            app_handle: self.app_handle.clone(),
            tool_service: self.tool_service.clone(),
            http_task: None,
            http_shutdown_tx: None,
            stdio_task: None,
        }
    }

    /// Get server state
    pub fn state(&self) -> McpServerState {
        self.state
    }

    /// Check if server is running
    pub fn is_running(&self) -> bool {
        self.state == McpServerState::Running
    }

    /// Get server info
    pub fn get_info(&self) -> Value {
        json!({
            "name": self.config.server_name,
            "version": self.config.server_version,
            "state": match self.state {
                McpServerState::Stopped => "stopped",
                McpServerState::Starting => "starting",
                McpServerState::Running => "running",
                McpServerState::Stopping => "stopping",
            },
            "initialized": self.initialized,
            "stdio_enabled": self.config.stdio_enabled,
            "http_enabled": self.config.http_enabled,
            "http_bind_host": self.config.http_bind_host,
            "http_port": self.config.http_port,
            "http_auth_required": true,
        })
    }

    pub fn http_auth_token(&self) -> &str {
        &self.config.http_auth_token
    }

    pub fn check_http_rate_limit(&mut self) -> bool {
        const MAX_REQUESTS_PER_MINUTE: u32 = 60;
        if self.config.http_window_started_at.elapsed() >= Duration::from_secs(60) {
            self.config.http_window_started_at = Instant::now();
            self.config.http_window_requests = 0;
        }
        if self.config.http_window_requests >= MAX_REQUESTS_PER_MINUTE {
            return false;
        }
        self.config.http_window_requests += 1;
        true
    }

    /// Subscribe to server events
    pub fn subscribe(&self) -> broadcast::Receiver<McpEvent> {
        self.event_tx.subscribe()
    }

    /// Handle incoming JSON-RPC request
    pub async fn handle_request(&self, request: JsonRpcRequest) -> JsonRpcResponse {
        debug!("Handling MCP request: {}", request.method);

        match request.method.as_str() {
            methods::PING => self.handle_ping(request.id),
            methods::INITIALIZE => self.handle_initialize(request.params, request.id),
            methods::TOOLS_LIST => self.handle_tools_list(request.id).await,
            methods::TOOLS_CALL => self.handle_tools_call(request.params, request.id).await,
            _ => JsonRpcResponse::failure(
                JsonRpcError::method_not_found(&request.method),
                request.id,
            ),
        }
    }

    /// Handle ping request
    fn handle_ping(&self, id: Option<Value>) -> JsonRpcResponse {
        JsonRpcResponse::success(
            json!({
                "status": "ok",
                "server": self.config.server_name,
                "version": self.config.server_version,
            }),
            id,
        )
    }

    /// Handle initialize request
    fn handle_initialize(&self, params: Option<Value>, id: Option<Value>) -> JsonRpcResponse {
        // Parse initialize params (optional validation)
        if let Some(params_value) = params {
            if let Ok(init_params) = serde_json::from_value::<McpInitializeParams>(params_value) {
                info!(
                    "MCP client connected: {} v{}",
                    init_params.client_info.name, init_params.client_info.version
                );
                debug!("Client protocol version: {}", init_params.protocol_version);
            }
        }

        let result = McpInitializeResult {
            protocol_version: MCP_VERSION.to_string(),
            capabilities: McpServerCapabilities {
                tools: Some(McpToolsCapability { list_changed: true }),
                resources: None,
                prompts: None,
            },
            server_info: McpServerInfo {
                name: self.config.server_name.clone(),
                version: self.config.server_version.clone(),
            },
        };

        match serde_json::to_value(result) {
            Ok(val) => JsonRpcResponse::success(val, id),
            Err(e) => {
                let err = JsonRpcError::internal_error(format!(
                    "Failed to serialize initialize result: {}",
                    e
                ));
                JsonRpcResponse::failure(err, id)
            }
        }
    }

    /// Handle tools/list request
    async fn handle_tools_list(&self, id: Option<Value>) -> JsonRpcResponse {
        let tool_registry = self.tool_registry.read().await;
        let tools = tool_registry.list_direct_definitions();

        let mcp_tools: Vec<McpToolDefinition> = tools
            .into_iter()
            .map(|tool| McpToolDefinition {
                name: tool.name,
                description: Some(tool.description),
                input_schema: tool.parameters,
            })
            .collect();

        let result = McpToolsListResult { tools: mcp_tools };

        JsonRpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Handle tools/call request
    async fn handle_tools_call(&self, params: Option<Value>, id: Option<Value>) -> JsonRpcResponse {
        let params: McpToolCallParams = match params {
            Some(p) => match serde_json::from_value(p) {
                Ok(p) => p,
                Err(e) => {
                    return JsonRpcResponse::failure(
                        JsonRpcError::invalid_params(format!("Invalid params: {}", e)),
                        id,
                    )
                }
            },
            None => {
                return JsonRpcResponse::failure(JsonRpcError::invalid_params("Missing params"), id)
            }
        };

        let tool_name = params.name.clone();
        if self.tool_registry.read().await.get(&tool_name).is_none() {
            return JsonRpcResponse::failure(
                JsonRpcError::invalid_params(format!("Tool not found: {}", tool_name)),
                id,
            );
        }

        let tool_call = crate::tools::ToolCall {
            id: Uuid::new_v4().to_string(),
            name: tool_name.clone(),
            arguments: params.arguments.clone(),
        };

        let (output_text, is_error) = if let Some(app) = &self.app_handle {
            if let Some(tool_service) = &self.tool_service {
                match tool_service
                    .execute_non_interactive(
                        app.clone(),
                        "mcp_server",
                        "mcp-call".to_string(),
                        tool_call,
                    )
                    .await
                {
                    Ok(output) => {
                        let text = serde_json::to_string(&output).unwrap_or_else(|e| {
                            format!("Serialization of tool output failed: {}", e)
                        });
                        (text, false)
                    }
                    Err(e) => (format!("Error executing tool: {}", e), true),
                }
            } else {
                (
                    "Error: ToolService not configured for MCP server".to_string(),
                    true,
                )
            }
        } else {
            (
                "Error: AppHandle not available in MCP server".to_string(),
                true,
            )
        };

        // Execute the tool
        let result = McpToolCallResult {
            content: vec![McpContentBlock::text(output_text)],
            is_error: Some(is_error),
        };

        let _ = self.event_tx.send(McpEvent::ToolCalled {
            tool_name: tool_name.clone(),
            success: !is_error,
        });

        JsonRpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }
}

fn is_loopback_host(host: &str) -> bool {
    matches!(
        host.trim().to_ascii_lowercase().as_str(),
        "localhost" | "127.0.0.1" | "::1"
    )
}

#[cfg(test)]
mod tests {
    use super::is_loopback_host;

    #[test]
    fn loopback_host_policy_allows_only_local_addresses() {
        assert!(is_loopback_host("localhost"));
        assert!(is_loopback_host("127.0.0.1"));
        assert!(is_loopback_host("::1"));
        assert!(!is_loopback_host("0.0.0.0"));
        assert!(!is_loopback_host("192.168.1.10"));
    }
}

/// MCP Error types
#[derive(Debug, thiserror::Error)]
pub enum McpError {
    #[error("Server is already running")]
    AlreadyRunning,

    #[error("Server is not running")]
    NotRunning,

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Transport error: {0}")]
    Transport(String),
}
