pub mod client;
/// MCP (Model Context Protocol) Module
///
/// Client-only: connects to external MCP servers configured via `.mcp.json`.
/// Each external server's tools are registered with an `ext:{server}:{name}`
/// prefix and proxied through the agent runner.
pub mod types;

pub use client::McpClient;
pub use types::*;
