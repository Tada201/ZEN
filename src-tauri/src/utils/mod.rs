
use zen_core::error::{AppResult, ZenError};
use std::path::{Component, Path};
use std::sync::OnceLock;
use std::time::Duration;
use tauri::Manager;

static PUBLIC_NO_REDIRECT_HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static DUCKDUCKGO_HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static GTSM_HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

// `default_http_client` and `model_download_http_client` moved to the
// zen-media crate in Phase 10 (its speech/tts services need them and it must
// stay tauri-free). Re-exported here so existing `crate::utils::*` call sites
// keep the same path and there is a single client instance (SSOT).
pub use zen_media::http::{default_http_client, model_download_http_client};

pub fn public_no_redirect_http_client() -> &'static reqwest::Client {
    PUBLIC_NO_REDIRECT_HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap_or_else(|e| panic!("public no-redirect HTTP client configuration is invalid: {e}"))
    })
}

pub fn duckduckgo_http_client() -> &'static reqwest::Client {
    DUCKDUCKGO_HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; rv:135.0) Gecko/20100101 Firefox/135.0")
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .unwrap_or_else(|e| panic!("DuckDuckGo HTTP client configuration is invalid: {e}"))
    })
}

pub fn gtsm_http_client() -> &'static reqwest::Client {
    GTSM_HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .user_agent("ZenGTSM/0.1 (operational-monitor)")
            .build()
            .unwrap_or_else(|e| panic!("GTSM HTTP client configuration is invalid: {e}"))
    })
}

pub fn validate_path(path: &str) -> AppResult<std::path::PathBuf> {
    let p = Path::new(path);
    for component in p.components() {
        match component {
            Component::ParentDir => {
                return Err(ZenError::Internal(
                    "Security: Path traversal attempt detected (..) ".to_string(),
                ));
            }
            Component::RootDir => {}
            _ => {}
        }
    }
    let resolved = if p.exists() {
        p.canonicalize()
            .map_err(|e| ZenError::Internal(format!("Failed to resolve path: {e}")))?
    } else {
        p.to_path_buf()
    };
    Ok(resolved)
}

pub fn is_path_in_root(path: &Path, root: &Path) -> bool {
    let path_abs = match path.canonicalize() {
        Ok(p) => p,
        Err(_) => return false,
    };
    let root_abs = match root.canonicalize() {
        Ok(p) => p,
        Err(_) => return false,
    };
    path_abs.starts_with(root_abs)
}

pub fn validate_generated_image_path(app: &tauri::AppHandle, filename: &str) -> AppResult<std::path::PathBuf> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| {
        ZenError::Internal(format!("Failed to resolve AppData directory: {e}"))
    })?;
    let generated_images_dir = app_data_dir.join("generated_images");
    let clean_filename = Path::new(filename)
        .file_name()
        .ok_or_else(|| ZenError::Internal("Invalid filename".to_string()))?
        .to_string_lossy()
        .into_owned();
    if !clean_filename.starts_with("image_") || !clean_filename.ends_with(".png") {
        return Err(ZenError::Internal("Security check failed: Input is not an app-generated image asset".to_string()));
    }
    let source_path = generated_images_dir.join(&clean_filename);
    let resolved_source = source_path.canonicalize().map_err(|e| {
        ZenError::Internal(format!("Image file does not exist or invalid path: {e}"))
    })?;
    if !is_path_in_root(&resolved_source, &generated_images_dir) {
        return Err(ZenError::Internal("Security check failed: Target path lies outside generated_images directory".to_string()));
    }
    if !resolved_source.is_file() {
        return Err(ZenError::Internal("Security check failed: Path is not a file".to_string()));
    }
    Ok(resolved_source)
}

pub fn validate_remote_auth_safety(url_str: &str, has_token: bool) -> AppResult<()> {
    if !has_token {
        return Ok(());
    }
    let parsed = url::Url::parse(url_str).map_err(|e| {
        ZenError::Internal(format!("Invalid URL format: {e}"))
    })?;
    let is_loopback = if let Some(host) = parsed.host_str() {
        host == "localhost" || host == "127.0.0.1" || host == "[::1]"
    } else {
        false
    };
    let is_https = parsed.scheme() == "https";
    if !is_https && !is_loopback {
        return Err(ZenError::Internal(
            "Security violation: Bearer tokens / API keys cannot be transmitted over plaintext remote connections. Use HTTPS or localhost.".to_string()
        ));
    }
    Ok(())
}
