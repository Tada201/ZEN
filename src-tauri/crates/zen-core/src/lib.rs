//! zen-core — shared leaf crate for the Zen backend workspace
//! (BIG_MIGRATION.md Phase 2).
//!
//! Owns the DB/HTTP/tauri-agnostic error contract, cross-crate wire/domain
//! DTOs (`ToolInfo`, `ProviderConfig`, `SystemMetrics`), and the port traits
//! (seams) that upper crates depend on instead of reaching up into the app
//! crate. Hard rules: no `tauri`, no `sqlx`, no `reqwest`, no `anyhow` here —
//! adapters convert at their boundary (see app `src/error.rs` helpers).

pub mod error;
pub mod ports;
mod types;

pub use types::{ProviderConfig, SystemMetrics, ToolInfo};
