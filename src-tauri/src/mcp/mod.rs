/// MCP (Model Context Protocol) Module
///
/// Provides MCP server implementation for external tool integration.
/// MCP allows AI assistants to discover and use tools from external sources.
///
/// ## Features
/// - JSON-RPC 2.0 protocol implementation
/// - Tool registration and discovery
/// - Multiple transport layers (stdio, HTTP)
/// - Compatible with MCP specification v2024-11-05
///
/// ## Usage
/// ```rust
/// use crate::mcp::{McpServer, McpServerConfig};
///
/// let config = McpServerConfig::default();
/// let mut server = McpServer::new(config, tool_registry);
/// server.start().await?;
/// ```

pub mod types;
pub mod server;
pub mod stdio;
pub mod http;

pub use types::*;
pub use server::{McpServer, McpServerConfig, McpServerState, McpEvent, McpError};
pub use stdio::run_stdio_server;
pub use http::{start_http_server, create_mcp_router, HttpState};
