//! App-side tool wiring.
//!
//! Tool contracts, the catalog registry, and the discovery manager live in the
//! `zen-tools` crate; consumers import them from `zen_tools::` directly. What
//! stays here is what cannot live in a crate: leaf executors that reach
//! `AppState` through Tauri's `AppHandle`, plus the host-binding aliases below.
//! zen-tools is generic over the host `A` because RULES.md §3.1 forbids
//! `tauri` in crates, and Rust has no trait aliases — so `impl`/`dyn`
//! positions spell `zen_tools::Tool<tauri::AppHandle>` while struct and type
//! positions use these aliases.
pub mod fs_tools;
pub mod image_tool;
pub mod manager;
pub mod operational_map;
pub mod sys_metrics;
pub mod terminal_tools;
pub mod web_fetch;

use std::sync::Arc;
use tokio::sync::RwLock;

pub type ToolRegistry = zen_tools::registry::ToolRegistry<tauri::AppHandle>;
pub type GlobalToolRegistry = Arc<RwLock<ToolRegistry>>;
pub use manager::ToolManager;

/// Register built-in tool executors. The executors themselves stay in the
/// app crate (they reach AppState through the AppHandle); only the registry
/// and contracts live in zen-tools. The operational-map adapter is
/// intentionally disabled until the unified world-map surface is ready.
pub fn init_tool_registry(permissions: zen_security::policy::ToolPermissions) -> ToolRegistry {
    let mut registry = ToolRegistry::with_permissions(permissions);

    registry.register(Arc::new(zen_tools::calculator::CalculatorTool));
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
