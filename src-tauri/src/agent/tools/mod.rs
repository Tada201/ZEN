//! App-side agent tool executors.
//!
//! The `AgentTool` trait and the execution-side registry live in zen-tools
//! (`agent_tool.rs`, `registry.rs::AgentToolRegistry`). Rust has no trait
//! aliases, so `impl` headers and `dyn` positions spell
//! `zen_tools::AgentTool<tauri::AppHandle>` directly; the `ToolRegistry` alias
//! below is the host binding for struct/type positions.
pub mod browser_tools;
pub mod drawing_tools;
pub mod fs_tools;
pub mod graph_session;
pub mod manage_board;
pub mod map_tools;
pub mod osint_tools;
pub mod progressive;
pub mod routing_tools;
pub mod search_files;
pub mod session_memory_tools;
pub mod skill_tool;
pub mod spawn_tools;
pub mod task_tools;
pub mod terminal_tools;

use std::sync::Arc;

pub type ToolRegistry = zen_tools::AgentToolRegistry<tauri::AppHandle>;

/// Bridge from the app's progressive (lazy) registry to the zen-tools
/// `LazyToolSource` port. Uses non-blocking reads: the former v1 registry
/// used `try_read` for the same operations, so lock contention behaves
/// exactly as before (miss → tool treated as not-yet-loadable).
pub struct ProgressiveToolSource {
    progressive: Arc<tokio::sync::RwLock<progressive::ProgressiveToolRegistry>>,
}

impl ProgressiveToolSource {
    pub fn new(
        progressive: Arc<tokio::sync::RwLock<progressive::ProgressiveToolRegistry>>,
    ) -> Self {
        Self { progressive }
    }
}

impl zen_tools::registry::LazyToolSource<tauri::AppHandle> for ProgressiveToolSource {
    fn metadata(&self) -> Vec<zen_tools::LazyToolMetadata> {
        match self.progressive.try_read() {
            Ok(prog) => prog
                .get_metadata()
                .into_iter()
                .map(|meta| zen_tools::LazyToolMetadata {
                    id: meta.id,
                    name: meta.name,
                    description: meta.description,
                    category: meta.category,
                    tags: meta.tags,
                })
                .collect(),
            Err(_) => Vec::new(),
        }
    }

    fn get_or_load(&self, id: &str) -> Option<Arc<dyn zen_tools::AgentTool<tauri::AppHandle>>> {
        self.progressive.try_read().ok()?.get_or_load_tool(id)
    }

    fn loaded_ids(&self) -> Vec<String> {
        match self.progressive.try_read() {
            Ok(prog) => prog.loaded_tool_ids(),
            Err(_) => Vec::new(),
        }
    }
}
