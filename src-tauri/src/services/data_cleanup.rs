use crate::error::AppResult;
use crate::services::SecretService;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize)]
pub struct ZenDataItem {
    pub category: String,
    pub path: String,
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ZenDataStatus {
    pub has_previous_data: bool,
    pub items: Vec<ZenDataItem>,
    pub restart_required: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ZenCleanupResult {
    pub removed_categories: Vec<String>,
    pub failed_categories: Vec<String>,
    pub restart_required: bool,
    pub message: String,
}

pub fn known_data_items(app_data_dir: &Path) -> Vec<(String, PathBuf)> {
    let mut items = Vec::new();
    for database in ["novus.db", "novus-dev.db"] {
        let path = app_data_dir.join(database);
        items.push(("database".to_string(), path.clone()));
        for suffix in ["-wal", "-shm", "-journal"] {
            items.push(("database-sidecar".to_string(), PathBuf::from(format!("{}{}", path.display(), suffix))));
        }
    }
    for (category, name) in [
        ("vector-store", "lancedb"),
        ("vector-store", "lancedb-dev"),
        ("runtimes", "runtimes"),
        ("models", "models"),
        ("voices", "voices"),
        ("media", "media"),
        ("checkpoints", "checkpoints"),
        ("logs", "logs"),
    ] {
        items.push((category.to_string(), app_data_dir.join(name)));
    }
    items
}

pub fn inspect(app_data_dir: &Path) -> ZenDataStatus {
    let items = known_data_items(app_data_dir)
        .into_iter()
        .map(|(category, path)| ZenDataItem {
            exists: path.exists(),
            category,
            path: path.display().to_string(),
        })
        .collect::<Vec<_>>();
    ZenDataStatus {
        has_previous_data: items.iter().any(|item| item.exists),
        items,
        restart_required: false,
    }
}

const RESET_MARKER: &str = ".zen-reset-pending";

pub async fn reset_settings_and_secrets(
    settings: &crate::services::SettingsService,
    secrets: Arc<SecretService>,
    custom_provider_ids: &[String],
) -> AppResult<ZenCleanupResult> {
    secrets.delete_known_secrets(custom_provider_ids).await?;
    settings.clear().await?;
    Ok(ZenCleanupResult {
        removed_categories: vec!["settings".to_string(), "keyring".to_string()],
        failed_categories: Vec::new(),
        restart_required: false,
        message: "Settings and registered API keys were removed. Chats and downloaded runtimes were preserved.".to_string(),
    })
}

pub async fn request_full_reset(
    app_data_dir: &Path,
    secrets: Arc<SecretService>,
    custom_provider_ids: &[String],
) -> AppResult<ZenCleanupResult> {
    secrets.delete_known_secrets(custom_provider_ids).await?;
    std::fs::write(app_data_dir.join(RESET_MARKER), b"confirmed")
        .map_err(|error| crate::error::ZenError::Custom(format!("Could not schedule Zen data cleanup: {error}")))?;
    Ok(ZenCleanupResult {
        removed_categories: vec!["keyring".to_string()],
        failed_categories: Vec::new(),
        restart_required: true,
        message: "API keys were removed. Restart Zen to remove databases and downloaded data safely.".to_string(),
    })
}

/// Apply a previously confirmed reset before opening SQLite/LanceDB resources.
pub fn apply_pending_reset(app_data_dir: &Path) -> std::io::Result<bool> {
    let marker = app_data_dir.join(RESET_MARKER);
    if !marker.exists() {
        return Ok(false);
    }
    let mut failed = false;
    for (_, path) in known_data_items(app_data_dir) {
        if !path.exists() { continue; }
        let result = if path.is_dir() { std::fs::remove_dir_all(&path) } else { std::fs::remove_file(&path) };
        if result.is_err() { failed = true; }
    }
    if !failed { let _ = std::fs::remove_file(marker); }
    Ok(true)
}
