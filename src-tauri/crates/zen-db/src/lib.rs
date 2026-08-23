//! zen-db — SQLite ownership for the Zen backend (BIG_MIGRATION.md Phase 3).
//!
//! Pool construction, inline schema migrations, row models, and every SQL
//! query live here (RULES.md: SQL only under `queries/*`). No `tauri`; the
//! app crate implements the boot path and re-exports this crate from
//! `crate::db` so existing call sites compile unchanged (shim doctrine §4.6).

pub mod models;
pub mod queries;

mod migrations;
pub mod error;
mod pool;

pub use pool::init_pool;

pub(crate) use error::db_err;

pub use zen_core::{ZenError, ZenResult};
