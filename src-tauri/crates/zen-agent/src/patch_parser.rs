//! Shim (BIG_MIGRATION.md Phase 4): the patch parser moved to the
//! `zen-security` crate (the plan-mode write gate evaluates every hunk
//! target with it). Re-exports keep `crate::tools::patch_parser::` call
//! sites compiling unchanged (relocation doctrine §4.6); deleted in
//! Phase 14.

pub use zen_security::patch_parser::*;
