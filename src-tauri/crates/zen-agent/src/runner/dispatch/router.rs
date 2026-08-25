//! Tool-exposure routing: which tools an agent is authorized to see,
//! and how run/batch ids are derived.
//!
//! Split out of the former single `tool_dispatch.rs` during
//! BIG_MIGRATION.md Phase 11. The execution paths live in
//! `executors.rs`; result collection lives in `completion.rs`.

use super::super::lifecycle::Runner;
use crate::ports::ToolCatalogPort;
use crate::types::{Agent, ModelTier};
use zen_core::ToolInfo;

/// Decide which v2 tool schemas to inline-expose alongside the three
/// meta-tools, based on the active model tier.
///
/// **Cloud tier** uses strict deferred discovery: only the meta-tools
/// are exposed, so the model must call `tool_list` -> `tool_info` ->
/// `tool_exec`. Cloud models (GPT-4o, Claude 3.5 Sonnet) follow this
/// protocol reliably.
///
/// **Local / Simple tiers** get the hybrid exposure because many local
/// models (Llama 3.1, Qwen 2.5, Mistral) ignore the `tool_list` flow
/// and only look at their function definitions.
///
/// This is a P0 IPI defence: the meta-tool contract is weakened if a
/// hostile skill/tool description can claim the name of a sensitive
/// tool. Keeping the schema list narrow for cloud models reduces the
/// prompt surface that an attacker can target.
async fn inline_v2_schemas_for_tier(
    tier: ModelTier,
    authorized_tool_ids: &[String],
    catalog: &dyn ToolCatalogPort,
) -> Vec<ToolInfo> {
    if matches!(tier, ModelTier::Cloud) {
        return Vec::new();
    }
    let mut out: Vec<ToolInfo> = Vec::new();
    for tool_id in authorized_tool_ids {
        if let Some(info) = catalog.v2_definition(tool_id).await {
            if !out.iter().any(|t| t.name == info.name) {
                out.push(info);
            }
        }
    }
    out
}

impl Runner {
    fn filter_delegation_tool_ids(
        tool_ids: impl IntoIterator<Item = String>,
        delegation_allowed: bool,
    ) -> Vec<String> {
        tool_ids
            .into_iter()
            .filter(|tool_id| delegation_allowed || tool_id != "spawn_agent")
            .collect()
    }

    pub(super) fn execution_run_id(&self, chat_id: &str) -> String {
        chat_id.to_string()
    }

    pub(super) fn parent_agent_id(&self) -> Option<String> {
        (self.depth > 0).then(|| "orchestrator".to_string())
    }

    pub(super) fn tool_batch_id(&self, chat_id: &str, agent_id: &str, iteration: usize) -> String {
        format!("{}:{}:{}:{}", chat_id, agent_id, self.depth, iteration)
    }

