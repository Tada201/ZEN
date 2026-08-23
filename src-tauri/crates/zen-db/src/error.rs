//! zen-db error type (BIG_MIGRATION.md Phase 2 pre-task design, realized in
//! Phase 3): this crate may own `#[from] sqlx::Error` — zen-core may not.
//! The public query API keeps returning `zen_core::ZenResult` so app call
//! sites never convert; `Error` restores `?` sugar for internal helpers and
//! is available to future crate consumers (zen-security persists decisions
//! through it in Phase 4).

use zen_core::ZenError;

/// zen-db-local error: carries the raw `sqlx::Error` so internal code can
/// use `?` directly, and converts losslessly into the core contract.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

impl Error {
    /// Convert into the app-wide error contract, rendering exactly like the
    /// pre-migration `db_err` helper (`Database(sqlx_display)`).
    pub fn into_zen(self) -> ZenError {
        match self {
            Error::Sqlx(e) => ZenError::Database(e.to_string()),
            Error::Io(e) => ZenError::Io(e),
            Error::Json(e) => ZenError::Json(e),
        }
    }
}

/// Boundary helper used by the query layer: render a raw sqlx error into the
/// DB-agnostic core variant. Behavior-identical to the app-side helper from
/// Phase 2 (same display string).
pub(crate) fn db_err(e: sqlx::Error) -> ZenError {
    ZenError::Database(e.to_string())
}
