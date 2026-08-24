//! Runner support helpers, grouped by concern.
//!
//! Split out of the former single `helpers.rs` during BIG_MIGRATION.md
//! Phase 11. The re-exports below keep every existing
//! `runner::helpers::<item>` path working, so callers are untouched.

pub mod budget;
pub mod compact;
pub mod parse;

pub use budget::{
    estimate_conversation_tokens, estimate_tokens, truncate_to_budget, truncate_to_budget_tail,
    try_push_within_budget, MiddlewareBudgets, BPE,
};
pub use compact::{
    compact_conversation, compact_conversation_token_aware, compact_tool_result_for_context,
    parse_file_changes, truncate_conversation_by_message_count, FileReadTracker,
};
pub use parse::{
    generate_handoff_summary, is_tool_capability_error, parse_text_tool_calls, prune_stale_reads,
    strip_text_tool_call_blocks, try_parse_tool_json,
};