    pub(in super::super) async fn authorized_tools_for_agent(
        &self,
        current_agent: &Agent,
        tools_enabled: bool,
    ) -> (Vec<String>, Vec<zen_tools::ToolInfo>) {
        if !tools_enabled {
            return (Vec::new(), Vec::new());
        }

        let mut authorized_tool_ids = Self::filter_delegation_tool_ids(
            self.ctx
                .tool_catalog
                .v1_tool_ids()
                .await
                .into_iter()
                .filter(|tool_id| current_agent.tool_ids.contains(tool_id)),
            self.delegation_allowed,
        );

        // Authorize v2 tools from the permissions registry
        let v2_tools = self.ctx.tool_catalog.v2_executable_tool_names().await;
        for tool_id in Self::filter_delegation_tool_ids(
            current_agent.tool_ids.iter().cloned(),
            self.delegation_allowed,
        ) {
            if v2_tools.contains(&tool_id) && !authorized_tool_ids.contains(&tool_id) {
                authorized_tool_ids.push(tool_id);
            }
        }

        // Auto-authorize external MCP tools (`ext:{server}:{name}`) discovered
        // from `.mcp.json`. Agent configs use static `tool_ids` arrays that
        // cannot name dynamically-registered servers, so any external tool the
        // user configured is admitted for every tool-enabled agent. The user's
        // per-tool permission policy still gates execution downstream.
        for tool_id in &v2_tools {
            if zen_mcp::client::is_external_tool_name(tool_id)
                && !authorized_tool_ids.contains(tool_id)
            {
                authorized_tool_ids.push(tool_id.clone());
            }
        }

        let exposed_tools = if current_agent.id == "voice_display" {
            self.ctx
                .tool_catalog
                .v1_tools_info()
                .await
                .into_iter()
                .filter(|tool| authorized_tool_ids.contains(&tool.name))
                .collect()
        } else {
            let mut tools = zen_tools::meta_tool_definitions();

            // P0 IPI defence: Cloud-tier models get strict deferred
            // discovery (only the three meta-tools). Cloud models follow
            // `tool_list` -> `tool_info` -> `tool_exec` reliably, so the
            // full v2 schema exposure is unnecessary and would weaken the
            // meta-tool contract.
            //
            // Local-tier models keep the hybrid exposure because many
            // local models (Llama 3.1, Qwen 2.5, Mistral) ignore the
            // `tool_list` flow and only look at their function definitions.
            {
                for info in inline_v2_schemas_for_tier(
                    current_agent.model_tier,
                    &authorized_tool_ids,
                    self.ctx.tool_catalog.as_ref(),
                )
                .await
                {
                    if !tools.iter().any(|t| t.name == info.name) {
                        tools.push(info);
                    }
                }
            }

            tools
        };

        (authorized_tool_ids, exposed_tools)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;

    /// Minimal fake over the host catalog port so the tier-exposure tests
    /// can inject real definitions instead of needing an app-side registry.
    struct FakeCatalog {
        defs: Vec<ToolInfo>,
    }

    #[async_trait]
    impl ToolCatalogPort for FakeCatalog {
        async fn v1_tool_ids(&self) -> Vec<String> {
            Vec::new()
        }

        async fn v1_tools_info(&self) -> Vec<ToolInfo> {
            Vec::new()
        }

        async fn v2_executable_tool_names(&self) -> Vec<String> {
            self.defs.iter().map(|d| d.name.clone()).collect()
        }

        async fn v2_definition(&self, id: &str) -> Option<ToolInfo> {
            self.defs.iter().find(|d| d.name == id).cloned()
        }
    }

    fn catalog_with(names: &[&str]) -> FakeCatalog {
        FakeCatalog {
            defs: names
                .iter()
                .map(|name| ToolInfo {
                    name: name.to_string(),
                    description: "fake".to_string(),
                    parameters: serde_json::json!({"type": "object"}),
                })
                .collect(),
        }
    }

    #[test]
    fn child_authorization_removes_delegation_tool() {
        let tool_ids = vec!["web_search".to_string(), "spawn_agent".to_string()];
        assert_eq!(
            Runner::filter_delegation_tool_ids(tool_ids.clone(), false),
            vec!["web_search".to_string()]
        );
        assert_eq!(
            Runner::filter_delegation_tool_ids(tool_ids, true),
            vec!["web_search".to_string(), "spawn_agent".to_string(),]
        );
    }

    /// Regression test: a Cloud-tier agent must receive ONLY the three
    /// meta-tools. Inlining the full v2 schema list would weaken the
    /// meta-tool contract and let a malicious skill name coincide with a
    /// privileged tool id.
    #[tokio::test]
    async fn inline_v2_schemas_returns_empty_for_cloud_tier() {
        let authorized = vec![
            "web_search".to_string(),
            "read_document_content".to_string(),
        ];
        // Cloud tier must produce an empty list regardless of what the
        // authorized ids or v2 registry contain.
        let v2 = catalog_with(&["web_search", "read_document_content"]);
        let cloud = inline_v2_schemas_for_tier(ModelTier::Cloud, &authorized, &v2).await;
        assert!(cloud.is_empty(), "Cloud tier must not inline v2 schemas");
    }

    /// Regression test: Local and Simple tiers keep the hybrid exposure —
    /// non-matching ids return empty regardless of tier.
    #[tokio::test]
    async fn inline_v2_schemas_local_tier_with_empty_registry_returns_empty() {
        let authorized = vec!["definitely_not_a_real_tool".to_string()];
        let v2 = catalog_with(&[]);
        // No matching tool in the registry -> empty list (regardless of tier).
        let local = inline_v2_schemas_for_tier(ModelTier::Local, &authorized, &v2).await;
        assert!(local.is_empty(), "non-matching ids return empty");
        let simple = inline_v2_schemas_for_tier(ModelTier::Simple, &authorized, &v2).await;
        assert!(simple.is_empty());
    }

    /// Cloud tier still returns empty even when the authorized ids match
    /// real v2 tools in the registry. This is the critical regression
    /// guard: someone removing the `ModelTier::Cloud` short-circuit
    /// would expose the v2 schemas and weaken the meta-tool contract.
    #[tokio::test]
    async fn cloud_tier_never_exposes_v2_schemas_even_with_matching_ids() {
        let authorized = vec!["web_search".to_string(), "run_command".to_string()];
        let v2 = catalog_with(&["web_search", "run_command"]);
        let cloud = inline_v2_schemas_for_tier(ModelTier::Cloud, &authorized, &v2).await;
        assert!(
            cloud.is_empty(),
            "Cloud tier must not inline v2 schemas even when the ids match real tools"
        );
    }

    /// Local tier DOES expose matching schemas — guards against the inverse
    /// regression where the hybrid exposure collapses to deferred discovery.
    #[tokio::test]
    async fn local_tier_exposes_matching_v2_schemas() {
        let authorized = vec!["web_search".to_string(), "run_command".to_string()];
        let v2 = catalog_with(&["web_search"]);
        let local = inline_v2_schemas_for_tier(ModelTier::Local, &authorized, &v2).await;
        assert_eq!(local.len(), 1);
        assert_eq!(local[0].name, "web_search");
    }
}
