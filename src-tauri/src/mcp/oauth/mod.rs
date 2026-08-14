//! OAuth 2.1 authorization for MCP HTTP servers.
//!
//! Implements the MCP authorization spec: RFC 9728 protected-resource
//! discovery, RFC 8414 authorization-server metadata, PKCE (RFC 7636, S256
//! only), the RFC 8707 `resource` audience, an interactive loopback
//! authorization-code flow, and OS-keyring token storage. Tokens are never
//! written to `.mcp.json`, never placed in URLs, and never logged.

pub mod discovery;
pub mod flow;
pub mod pkce;
pub mod token;

pub use flow::authorize;
pub use token::{clear_token, load_token, store_token, StoredToken};
