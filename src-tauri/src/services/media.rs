use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::Manager;
use uuid::Uuid;

use zen_core::error::{AppResult, ZenError};

const WALLPAPERS_SUBDIR: &str = "media/wallpapers";

/// Owns the user-picked wallpaper lifecycle.
///
/// Invariants:
///   * Wallpapers live under `$APPDATA/media/wallpapers/` (isolated from `generated_images/`).
///   * At most one wallpaper file exists at a time.
///   * Switching wallpaper evicts the previous file before returning success.
///
/// This service is intentionally **stateless with respect to the settings store**: it
/// only owns the file lifecycle. The frontend is responsible for persisting the returned
/// path to `ui.background-image` via the existing `settingsApi` flow, which keeps the
/// React/Zustand store and SQLite in sync without a second write path.
pub struct MediaService {
    app_data_dir: OnceLock<PathBuf>,
}

impl Default for MediaService {
    fn default() -> Self {
        Self::new()
    }
}

impl MediaService {
    pub fn new() -> Self {
        Self {
            app_data_dir: OnceLock::new(),
        }
    }

    /// Called once during app setup, after the AppHandle is available.
    pub fn setup(&self, app: &tauri::AppHandle) -> AppResult<()> {
        let dir = app.path().app_data_dir().map_err(|e| {
            ZenError::Internal(format!("Failed to resolve AppData directory: {e}"))
        })?;
        self.app_data_dir
            .set(dir)
            .map_err(|_| ZenError::Internal("MediaService setup called more than once".to_string()))?;
        Ok(())
    }

    fn app_data_dir(&self) -> AppResult<&PathBuf> {
        self.app_data_dir.get().ok_or_else(|| {
            ZenError::Internal("MediaService not initialized; call setup() first".to_string())
        })
    }

    /// Absolute path to the wallpapers directory. Creates it on first access.
    pub async fn wallpapers_dir(&self) -> AppResult<PathBuf> {
        let dir = self.app_data_dir()?.join(WALLPAPERS_SUBDIR);
        if !dir.exists() {
            tokio::fs::create_dir_all(&dir).await.map_err(|e| {
                ZenError::Internal(format!("Failed to create wallpapers directory: {e}"))
            })?;
        }
        Ok(dir)
    }

    /// Copy `source` into the wallpapers dir, evict any prior wallpaper, and return
    /// the absolute path of the new file with forward slashes (URL-friendly). The
    /// caller is responsible for persisting the returned path to `ui.background-image`
    /// via the settings store.
    ///
    /// We deliberately do NOT call `tokio::fs::canonicalize` here — on Windows it
    /// returns extended-length paths with a `\\?\` prefix (e.g. `\\?\C:\Users\...`),
    /// which does not match the scope pattern `$APPDATA/media/wallpapers/**` (no
    /// prefix) and would cause every asset load to 403. The path we constructed
    /// ourselves is already absolute and the file exists (we just wrote it).
    pub async fn set_wallpaper(&self, source: &Path) -> AppResult<PathBuf> {
        if !source.is_file() {
            return Err(ZenError::Internal(format!(
                "Wallpaper source is not a file: {}",
                source.display()
            )));
        }

        let dir = self.wallpapers_dir().await?;

        // Snapshot the existing wallpaper (if any) before writing the new one so we can
        // evict by exact path and avoid deleting the file we just copied.
        let previous = first_file_in(&dir).await;

        let ext = source
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        let new_path = dir.join(format!("wallpaper_{}.{}", Uuid::new_v4(), ext));

        tokio::fs::copy(source, &new_path)
            .await
            .map_err(|e| {
                ZenError::Internal(format!(
                    "Failed to copy wallpaper into app folder: {e}"
                ))
            })?;

        if let Some(prev) = previous {
            if prev != new_path {
                if let Err(e) = tokio::fs::remove_file(&prev).await {
                    tracing::warn!(
                        error = %e,
                        path = %prev.display(),
                        "Failed to evict previous wallpaper (new wallpaper is in place)"
                    );
                }
            }
        }

        // Normalize to forward slashes for cleaner asset URLs and consistent scope matching.
        let normalized: PathBuf = new_path.to_string_lossy().replace('\\', "/").into();
        Ok(normalized)
    }

    /// Delete the active wallpaper file (if any). Returns `true` if a file was removed.
    pub async fn clear_wallpaper(&self) -> AppResult<bool> {
        self.evict_all().await
    }

