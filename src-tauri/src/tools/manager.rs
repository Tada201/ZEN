// Phase 5 shim (BIG_MIGRATION.md §4.6): the discovery manager moved to
// zen-tools (split into registry.rs + manager.rs there). This alias binds it
// to the AppHandle host; discovery/listing behavior is unchanged. Delete in
// Phase 14.
pub use zen_tools::manager::{
    meta_tool_definitions, ToolDescriptor, ToolMetadata, ToolSchema,
};
pub type ToolManager = zen_tools::manager::ToolManager<tauri::AppHandle>;
