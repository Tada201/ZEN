//! Unit tests for the discovery manager. Split out of manager.rs (Phase 6
//! carried-debt shrink) via #[path] include so they keep `super::*`
//! and crate-internal access while the source file stays under the
//! RULES.md 900-line hard-fail.

use super::*;
use crate::agent_tool::AgentTool;
use crate::registry::{LazyToolMetadata, LazyToolSource};
use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value;

/// Host stand-in: the manager is host-agnostic, tests bind a plain unit
/// struct instead of tauri's AppHandle.
struct TestHost;

struct StubAgentTool {
    id: &'static str,
    description: &'static str,
}

#[async_trait]
impl<A: Send + Sync + 'static> AgentTool<A> for StubAgentTool {
    fn id(&self) -> &str {
        self.id
    }
    fn description(&self) -> &str {
        self.description
    }
    fn input_schema(&self) -> Value {
        serde_json::json!({"type": "object"})
    }
    #[allow(clippy::too_many_arguments)]
    async fn run(
        &self,
        _app: A,
        _chat_id: String,
        _input: Value,
        _depth: u32,
        _allowed_tools: Option<
            Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>,
        >,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        Ok(Value::Null)
    }
}

struct StubCatalogTool {
    name: String,
    description: String,
}

#[async_trait]
impl<A: Send + Sync + 'static> crate::registry::Tool<A> for StubCatalogTool {
    fn name(&self) -> &str {
        &self.name
    }
    fn description(&self) -> &str {
        &self.description
    }
    fn parameters_schema(&self) -> serde_json::Value {
        serde_json::json!({"type": "object", "properties": {}})
    }
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
    async fn execute(
        &self,
        _app: A,
        _chat_id: String,
        _args: serde_json::Value,
    ) -> Result<crate::registry::ToolOutput, crate::registry::ToolError> {
        Err(crate::registry::ToolError::ExecutionFailed {
            message: "stub".into(),
        })
    }
}

/// Mirrors the app's progressive core catalog: (id, display name,
/// description). Retired ids (vector_search, map tools, ...) are
/// intentionally absent, exactly like the real catalog.
const STUB_CATALOG: &[(&str, &str, &str)] = &[
    ("tools_search", "Tools Search", "Search for available tools by name, category, or description."),
    ("web_search", "Web Search", "Search the web for current information, news, facts, or answers to questions."),
    ("web_fetch", "Web Fetch", "Fetch and retrieve the full content of a web page or URL."),
    ("list_tools", "List Available Tools", "Lists all available tools with their descriptions."),
    ("run_command", "Run Command", "Execute a terminal command in the workspace."),
    ("list_documents", "List Documents", "List uploaded workspace documents."),
    ("read_document_content", "Read Document", "Read the content of an uploaded document."),
    ("grep_documents", "Grep Documents", "Search uploaded document contents."),
    ("list_directory", "List Directory", "List files in a workspace directory."),
    ("search_files", "Search Files", "Search file contents across the workspace."),
    ("write_file", "Write File", "Create or overwrite a workspace file."),
    ("edit_file", "Edit File", "Apply a targeted edit to a workspace file."),
    ("apply_patch", "Apply Patch", "Apply a multi-file patch."),
    ("update_goal", "Update Goal", "Update the session goal."),
    ("write_todos", "Task Checklist", "Write the agent todo list."),
    ("graph_session", "Graph Session", "Render an interactive graph session."),
    ("draw", "Drawing Canvas", "Draw on the canvas."),
    ("manage_board", "Manage Board", "Manage the voice display board."),
    ("spawn_agent", "Spawn Agent", "Delegate a task to a subagent."),
    ("skill", "Skill", "Invoke a workspace skill."),
];

struct StubLazySource;

impl<A: Send + Sync + 'static> LazyToolSource<A> for StubLazySource {
    fn metadata(&self) -> Vec<LazyToolMetadata> {
        STUB_CATALOG
            .iter()
            .map(|(id, name, description)| LazyToolMetadata {
                id: (*id).to_string(),
                name: (*name).to_string(),
                description: (*description).to_string(),
                category: "agent".to_string(),
                tags: Vec::new(),
            })
            .collect()
    }

    fn get_or_load(&self, id: &str) -> Option<Arc<dyn AgentTool<A>>> {
        STUB_CATALOG
            .iter()
            .find(|(stub_id, _, _)| *stub_id == id)
            .map(|(stub_id, _, description)| {
                Arc::new(StubAgentTool {
                    id: stub_id,
                    description,
                }) as Arc<dyn AgentTool<A>>
            })
    }

    fn loaded_ids(&self) -> Vec<String> {
        STUB_CATALOG
            .iter()
            .map(|(id, _, _)| (*id).to_string())
            .collect()
    }
}

/// Mirrors production startup (AppState::new): a v1 registry over the
/// lazy source, a catalog registry with the built-in known-tool sweep,
/// and one legacy-definition sync so discovery sees a single set.
async fn manager_for_tests() -> ToolManager<TestHost> {
    let v1 = Arc::new(RwLock::new(AgentToolRegistry::with_lazy_source(Arc::new(
        StubLazySource,
    ))));
    let mut v2 = ToolRegistry::with_permissions(ToolPermissions::default());
    // Mirrors production: image generation is a catalog-registered
    // executor, not part of the lazy agent catalog.
    v2.register(std::sync::Arc::new(StubCatalogTool {
        name: "generate_image".to_string(),
        description: "Generate an image from a text prompt.".to_string(),
    }));
    v2.register_builtin_known_tools();
    let v2 = Arc::new(RwLock::new(v2));
    let manager = ToolManager::new(v1, v2);
    manager.sync_legacy_tool_definitions().await;
    manager
}

