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

pub mod config;
pub mod helpers;
#[allow(clippy::module_inception)]
mod r#loop;
pub mod actions;
mod escalation;
mod background;
mod tool_dispatch;

// ── Public re-exports ────────────────────────────────────────────────────────

pub use config::{RunConfig, ContextTracker};
pub use r#loop::{Runner, MAX_SPAWN_DEPTH};
pub use actions::{persist_and_emit_action, emit_action_only};
pub use helpers::{estimate_tokens, estimate_conversation_tokens};
