//! Adapter that wraps a tool exposed by an external MCP server so it
//! participates in the same v2 `Tool`/registry dispatch path as built-in
//! tools.
//!
//! # Why an adapter (vs string prefix parsing)
//!
//! Prior to this module, the dispatch path had two parallel tracks:
//! 1. The ToolRegistry accepted a **schema-only** entry for `ext:{server}:{name}` via `register_external`,
//!    so discovery and permission checks worked uniformly.
//! 2. At execution time, `ToolService::execute_v2_authorized` had to
//!    detect the `ext:` prefix and hand the call off to
//!    `McpClient::execute_external_tool`, which reparsed the prefix
//!    to recover the `(server_name, origin_tool_name)` pair.
//!
//! Splitting the same wire identifier in two places is fragile (any
//! rename or escaping tweak had to land in both call sites, and the
//! `McpClient::is_external_tool` helper sat on the wrong side of the
//! abstraction).
//!
//! The fix stores `(server_name, origin_tool_name)` directly on
//! `McpToolAdapter` and lets the adapter participate in the regular
//! `Tool` trait flow. Dispatch is now:
//!
//! ```text
//! tools/list response  →  McpClient::sync_external_servers()
//!                       →  for each tool: Arc<McpToolAdapter> registered via registry.register
//! ToolService::execute_v2_authorized
//!                       →  registry.get(name) returns Some(adapter)
//!                       →  adapter.execute()    (no string parsing)
//!                       →  McpClient::call_external_tool(server, tool, args)
//! ```
//!
//! # Ownership / cycle notes
//!
//! `McpClient` holds `Arc<RwLock<ToolRegistry>>`; the registry (after
//! sync) holds `Arc<McpToolAdapter>` instances; each adapter holds
//! back to its owning `Arc<McpClient>`. A naive `Arc<McpClient>` field
//! would therefore leak: dropping the outer `Arc<McpClient>` would
//! drop the registry handle, which still strongly references the
//! adapter, which strongly references the very `McpClient` we tried
//! to drop.
//!
//! We break the cycle by holding a `Weak<McpClient>`. Upgrade on
//! `execute()` returns `Arc<McpClient>` for the duration of the call
//! and the Strong count returns to its baseline after `await`. If the
//! upgrade fails (client was dropped first), `execute` returns
//! `ToolError::ExecutionFailed` instead of panicking — that path is
//! only reachable during shutdown when async tasks race.

use async_trait::async_trait;
use std::sync::Weak;
use tauri::AppHandle;

use zen_mcp::McpClient;
use crate::tools::permission::RiskLevel;
use crate::tools::{ToolAnnotations, ToolError, ToolOutput};

/// Adapter for a single tool served by an external MCP server.
///
/// The LLM-visible name is the canonical `ext:{server_name}:{origin_tool_name}`
/// string (matches what agent configs and `.mcp.json` consumer code
/// already rely on); `server_name` and `origin_tool_name` are also
/// stored plain so `execute` never has to split a prefix.
pub struct McpToolAdapter {
    server_name: String,
    origin_tool_name: String,
    prefixed_name: String,
    description: String,
    parameters: serde_json::Value,
    output_schema: Option<serde_json::Value>,
    annotations: Option<ToolAnnotations>,
    risk_level: RiskLevel,
    /// Weak reference to the owning `McpClient`. Breaks the
    /// `McpClient → registry → adapter → McpClient` reference cycle
    /// so the client can be dropped cleanly on shutdown.
    mcp_client: Weak<McpClient>,
}

impl McpToolAdapter {
    /// Build a new adapter. `Weak<McpClient>` lets the adapter
    /// participate in the registry without extending the owner's
    /// lifetime. Scheduled for re-registration after re-sync.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        server_name: String,
        origin_tool_name: String,
        description: String,
        parameters: serde_json::Value,
        output_schema: Option<serde_json::Value>,
        annotations: Option<ToolAnnotations>,
        risk_level: RiskLevel,
        mcp_client: Weak<McpClient>,
    ) -> Self {
        let prefixed_name =
            zen_mcp::client::prefixed_external_tool_name(&server_name, &origin_tool_name);
        Self {
            server_name,
            origin_tool_name,
            prefixed_name,
            description,
            parameters,
            output_schema,
            annotations,
            risk_level,
            mcp_client,
        }
    }

    /// (testing) construct without a Weak backend so unit tests
    /// don't have to fabricate a real `McpClient`.
    #[cfg(test)]
    pub fn for_tests(
        server_name: impl Into<String>,
        origin_tool_name: impl Into<String>,
    ) -> Self {
        Self {
            server_name: server_name.into(),
            origin_tool_name: origin_tool_name.into(),
            prefixed_name: String::new(),
            description: String::new(),
            parameters: serde_json::json!({}),
            output_schema: None,
            annotations: None,
            risk_level: RiskLevel::Medium,
            mcp_client: Weak::new(),
        }
    }
}

#[async_trait]
impl zen_tools::Tool<tauri::AppHandle> for McpToolAdapter {
    fn name(&self) -> &str {
        &self.prefixed_name
    }

    fn description(&self) -> &str {
        &self.description
    }

    fn parameters_schema(&self) -> serde_json::Value {
        self.parameters.clone()
    }

    fn output_schema(&self) -> Option<serde_json::Value> {
        self.output_schema.clone()
    }

    fn annotations(&self) -> Option<ToolAnnotations> {
        self.annotations.clone()
    }

    fn risk_level(&self) -> RiskLevel {
        self.risk_level
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    /// Delegate the call back to the owning `McpClient`. We never
    /// `strip_prefix("ext:")` here — the adapter already stores the
    /// `(server_name, origin_tool_name)` pair as plain strings. A
    /// failed `Weak` upgrade means the MCP client was dropped while
    /// the registry outlived it (shutdown race); surface as a typed
    /// error instead of panicking.
    async fn execute(
        &self,
        app: AppHandle,
        chat_id: String,
        args: serde_json::Value,
    ) -> Result<ToolOutput, ToolError> {
        let client = self.mcp_client.upgrade().ok_or_else(|| {
            ToolError::ExecutionFailed {
                message: "MCP client is no longer available".to_string(),
            }
        })?;
        // Thread the chat's cancellation token so a cancelled agent turn also
        // aborts an in-flight MCP call instead of leaking the connection.
        let cancel = {
            use tauri::Manager;
            let state = app.state::<crate::commands::AppState>();
            let tokens = state.chat_cancellation_tokens.lock().await;
            tokens.get(&chat_id).cloned()
        };
        // Phase 8: the client is tauri-free; hand it the host UI bridge
        // (tauri event sink + opener browser) for elicitation prompts.
        let ui = crate::services::mcp_registrar::ui_bridge(&app);
        client
            .call_external_tool(Some(&ui), &self.server_name, &self.origin_tool_name, args, cancel)
            .await
            .map(|content| ToolOutput {
                content,
                metadata: None,
            })
            .map_err(|e| ToolError::ExecutionFailed { message: e })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adapter_separates_server_and_origin_names() {
        let adapter = McpToolAdapter::for_tests("github", "create_issue");
        assert_eq!(adapter.server_name, "github");
        assert_eq!(adapter.origin_tool_name, "create_issue");
    }
}
