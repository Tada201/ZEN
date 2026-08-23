//! Shim (BIG_MIGRATION.md Phase 3): SQLite ownership lives in the `zen-db`
//! crate. These re-exports keep every `crate::db::` call site compiling
//! unchanged (relocation doctrine §4.6); the shim is deleted in Phase 14.

pub use zen_db::{init_pool, models, queries};
