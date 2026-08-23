//! Shim (BIG_MIGRATION.md Phase 4): secret-key classification lives in
//! the `zen-security` crate (`secrets` module). Re-exports keep call sites
//! compiling unchanged (relocation doctrine §4.6); deleted in Phase 14.

pub use zen_security::secrets::{
    is_secret_key, is_secret_placeholder_write, redact_if_secret, SECRET_PRESENT_SENTINEL,
};
