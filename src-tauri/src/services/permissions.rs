//! Shim (BIG_MIGRATION.md Phase 4): the agent tool-allowlist checks live
//! in the `zen-security` crate (`checks` module). Re-exports keep call
//! sites compiling unchanged (relocation doctrine §4.6); deleted in
//! Phase 14.

pub use zen_security::checks::{
    enforce_tool_allowlist, from_agent_tool_ids, is_critical_floor, new_shared_allowlist,
    AllowlistDecision, ToolAllowlist,
};