    /// Absolute path of the active wallpaper (forward-slashed), or None if no wallpaper is set.
    pub async fn current_wallpaper(&self) -> AppResult<Option<PathBuf>> {
        let dir = self.wallpapers_dir().await?;
        match first_file_in(&dir).await {
            Some(p) => {
                // Same `\\?\`-prefix avoidance as `set_wallpaper`.
                let normalized: PathBuf = p.to_string_lossy().replace('\\', "/").into();
                Ok(Some(normalized))
            }
            None => Ok(None),
        }
    }

    async fn evict_all(&self) -> AppResult<bool> {
        let dir = self.wallpapers_dir().await?;
        let mut entries = tokio::fs::read_dir(&dir).await.map_err(|e| {
            ZenError::Internal(format!("Failed to read wallpapers directory: {e}"))
        })?;
        let mut removed = false;
        while let Some(entry) = entries.next_entry().await.map_err(|e| {
            ZenError::Internal(format!("Failed to iterate wallpapers directory: {e}"))
        })? {
            let path = entry.path();
            if path.is_file() {
                if let Err(e) = tokio::fs::remove_file(&path).await {
                    tracing::warn!(error = %e, path = %path.display(), "Failed to delete wallpaper file");
                    continue;
                }
                removed = true;
            }
        }
        Ok(removed)
    }
}

async fn first_file_in(dir: &Path) -> Option<PathBuf> {
    let mut entries = tokio::fs::read_dir(dir).await.ok()?;
    while let Some(entry) = entries.next_entry().await.ok()? {
        let path = entry.path();
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    /// Build a MediaService rooted at a custom AppData dir (skips Tauri's app handle).
    fn service_for_dir(dir: &Path) -> MediaService {
        let svc = MediaService::new();
        svc.app_data_dir.set(dir.to_path_buf()).unwrap();
        svc
    }

    #[tokio::test]
    async fn set_wallpaper_copies_and_creates_dir() {
        let tmp = TempDir::new().unwrap();
        let svc = service_for_dir(tmp.path());

        let src = tmp.path().join("source.mp4");
        tokio::fs::write(&src, b"fake-video-bytes").await.unwrap();

        let abs = svc
            .set_wallpaper(&src)
            .await
            .expect("copy should succeed");

        assert!(abs.is_file());
        assert!(abs.starts_with(tmp.path().join("media/wallpapers")));
    }

    #[tokio::test]
    async fn set_wallpaper_evicts_previous_to_maintain_single_copy() {
        let tmp = TempDir::new().unwrap();
        let svc = service_for_dir(tmp.path());

        // First wallpaper
        let src1 = tmp.path().join("a.mp4");
        tokio::fs::write(&src1, b"first").await.unwrap();
        let abs1 = svc.set_wallpaper(&src1).await.unwrap();

        // Second wallpaper
        let src2 = tmp.path().join("b.png");
        tokio::fs::write(&src2, b"second").await.unwrap();
        let abs2 = svc.set_wallpaper(&src2).await.unwrap();

        // Old file must be gone
        assert!(!abs1.exists(), "previous wallpaper should have been evicted");
        // New file must be present
        assert!(abs2.is_file(), "new wallpaper should exist");

        // Directory must contain exactly one file
        let dir = svc.wallpapers_dir().await.unwrap();
        let mut count = 0;
        let mut entries = tokio::fs::read_dir(&dir).await.unwrap();
        while let Some(entry) = entries.next_entry().await.unwrap() {
            if entry.path().is_file() {
                count += 1;
            }
        }
        assert_eq!(count, 1, "wallpapers directory must hold exactly one file");
    }

    #[tokio::test]
    async fn set_wallpaper_rejects_missing_source() {
        let tmp = TempDir::new().unwrap();
        let svc = service_for_dir(tmp.path());

        let bogus = tmp.path().join("does-not-exist.mp4");
        let err = svc.set_wallpaper(&bogus).await.unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("not a file"), "unexpected error: {msg}");
    }

    #[tokio::test]
    async fn clear_wallpaper_removes_file() {
        let tmp = TempDir::new().unwrap();
        let svc = service_for_dir(tmp.path());

        let src = tmp.path().join("c.mp4");
        tokio::fs::write(&src, b"x").await.unwrap();
        svc.set_wallpaper(&src).await.unwrap();
        assert!(svc.current_wallpaper().await.unwrap().is_some());

        let removed = svc.clear_wallpaper().await.unwrap();
        assert!(removed);
        assert!(svc.current_wallpaper().await.unwrap().is_none());
    }
}
