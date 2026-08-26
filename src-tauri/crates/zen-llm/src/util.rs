//! Shared HTTP error mapping for provider clients.
//!
//! Deliberate twin of the app crate's `error::http_err`: zen-llm cannot depend
//! on the app, and zen-core must stay reqwest-free. If a third consumer ever
//! needs it, hoist it into a shared adapter crate rather than adding reqwest to
//! zen-core.

use zen_core::ZenError;

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
