//! Agent runner, split into focused submodules.
//!
//! | Module        | Responsibility                                           |
//! |---------------|----------------------------------------------------------|
//! | `config`      | `RunConfig`, `ContextTracker`                            |
//! | `helpers`     | Token estimation, conversation utils, tool call parsing  |
//! | `turn_loop`   | `Runner` struct + main `run()` agent loop                |
//! | `step_exec`   | Step handlers extracted from the turn loop               |
//! | `actions`     | Action timeline: persist_and_emit_action, emit_action_only |
//! | `dispatch`    | Tool exposure routing, parallel execution, completion    |
//! | `escalation`  | LLM auto-escalation policy                               |
//! | `streaming`   | LLM streaming callback wrapper                           |
//! | `background`  | Background compaction, embedding, recall-cache refresh   |

pub mod actions;
mod background;
pub mod config;
pub mod context_breakdown;
mod escalation;
mod streaming;
pub mod helpers;
mod lifecycle;
mod memory_bootstrap;
mod step_exec;
mod tool_actions;
mod dispatch;
mod tool_pipeline;
mod turn_loop;
mod turn_persistence;
mod voice_display;

// ── Public re-exports ────────────────────────────────────────────────────────

pub use actions::{emit_action_only, persist_and_emit_action};
pub use config::{ContextTracker, RunConfig};
pub use context_breakdown::{
    compute_context_breakdown, CompactionEvent, CompactionKind, ContextBreakdownPayload,
    ContextSection, LayerTotals, SectionCategory as ContextSectionCategory, layer_totals,
};
pub use helpers::{estimate_conversation_tokens, estimate_tokens};
pub use lifecycle::Runner;
