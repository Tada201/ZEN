pub mod client;
pub mod env;
pub mod mrtr;
pub mod oauth;
pub mod resources;
pub mod sandbox;
pub mod tool_schema;
/// MCP (Model Context Protocol) Module
///
/// Client-only: connects to external MCP servers configured via `.mcp.json`.
/// Each external server's tools are registered with an `ext:{server}:{name}`
/// prefix and proxied through the agent runner.
///
/// Supports two transports:
/// - **Streamable HTTP** (`url` field): reqwest-based POST with
///   `MCP-Protocol-Version`/`Mcp-Session-Id` headers.
/// - **stdio** (`command`+`args` fields): spawns a child process and
///   pipes newline-delimited JSON-RPC 2.0 over stdin/stdout.
pub mod stdio;
pub mod types;

pub use client::McpClient;
pub use stdio::StdioTransport;
pub use types::*;
