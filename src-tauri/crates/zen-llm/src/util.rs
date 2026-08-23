//! Shared HTTP error mapping for provider clients (Phase 7).
//!
//! Verbatim twin of the app crate's `error::http_err` — zen-llm cannot depend
//! on the app, and zen-core must stay reqwest-free. Phase 14 may move this
//! into a shared adapter crate if a third consumer appears.

use zen_core::{ZenError, ZenResult};

/// Map a `reqwest::Error` into the core `Http` variant, preserving the
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

/// Convenience alias so call sites read like the app crate's.
pub type AppZenResult<T> = ZenResult<T>;
