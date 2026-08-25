// Phase 5 shim (BIG_MIGRATION.md §4.6): the tool contracts, catalog
// registry, and definitions moved to the zen-tools crate. The aliases below
// bind the host-generic types to tauri's AppHandle so every existing type
// position (`Arc<dyn ...>`, registry fields, call signatures) compiles
// unchanged. `impl Tool for` / `impl AgentTool for` headers (and `dyn`
// positions) are rewritten to the underlying generic paths — type aliases
// can't appear in impl or dyn position. Delete this shim in Phase 14.
pub mod calculator;
pub mod capability;
pub mod fs_tools;
pub mod image_tool;
pub mod manager;
pub mod operational_map;
// patch_parser moved to zen-agent (Phase 11); re-exported below.
pub mod permission;
pub mod sys_metrics;
pub mod terminal_tools;
pub mod url_safety;
pub mod web_fetch;

use std::sync::Arc;
use tokio::sync::RwLock;

pub use zen_agent::patch_parser;
pub use zen_tools::registry::{
    ToolAnnotations, ToolCall, ToolDefinition, ToolError, ToolExecutionRecord, ToolOutput,
};
pub use zen_tools::{default_tool_risk, ToolInfo};
pub use zen_security::approval::PermissionDecision;
pub use zen_security::policy::ToolPermissions;
pub use zen_security::risk::RiskLevel;

/// Host bindings: every catalog tool in the app executes against Tauri's
/// AppHandle. The `Tool` trait itself has no alias (trait aliases are not
/// stable) — impl headers and `dyn` positions use
/// `zen_tools::Tool<tauri::AppHandle>` directly.
pub type ToolRegistry = zen_tools::registry::ToolRegistry<tauri::AppHandle>;
pub type GlobalToolRegistry = Arc<RwLock<ToolRegistry>>;

/// Register built-in tool executors. The executors themselves stay in the
/// app crate (they reach AppState through the AppHandle); only the registry
/// and contracts live in zen-tools. The operational-map adapter is
/// intentionally disabled until the unified world-map surface is ready.
pub fn init_tool_registry(permissions: zen_security::policy::ToolPermissions) -> ToolRegistry {
    let mut registry = ToolRegistry::with_permissions(permissions);

    registry.register(Arc::new(self::calculator::CalculatorTool));
    registry.register(Arc::new(self::sys_metrics::SystemMetricsTool));
    registry.register(Arc::new(self::web_fetch::WebFetchTool));
    registry.register(Arc::new(crate::search::WebSearchTool));
    // registry.register(Arc::new(ActivateOperationalMapTool)); // Disabled future feature.
    registry.register(Arc::new(self::terminal_tools::RunCommandTool));
    registry.register(Arc::new(self::image_tool::ImageGenerationTool));

    // Future world-map work will replace the separate 2D/3D map tools with one
    // canonical tool. Do not expose either legacy map adapter in the meantime.

    // Register deterministic local-document tools. These read the uploaded file
    // at its recorded workspace path; semantic/vector search is intentionally
    // retired until it can provide a reliable, tested replacement.
    registry.register(Arc::new(fs_tools::ListDocumentsTool));
    registry.register(Arc::new(fs_tools::ReadDocumentTool));
    registry.register(Arc::new(fs_tools::GrepDocumentsTool));
    registry.register(Arc::new(fs_tools::WriteFileTool));
    registry.register(Arc::new(fs_tools::EditFileTool));
    registry.register(Arc::new(fs_tools::ApplyPatchTool));

    registry.register_builtin_known_tools();

    registry
}

#[cfg(test)]
mod tests {
    /// The app wiring registers system metrics exactly once under its
    /// canonical id; the retired `system_metrics` alias must not resolve.
    /// (Re-homed from tools/manager.rs when the manager moved to zen-tools.)
    #[test]
    fn system_metrics_has_one_canonical_v2_registration() {
        let registry = super::init_tool_registry(
            zen_security::policy::ToolPermissions::default(),
        );

        assert!(registry.is_direct_tool("get_system_metrics"));
        assert!(!registry.is_direct_tool("system_metrics"));
        assert!(registry
            .executable_tool_names()
            .contains("get_system_metrics"));
        assert!(!registry.executable_tool_names().contains("system_metrics"));

        let definition = registry
            .list_definitions()
            .into_iter()
            .find(|definition| definition.name == "get_system_metrics")
            .expect("canonical system metrics definition should be registered");
        assert_eq!(definition.parameters["type"], "object");
    }
}
