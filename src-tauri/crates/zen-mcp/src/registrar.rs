//! Registration seam between MCP discovery and the host's tool registry
//! (BIG_MIGRATION.md Phase 8 construction inversion).
//!
//! `ToolRegistry<A>` is generic over the host context (`A = AppHandle` in
//! the app), so zen-mcp cannot construct or insert adapters itself. Instead
//! the client hands fully-validated [`ExternalToolSpec`]s to the port; the
//! app impl wraps each spec in an `McpToolAdapter` (holding a `Weak` back to
//! the client, breaking the registry cycle exactly as before) and registers
//! it into its typed registry.

use serde_json::Value;

use zen_security::risk::RiskLevel;
use zen_tools::ToolAnnotations;

/// Everything needed to surface one external MCP tool into the host registry.
#[derive(Debug, Clone)]
pub struct ExternalToolSpec {
    pub server_name: String,
    pub tool_name: String,
    pub description: String,
    pub parameters: Value,
    pub output_schema: Option<Value>,
    pub annotations: Option<ToolAnnotations>,
    pub risk_level: RiskLevel,
}

/// Host-side registration surface for external MCP tools.
#[async_trait::async_trait]
pub trait ExternalToolRegistrar: Send + Sync {
    /// Remove every previously-registered `ext:*` adapter so a re-sync can't
    /// leave stale entries behind if a row was removed from `.mcp.json`.
    /// Returns how many entries were removed (the caller logs when > 0).
    async fn clear_external(&self) -> usize;

    /// Register one freshly-discovered external tool.
    async fn register_external(&self, spec: ExternalToolSpec);
}

/// No-op registrar for in-crate tests: accepts specs without touching any
/// registry.
pub struct NoopRegistrar;

#[async_trait::async_trait]
impl ExternalToolRegistrar for NoopRegistrar {
    async fn clear_external(&self) -> usize {
        0
    }
    async fn register_external(&self, _spec: ExternalToolSpec) {}
}
