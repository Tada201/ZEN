use crate::commands::{AppState, InitStatus};
use crate::error::{AppError, AppResult};
use crate::models::SystemMetrics;
use tauri::{AppHandle, Emitter, Manager, State};
use std::sync::OnceLock;
use tokio::sync::oneshot;

type ExternalPromptState = Option<(String, oneshot::Sender<bool>)>;
static EXTERNAL_PROMPT: OnceLock<tokio::sync::Mutex<ExternalPromptState>> = OnceLock::new();

#[tauri::command]
pub async fn resolve_external_prompt(app: AppHandle, operation: String, confirmed: bool) -> AppResult<()> {
    let mutex = EXTERNAL_PROMPT.get_or_init(|| tokio::sync::Mutex::new(None));
    let mut pending = mutex.lock().await;
    if let Some((expected, sender)) = pending.take() {
        if expected != operation { return Err(crate::error::ZenError::Custom("Stale external prompt response".to_string())); }
        let _ = sender.send(confirmed);
        if let Some(window) = app.get_webview_window("prompt") { window.close().ok(); }
        Ok(())
    } else {
        Err(crate::error::ZenError::Custom("No external prompt is pending".to_string()))
    }
}

#[tauri::command]
pub async fn open_external_prompt(app: AppHandle, operation: String) -> AppResult<bool> {
    Ok(request_external_prompt(&app, &operation).await)
}

pub async fn request_external_prompt(app: &AppHandle, operation: &str) -> bool {
    let mutex = EXTERNAL_PROMPT.get_or_init(|| tokio::sync::Mutex::new(None));
    let (sender, receiver) = oneshot::channel();
    {
        let mut pending = mutex.lock().await;
        *pending = Some((operation.to_string(), sender));
    }
    if let Some(window) = app.get_webview_window("prompt") {
        let _ = app.emit_to("prompt", "external-prompt-request", operation);
        let _ = window.show();
        let _ = window.set_focus();
    }
    receiver.await.unwrap_or(false)
}

#[tauri::command]
pub async fn relaunch_app(app: AppHandle) -> AppResult<()> {
    let executable = std::env::current_exe()
        .map_err(|error| crate::error::ZenError::Custom(format!("Could not resolve Zen executable: {error}")))?;
    std::process::Command::new(executable)
        .args(std::env::args_os().skip(1))
        .spawn()
        .map_err(|error| crate::error::ZenError::Custom(format!("Could not relaunch Zen: {error}")))?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub async fn export_diagnostics(
    app: AppHandle,
    state: State<'_, AppState>,
    destination: String,
) -> AppResult<()> {
    let app_dir = app.path().app_data_dir().map_err(|error| crate::error::ZenError::Custom(format!("Could not resolve app data directory: {error}")))?;
    let destination = std::path::PathBuf::from(destination);
    let parent = destination.parent().ok_or_else(|| crate::error::ZenError::Custom("Diagnostics destination has no parent directory".to_string()))?;
    std::fs::create_dir_all(parent).map_err(|error| crate::error::ZenError::Custom(format!("Could not prepare diagnostics destination: {error}")))?;
    let data_status = crate::services::data_cleanup::inspect(&app_dir);
    // MCP protocol status: only safe inventory metadata (transport/availability/
    // negotiated protocol era + capabilities). Commands, URLs, headers, env
    // values, and server payloads are never included.
    state.mcp_discovery.refresh().await.ok();
    let mcp = state.mcp_discovery.snapshot().await;
    let mcp_servers = mcp.servers.iter().map(|record| serde_json::json!({
        "scope": record.scope,
        "transport": record.transport,
        "availability": record.availability,
        "protocol_era": record.protocol_era,
        "protocol_version": record.protocol_version,
        "capabilities": record.capabilities,
        "tool_count": record.tool_count,
        "last_error_code": record.last_error_code,
    })).collect::<Vec<_>>();
    let payload = serde_json::json!({
        "format": 1,
        "app_version": env!("CARGO_PKG_VERSION"),
        "platform": std::env::consts::OS,
        "architecture": std::env::consts::ARCH,
        "data_categories": data_status.items.iter().map(|item| serde_json::json!({ "category": item.category, "exists": item.exists })).collect::<Vec<_>>(),
        "mcp": {
            "supported_protocol_versions": [
                crate::mcp::types::MODERN_PROTOCOL_VERSION,
                crate::mcp::types::PROTOCOL_VERSION,
            ],
            "server_count": mcp_servers.len(),
            "servers": mcp_servers,
        },
        "note": "Secrets, chats, database contents, file paths, MCP server names/URLs/commands, and raw logs are intentionally excluded.",
    });
    let bytes = serde_json::to_vec_pretty(&payload).map_err(|error| crate::error::ZenError::Custom(format!("Could not serialize diagnostics: {error}")))?;
    std::fs::write(destination, bytes).map_err(|error| crate::error::ZenError::Custom(format!("Could not write diagnostics: {error}")))?;
    Ok(())
}

#[tauri::command]
pub async fn get_system_metrics(state: State<'_, AppState>) -> AppResult<SystemMetrics> {
    let mut hardware = state.hardware.lock().await;
    Ok(hardware.get_metrics())
}

#[tauri::command]
pub async fn get_system_status() -> AppResult<String> {
    Ok("OPERATIONAL".to_string())
}

/// Returns the local account name for the short, local-only welcome message.
#[tauri::command]
pub async fn get_user_display_name() -> AppResult<String> {
    let name = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "there".to_string());
    Ok(name)
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
        // Tell the React boot overlay to begin only after the native handoff
        // is ready. Otherwise a cold start can consume the whole animation
        // while the main window is still hidden behind the splashscreen.
        let _ = app.emit("zen:main-visible", ());
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
                "set_complete: unknown task '{other}' (expected 'frontend' or 'backend')"
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
    Ok(hardware.get_info())
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
        .map_err(|e| crate::error::ZenError::Internal(format!("Cannot read directory: {e}")))?;

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