#[tokio::test]
async fn tool_list_includes_lazy_progressive_metadata() {
    let manager = manager_for_tests().await;
    let tools = manager.list_allowed(&[]).await;

    assert!(tools.iter().any(|t| t.id == "run_command"));
    assert!(tools.iter().any(|t| t.id == "web_search"));
}

#[tokio::test]
async fn tool_list_query_searches_metadata_fields() {
    let manager = manager_for_tests().await;
    let tools = manager
        .list_allowed_matching(&[], Some("terminal shell"))
        .await;

    assert_eq!(tools.first().map(|t| t.id.as_str()), Some("run_command"));
}

#[tokio::test]
async fn tool_list_respects_authorized_ids() {
    let manager = manager_for_tests().await;
    let allowed = vec!["web_search".to_string()];
    let tools = manager.list_allowed(&allowed).await;

    assert!(tools.iter().any(|t| t.id == "web_search"));
    assert!(!tools.iter().any(|t| t.id == "run_command"));
}

#[tokio::test]
async fn tool_list_exposes_only_canonical_spawn_tool() {
    let manager = manager_for_tests().await;
    let tools = manager.list_allowed(&[]).await;

    assert!(tools.iter().any(|t| t.id == "spawn_agent"));
    assert!(!tools.iter().any(|t| t.id == "handoff_to_agent"));
    assert!(!tools.iter().any(|t| t.id == "delegate_to_agent"));
}

#[tokio::test]
async fn tool_list_hides_disabled_future_tools() {
    let manager = manager_for_tests().await;
    let tools = manager.list_allowed(&[]).await;

    assert!(tools.iter().any(|t| t.id == "draw"));
    assert!(!tools.iter().any(|t| t.id == "activate_2d_operational_map"));
    assert!(!tools.iter().any(|t| t.id == "activate_3d_globe"));
    assert!(!tools.iter().any(|t| t.id == "create_geofence"));
    assert!(!tools.iter().any(|t| t.id == "get_weather"));
    assert!(tools.iter().any(|t| t.id == "manage_board"));
}

#[tokio::test]
async fn retired_tools_are_not_discoverable() {
    let manager = manager_for_tests().await;
    let tools = manager.list_allowed(&[]).await;

    for retired in [
        "vector_search",
        "guidance",
        "write_to_memory",
        "search_session_memory",
        "get_memory_stats",
        "calculate_route",
        "geocode_search",
        "reverse_geocode",
        "get_earthquakes",
        "get_military_aircraft",
    ] {
        assert!(
            !tools.iter().any(|tool| tool.id == retired),
            "retired tool '{retired}' must not be discoverable",
        );
    }

    assert!(tools.iter().any(|tool| tool.id == "list_documents"));
    assert!(tools.iter().any(|tool| tool.id == "read_document_content"));
    assert!(tools.iter().any(|tool| tool.id == "grep_documents"));
    assert!(!tools.iter().any(|tool| tool.id == "vector_search"));
}

#[tokio::test]
async fn metadata_keeps_draw_available_for_audit() {
    let manager = manager_for_tests().await;
    let tools = manager.list_metadata().await;
    let draw = tools
        .iter()
        .find(|t| t.id == "draw")
        .expect("draw metadata should still be visible for audit");

    assert_eq!(draw.status, "partial");
    assert!(draw.user_configurable);
}

#[tokio::test]
async fn generate_image_discoverable_by_art_aliases() {
    let manager = manager_for_tests().await;
    // The tool_aliases for generate_image include "draw", "paint", "artwork"
    for alias in &["draw", "paint", "artwork", "illustration", "flux"] {
        let tools = manager
            .list_allowed_matching(&["generate_image".to_string()], Some(alias))
            .await;
        assert!(
            tools.iter().any(|t| t.id == "generate_image"),
            "generate_image should be discoverable via alias '{alias}'",
        );
    }
}

#[tokio::test]
async fn generate_image_status_is_external() {
    use crate::capability::tool_status;
    let info = tool_status("generate_image");
    assert_eq!(info.status, "external");
    assert!(info.agent_visible);
    assert!(info.user_configurable);
}

async fn register_ext_tool(manager: &ToolManager<TestHost>, server: &str, name: &str) -> String {
    // Mirrors production `sync_external_servers`: an adapter (here a
    // stub) is registered directly under its prefixed name, so the
    // catalog sees a real executor plus a definition.
    let ext_id = format!("ext:{server}:{name}");
    manager
        .v2
        .write()
        .await
        .register(std::sync::Arc::new(StubCatalogTool {
            name: ext_id.clone(),
            description: format!("External {name} tool"),
        }));
    ext_id
}

#[tokio::test]
async fn external_mcp_tool_is_discoverable_when_authorized() {
    let manager = manager_for_tests().await;
    let ext_id = register_ext_tool(&manager, "github", "create_issue").await;
    let allowed = vec![ext_id.clone()];

    let tools = manager.list_allowed_matching(&allowed, None).await;
    assert!(
        tools.iter().any(|t| t.id == ext_id),
        "external MCP tool should surface in tool_list for an agent authorized for it",
    );
}

#[tokio::test]
async fn external_mcp_tool_resolves_for_exec() {
    let manager = manager_for_tests().await;
    let ext_id = register_ext_tool(&manager, "github", "create_issue").await;

    // tool_info must find the definition.
    assert!(
        manager.get_info(&ext_id).await.is_some(),
        "tool_info should return a schema for a registered external tool",
    );

    // tool_exec resolution must accept the external tool by name.
    let resolved = manager
        .resolve_tool_exec(&serde_json::json!({
            "tool_id": ext_id,
            "arguments": { "title": "hi" }
        }))
        .await;
    assert_eq!(resolved.map(|(id, _)| id), Some(ext_id));
}
