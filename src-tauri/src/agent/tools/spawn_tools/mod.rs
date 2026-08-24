//! Sub-agent spawning, grouped by concern.
//!
//! Split out of the former single `spawn_tools.rs` during BIG_MIGRATION.md
//! Phase 11. The module path is unchanged and the re-exports below keep every
//! existing `spawn_tools::<item>` call site working.

mod child;
mod completion;
mod deps;
mod failure;
mod messaging;
mod model_select;
mod outcome;
mod params;
mod tool;

pub(crate) use model_select::parse_provider_model;
pub use child::SpawnAgentTool;
pub use messaging::send_message_to_subagent;

/// Ceiling on agents in one `spawn_agent` call's parallel batch.
const MAX_PARALLEL_SUBAGENTS: usize = 8;

/// Ceiling on sub-agent runs executing concurrently across the whole process.
/// The per-call wave path already caps one batch at `MAX_PARALLEL_SUBAGENTS`,
/// but nested delegation and multiple concurrent parent turns are otherwise
/// unbounded and can exhaust provider rate limits. Every `do_spawn` acquires a
/// permit before running its child and releases it on completion.
const MAX_GLOBAL_CONCURRENT_SUBAGENTS: usize = 16;

/// Wall-clock ceiling for a single sub-agent run. Bounds the direct spawn path
/// (and the parallel-wave path) so a child whose provider/tool hangs without
/// observing cancellation cannot leave the parent tool call and the Agents
/// panel stuck at "Working" indefinitely.
const SUBAGENT_TIMEOUT_SECONDS: u64 = 600;
