//! App-side re-export shim for zen-mcp (BIG_MIGRATION.md Phase 8).
//!
//! The MCP client/config/consent/discovery logic now lives in the `zen-mcp`
//! workspace crate. Every historical `crate::mcp::*` path keeps compiling
//! via these re-exports; Phase 14 deletes this shim after rewriting consumers
//! to their deliberate final paths (relocation doctrine, BIG_MIGRATION.md
//! S4.6).

pub use zen_mcp::{
    client, config, consent, discovery, env, mrtr, oauth, registrar, resources, sandbox, stdio,
    tool_schema, types, UiBridge,
};
pub use zen_mcp::{
    is_external_tool_name, prefixed_external_tool_name, risk_level_from_annotations, McpClient,
    McpConfigError, McpConfigService, McpScope, McpServerEntry, McpTransport, StdioTransport,
};
pub use zen_mcp::types::*;
