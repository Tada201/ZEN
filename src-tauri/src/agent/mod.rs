// Phase 11 shim (BIG_MIGRATION.md §4.6): the agent runtime moved to the
// zen-agent crate. This module re-exports every historical path so app
// callers (`crate::agent::*`) keep compiling unchanged; deleted in Phase 14.
//
// Staying app-side by design:
// - `tools/` — leaf tool executors that reach AppState through AppHandle,
//   registered into the host-generic zen-tools registries.
// - `clarification.rs` — a `#[tauri::command]`; commands are adapters and
//   belong to the app crate.
pub mod clarification;
pub mod tools;

pub use zen_agent::agents;
pub use zen_agent::booster;
pub use zen_agent::cache;
pub use zen_agent::chat_status;
pub use zen_agent::child_runner;
pub use zen_agent::deep_research;
pub use zen_agent::event_bus;
pub use zen_agent::event_snapshot;
pub use zen_agent::handoff_context;
pub use zen_agent::hooks;
pub use zen_agent::init_state;
pub use zen_agent::instance;
pub use zen_agent::middleware;
pub use zen_agent::orchestrator;
pub use zen_agent::plugins;
pub use zen_agent::prompt_safety;
pub use zen_agent::rate_limiter;
pub use zen_agent::router;
pub use zen_agent::runner;
pub use zen_agent::skills;
pub use zen_agent::swarm;
pub use zen_agent::task;
pub use zen_agent::task_queue;
pub use zen_agent::types;
pub use zen_agent::utils;

#[allow(unused_imports)]
pub use booster::*;
#[allow(unused_imports)]
pub use cache::*;
#[allow(unused_imports)]
pub use orchestrator::*;
#[allow(unused_imports)]
pub use plugins::*;
#[allow(unused_imports)]
pub use router::*;
#[allow(unused_imports)]
pub use runner::*;
#[allow(unused_imports)]
#[allow(ambiguous_glob_reexports)]
pub use swarm::*;
#[allow(unused_imports)]
pub use task_queue::*;
#[allow(unused_imports)]
pub use tools::session_memory_tools;
#[allow(unused_imports)]
pub use tools::*;
#[allow(unused_imports)]
pub use types::*;
