use crate::commands::{AppState, InitStatus};
use crate::error::{AppError, AppResult};
use crate::models::SystemMetrics;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn get_system_metrics(state: State<'_, AppState>) -> AppResult<SystemMetrics> {
    let mut hardware = state.hardware.lock().await;
    Ok(hardware.get_metrics())
}

#[tauri::command]
pub async fn get_system_status() -> AppResult<String> {
    Ok("OPERATIONAL".to_string())
}

#[tauri::command]
pub async fn get_init_status(state: State<'_, AppState>) -> AppResult<InitStatus> {
    Ok(state.init_progress.snapshot().await)
}

/// Canonical Tauri splash → main handoff helper. Closes the native splash
/// window and shows + focuses the main window. Idempotent: calling it when
/// either window is missing is a no-op.
///
/// Called from `set_complete` (frontend signal) AND from `lib.rs`
/// (backend-ready signal). Both call sites must agree on the rule:
/// "perform the handoff only when both `frontend_ready` and
/// `backend_ready` are true."
pub async fn perform_handoff(app: &AppHandle) {
    if let Some(splash) = app.get_webview_window("splashscreen") {
        splash.close().ok();
    }
    if let Some(main) = app.get_webview_window("main") {
        main.show().ok();
        main.set_focus().ok();
    }
}

/// Frontend signals that its own init hook (useAppInit) has finished. Rust
/// pairs this with `backend_ready` (set when core_complete becomes true);
/// when both are true, the splash is dismissed and the main window is
/// shown. Per https://v2.tauri.app/learn/splashscreen/.
#[tauri::command]
pub async fn set_complete(
    app: AppHandle,
    state: State<'_, AppState>,
    task: String,
) -> AppResult<()> {
    let mut flags = state.setup_flags.lock().await;
    match task.as_str() {
        "frontend" => flags.frontend_ready = true,
        "backend" => flags.backend_ready = true,
        other => {
            return Err(AppError::Internal(format!(
                "set_complete: unknown task '{}' (expected 'frontend' or 'backend')",
                other
            )));
        }
    }
    let both_ready = flags.both_ready();
    drop(flags);

    if both_ready {
        perform_handoff(&app).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_system_stats(state: State<'_, AppState>) -> AppResult<SystemMetrics> {
    let mut hardware = state.hardware.lock().await;
    Ok(hardware.get_metrics())
}

#[tauri::command]
pub async fn get_hardware_info(
    state: State<'_, AppState>,
) -> AppResult<crate::services::HardwareInfo> {
    let hardware = state.hardware.lock().await;
    Ok(hardware.get_info().clone())
}

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct FolderEntry {
    pub name: String,
    pub path: String,
    pub r#type: String,
}

#[derive(Serialize, Clone)]
pub struct BrowseFolderResult {
    pub current: String,
    pub parent: Option<String>,
    pub directories: Vec<FolderEntry>,
    pub entries: Vec<FolderEntry>,
}

#[tauri::command]
pub async fn browse_folder(path: Option<String>) -> AppResult<BrowseFolderResult> {
    let target = path.unwrap_or_else(|| {
        std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| "/".to_string())
    });

    let validated_path = crate::utils::validate_path(&target)?;
    let dir = std::fs::read_dir(&validated_path)
        .map_err(|e| crate::error::ZenError::Internal(format!("Cannot read directory: {}", e)))?;

    let mut dirs: Vec<FolderEntry> = Vec::new();
    let mut entries: Vec<FolderEntry> = Vec::new();

    for entry in dir {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let ft = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        let fpath = entry.path().to_string_lossy().to_string();
        let r#type = if ft.is_dir() { "dir" } else { "file" };
        let fe = FolderEntry {
            name,
            path: fpath,
            r#type: r#type.to_string(),
        };
        if ft.is_dir() {
            dirs.push(fe.clone());
        }
        entries.push(fe);
    }

    dirs.sort_by_key(|a| a.name.to_lowercase());
    entries.sort_by_key(|a| a.name.to_lowercase());

    let parent = std::path::Path::new(&target)
        .parent()
        .map(|p| p.to_string_lossy().to_string());

    Ok(BrowseFolderResult {
        current: target,
        parent,
        directories: dirs,
        entries,
    })
}
