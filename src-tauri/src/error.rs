//! App-side error boundary (BIG_MIGRATION.md Phase 2).
//!
//! `ZenError` now lives in zen-core and is DB/HTTP/tauri-agnostic; this
//! module re-exports it unchanged so every `crate::error::…` call site keeps
//! compiling, and owns the boundary conversions that keep `sqlx`, `reqwest`,
//! and `anyhow` out of zen-core. zen-db (Phase 3) will take over the sqlx
//! `#[from]` sugar with its own error type.

pub use zen_core::error::{AppError, AppResult, ZenError, ZenResult};

/// Map a raw `sqlx::Error` into the DB-agnostic core variant (message is
/// rendered identically to the pre-split `#[from]` shape).
pub fn db_err(e: sqlx::Error) -> ZenError {
    ZenError::Database(e.to_string())
}

/// Map a raw `reqwest::Error` into the core HTTP variant, preserving the
/// retry-classification signals (status code / timeout / connect) that
/// `reqwest::Error` would have exposed.
pub fn http_err(e: reqwest::Error) -> ZenError {
    ZenError::Http(zen_core::error::HttpError {
        message: e.to_string(),
        status: e.status().map(|s| s.as_u16()),
        timeout: e.is_timeout(),
        connect: e.is_connect(),
    })
}

/// Map an `anyhow::Error` into the core Other variant.
pub fn other_err(e: anyhow::Error) -> ZenError {
    ZenError::Other(e.to_string())
}


