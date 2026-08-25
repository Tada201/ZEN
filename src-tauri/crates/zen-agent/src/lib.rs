//! zen-agent — the agent runtime extracted from the app crate
//! (BIG_MIGRATION.md Phase 11). Everything here is UI-agnostic: host
//! capabilities (event emission, tool execution, approvals, board writes)
//! are consumed through the ports in [`ports`], implemented app-side.
//!
//! Module layout mirrors the pre-extraction `src/agent/` tree so the app's
//! `crate::agent` shim (relocation doctrine §4.6) keeps every historical
//! path compiling. `clarification` (a `#[tauri::command]`) and the leaf
//! tool executors stay in the app crate.

pub mod agents;
pub mod booster;
pub mod cache;
pub mod chat_status;
pub mod child_runner;
pub mod context;
pub mod deep_research;
pub mod event_bus;
pub mod event_snapshot;
pub mod handoff_context;
pub mod hooks;
pub mod init_state;
pub mod instance;
pub mod middleware;
pub mod orchestrator;
pub mod patch_parser;
pub mod plugins;
pub mod prompt_safety;
pub mod rate_limiter;
pub mod router;
pub mod runner;
pub mod skills;
pub mod swarm;
pub mod task;
pub mod task_queue;
pub mod types;
pub mod utils;

pub mod ports;

#[allow(unused_imports)]
pub use booster::*;
#[allow(unused_imports)]
pub use cache::*;
#[allow(unused_imports)]
pub use context::{AgentContext, ChatPauseControl};
#[allow(unused_imports)]
pub use init_state::InitState;
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
pub use types::*;
