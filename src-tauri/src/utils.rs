use crate::error::{AppResult, ZenError};
use std::path::{Component, Path};
use std::sync::OnceLock;
use std::time::Duration;

static PUBLIC_NO_REDIRECT_HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static DUCKDUCKGO_HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static DEFAULT_HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static GTSM_HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static MODEL_DOWNLOAD_HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

pub fn public_no_redirect_http_client() -> &'static reqwest::Client {
    PUBLIC_NO_REDIRECT_HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("public no-redirect HTTP client configuration is valid")
    })
}

pub fn duckduckgo_http_client() -> &'static reqwest::Client {
    DUCKDUCKGO_HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; rv:135.0) Gecko/20100101 Firefox/135.0")
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .expect("DuckDuckGo HTTP client configuration is valid")
    })
}

pub fn default_http_client() -> &'static reqwest::Client {
    DEFAULT_HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("default HTTP client configuration is valid")
    })
}

pub fn gtsm_http_client() -> &'static reqwest::Client {
    GTSM_HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .user_agent("ZenGTSM/0.1 (operational-monitor)")
            .build()
            .expect("GTSM HTTP client configuration is valid")
    })
}

pub fn model_download_http_client() -> &'static reqwest::Client {
    MODEL_DOWNLOAD_HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
            .expect("model download HTTP client configuration is valid")
    })
}

/// Validates that a path is safe and does not attempt to traverse outside allowed boundaries.
///
/// Returns Ok(PathBuf) if safe, or Err if suspicious.
pub fn validate_path(path: &str) -> AppResult<std::path::PathBuf> {
    let p = Path::new(path);

    // Prevent absolute paths that might point to system directories if not explicitly allowed
    // For now, we allow them but verify they don't contain traversal components

    for component in p.components() {
        match component {
            Component::ParentDir => {
                return Err(ZenError::Internal(
                    "Security: Path traversal attempt detected (..) ".to_string(),
                ));
            }
            Component::RootDir => {
                // Root is allowed if we're browsing the whole disk,
                // but usually we want to restrict to a workspace.
                // For this app, we'll allow it for now but log it.
            }
            _ => {}
        }
    }

    let resolved = if p.exists() {
        p.canonicalize()
            .map_err(|e| ZenError::Internal(format!("Failed to resolve path: {}", e)))?
    } else {
        p.to_path_buf()
    };

    Ok(resolved)
}

/// Checks if a path is within a specific root directory.
pub fn is_path_in_root(path: &Path, root: &Path) -> bool {
    let path_abs = match path.canonicalize() {
        Ok(p) => p,
        Err(_) => return false, // Path doesn't exist or is invalid
    };
    let root_abs = match root.canonicalize() {
        Ok(p) => p,
        Err(_) => return false,
    };

    path_abs.starts_with(root_abs)
}
