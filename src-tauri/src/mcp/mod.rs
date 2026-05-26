pub mod http;
pub mod server;
pub mod stdio;
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

pub use http::{create_mcp_router, start_http_server, HttpState};
pub use server::{McpError, McpEvent, McpServer, McpServerConfig, McpServerState};
pub use stdio::run_stdio_server;
pub use types::*;
