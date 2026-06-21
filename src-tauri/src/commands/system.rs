use crate::commands::{AppState, InitStatus};
use crate::error::AppResult;
use crate::models::SystemMetrics;
use tauri::State;

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
