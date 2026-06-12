//! Agent runner, split into focused submodules.
//!
//! | Module        | Responsibility                                           |
//! |---------------|----------------------------------------------------------|
//! | `config`      | `RunConfig`, `ContextTracker`                            |
//! | `helpers`     | Token estimation, conversation utils, tool call parsing  |
//! | `loop`        | `Runner` struct + main `run()` agent loop                |
//! | `actions`     | Action timeline: persist_and_emit_action, emit_action_only |
//! | `escalation`  | LLM auto-escalation + streaming callback wrapper         |
//! | `background`  | Background compaction, embedding, recall-cache refresh   |

pub mod actions;
mod background;
pub mod config;
mod escalation;
pub mod helpers;
mod lifecycle;
#[allow(clippy::module_inception)]
mod r#loop;
mod memory_bootstrap;
mod tool_actions;
mod tool_dispatch;
mod tool_pipeline;
mod turn_persistence;
mod voice_display;

// ── Public re-exports ────────────────────────────────────────────────────────

pub use actions::{emit_action_only, persist_and_emit_action};
pub use config::{ContextTracker, RunConfig};
pub use helpers::{estimate_conversation_tokens, estimate_tokens};
pub use lifecycle::Runner;
pub use r#loop::MAX_SPAWN_DEPTH;
