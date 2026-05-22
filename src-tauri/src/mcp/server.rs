/// MCP (Model Context Protocol) Server
///
/// Implements an MCP server that exposes ZEN agent tools to external clients.
/// Supports:
/// - JSON-RPC 2.0 protocol
/// - Tool registration and discovery
/// - Tool execution with result formatting
/// - stdio and HTTP transport layers

use std::sync::Arc;
use tokio::sync::{RwLock, broadcast};
use serde_json::{json, Value};
use tracing::{info, debug, error};
use uuid::Uuid;

use crate::mcp::types::*;
use crate::tools::ToolRegistry;
use crate::mcp::stdio;
use crate::mcp::http;

/// MCP Server configuration
#[derive(Debug, Clone)]
pub struct McpServerConfig {
    pub server_name: String,
    pub server_version: String,
    pub stdio_enabled: bool,
    pub http_enabled: bool,
    pub http_port: u16,
}

impl Default for McpServerConfig {
    fn default() -> Self {
        Self {
            server_name: "zen-mcp".to_string(),
            server_version: env!("CARGO_PKG_VERSION").to_string(),
            stdio_enabled: false,
            http_enabled: true,
            http_port: 8989,
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
        app_handle: Option<tauri::AppHandle>
    ) -> Self {
        let (event_tx, _) = broadcast::channel(256);
        
        Self {
            config,
            state: McpServerState::Stopped,
            tool_registry,
            initialized: false,
            event_tx,
            app_handle,
        }
    }

    /// Start the MCP server
    pub async fn start(&mut self) -> Result<(), McpError> {
        if self.state == McpServerState::Running {
            return Err(McpError::AlreadyRunning);
        }

        info!("Starting MCP server v{} on port {}",
              self.config.server_version, self.config.http_port);

        self.state = McpServerState::Starting;

        // Start HTTP server if enabled
        if self.config.http_enabled {
            let server_clone = Arc::new(RwLock::new(self.clone_for_stdio()));
            let port = self.config.http_port;

            tokio::spawn(async move {
                if let Err(e) = http::start_http_server(server_clone, port).await {
                    error!("MCP HTTP server error: {}", e);
                }
            });

            info!("MCP HTTP server started on port {}", port);
        }

        // Start stdio server if enabled
        if self.config.stdio_enabled {
            let server_clone = self.clone_for_stdio();

            tokio::spawn(async move {
                if let Err(e) = stdio::run_stdio_server(&server_clone).await {
                    error!("MCP stdio server error: {}", e);
                }
            });

            info!("MCP stdio server started");
        }

        self.state = McpServerState::Running;
        self.initialized = true;

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

        // Note: HTTP and stdio servers run in spawned tasks
        // They will stop when the server state changes

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
            "http_port": self.config.http_port,
        })
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
        JsonRpcResponse::success(json!({
            "status": "ok",
            "server": self.config.server_name,
            "version": self.config.server_version,
        }), id)
    }

    /// Handle initialize request
    fn handle_initialize(&self, params: Option<Value>, id: Option<Value>) -> JsonRpcResponse {
        // Parse initialize params (optional validation)
        if let Some(params_value) = params {
            if let Ok(init_params) = serde_json::from_value::<McpInitializeParams>(params_value) {
                info!("MCP client connected: {} v{}", 
                      init_params.client_info.name, init_params.client_info.version);
                debug!("Client protocol version: {}", init_params.protocol_version);
            }
        }

        let result = McpInitializeResult {
            protocol_version: MCP_VERSION.to_string(),
            capabilities: McpServerCapabilities {
                tools: Some(McpToolsCapability {
                    list_changed: true,
                }),
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
                let err = JsonRpcError::internal_error(format!("Failed to serialize initialize result: {}", e));
                JsonRpcResponse::failure(err, id)
            }
        }
    }

    /// Handle tools/list request
    async fn handle_tools_list(&self, id: Option<Value>) -> JsonRpcResponse {
        let tool_registry = self.tool_registry.read().await;
        let tools = tool_registry.list();

        let mcp_tools: Vec<McpToolDefinition> = tools.into_iter().map(|tool| {
            McpToolDefinition {
                name: tool.name,
                description: Some(tool.description),
                input_schema: tool.parameters,
            }
        }).collect();

        let result = McpToolsListResult {
            tools: mcp_tools,
        };

        JsonRpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Handle tools/call request
    async fn handle_tools_call(&self, params: Option<Value>, id: Option<Value>) -> JsonRpcResponse {
        let params: McpToolCallParams = match params {
            Some(p) => match serde_json::from_value(p) {
                Ok(p) => p,
                Err(e) => return JsonRpcResponse::failure(
                    JsonRpcError::invalid_params(format!("Invalid params: {}", e)),
                    id,
                ),
            },
            None => return JsonRpcResponse::failure(
                JsonRpcError::invalid_params("Missing params"),
                id,
            ),
        };

        let tool_name = params.name.clone();
        let tool_registry_guard = self.tool_registry.read().await;

        // Find the tool
        let tool = tool_registry_guard.get(&tool_name);

        if tool.is_none() {
            return JsonRpcResponse::failure(
                JsonRpcError::invalid_params(format!("Tool not found: {}", tool_name)),
                id,
            );
        }

        let tool = tool.unwrap();

        // Check permissions via the v2 registry
        let tool_call = crate::tools::ToolCall {
            id: Uuid::new_v4().to_string(),
            name: tool_name.clone(),
            arguments: params.arguments.clone(),
        };

        match tool_registry_guard.check_permission(&tool_call, None) {
            Ok(crate::tools::permission::PermissionDecision::Allow) => {
                // Authorized, proceed to execution
            }
            Ok(crate::tools::permission::PermissionDecision::Deny { reason }) => {
                return JsonRpcResponse::failure(
                    JsonRpcError::internal_error(format!("Permission denied: {}", reason)),
                    id,
                );
            }
            Ok(crate::tools::permission::PermissionDecision::Confirm { .. }) => {
                return JsonRpcResponse::failure(
                    JsonRpcError::internal_error("User confirmation required for this tool call. Please authorize in the ZEN application.".to_string()),
                    id,
                );
            }
            Err(e) => {
                return JsonRpcResponse::failure(
                    JsonRpcError::internal_error(format!("Security check failed: {}", e)),
                    id,
                );
            }
        }
        
        // We must drop the read guard before calling tool.execute as it might need to acquire a lock
        drop(tool_registry_guard);

        let (output_text, is_error) = if let Some(app) = &self.app_handle {
            match tool.execute(app.clone(), "mcp-call".to_string(), params.arguments.clone()).await {
                Ok(output) => {
                    let text = serde_json::to_string(&output.content).unwrap_or_else(|e| format!("Serialization of tool output failed: {}", e));
                    (text, false)
                }
                Err(e) => {
                    (format!("Error executing tool: {}", e), true)
                }
            }
        } else {
            ("Error: AppHandle not available in MCP server".to_string(), true)
        };

        // Execute the tool
        let result = McpToolCallResult {
            content: vec![McpContentBlock::text(output_text)],
            is_error: Some(is_error),
        };

        let _ = self.event_tx.send(McpEvent::ToolCalled {
            tool_name: tool_name.clone(),
            success: !is_error
        });

        JsonRpcResponse::success(serde_json::to_value(result).unwrap(), id)
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
