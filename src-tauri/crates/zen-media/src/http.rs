//! Shared reqwest clients used by the media runtimes (BIG_MIGRATION.md
//! Phase 10). Extracted from the app crate's tauri-tainted `utils/mod.rs`;
//! only the two tauri-free helpers the media services need live here. The
//! app crate re-exports these so its own call sites keep the same paths.

use std::sync::OnceLock;
use std::time::Duration;

static DEFAULT_HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static MODEL_DOWNLOAD_HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

pub fn default_http_client() -> &'static reqwest::Client {
    DEFAULT_HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_else(|e| panic!("default HTTP client configuration is invalid: {e}"))
    })
}

pub fn model_download_http_client() -> &'static reqwest::Client {
    MODEL_DOWNLOAD_HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
            .unwrap_or_else(|e| panic!("model download HTTP client configuration is invalid: {e}"))
    })
}
