//! Shim (BIG_MIGRATION.md Phase 4): SSRF-safe URL validation and
//! DNS-pinned client builders live in the `zen-security` crate. Re-exports
//! keep every `crate::tools::url_safety::` call site compiling unchanged
//! (relocation doctrine §4.6); the shim is deleted in Phase 14.

pub use zen_security::url_safety::*;
