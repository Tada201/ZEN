//! Tauri commands driving the embedded browser-preview webview from the UI.
//! URL input is re-validated Rust-side (renderer never hands a raw URL to the
//! privileged webview). Address-bar navigation permits loopback dev servers;
//! non-address-bar callers do not.

use tauri::{AppHandle, State};

use crate::browser::{ConsoleEntry, PreviewBounds};
use crate::commands::AppState;
use crate::error::{ZenError, ZenResult};

fn map_err(e: String) -> ZenError {
    ZenError::Custom(e)
}

#[tauri::command]
pub async fn browser_preview_attach(
    app: AppHandle,
    state: State<'_, AppState>,
    bounds: PreviewBounds,
    url: String,
    allow_loopback: Option<bool>,
) -> ZenResult<String> {
    state
        .browser
        .attach(&app, bounds, &url, allow_loopback.unwrap_or(false))
        .map_err(map_err)
}

#[tauri::command]
pub async fn browser_preview_set_bounds(
    app: AppHandle,
    state: State<'_, AppState>,
    bounds: PreviewBounds,
) -> ZenResult<()> {
    state.browser.set_bounds(&app, bounds).map_err(map_err)
}

#[tauri::command]
pub async fn browser_preview_navigate(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
    allow_loopback: Option<bool>,
) -> ZenResult<String> {
    state
        .browser
        .navigate(&app, &url, allow_loopback.unwrap_or(false))
        .map_err(map_err)
}

#[tauri::command]
pub async fn browser_preview_reload(app: AppHandle, state: State<'_, AppState>) -> ZenResult<()> {
    state.browser.reload(&app).map_err(map_err)
}

#[tauri::command]
pub async fn browser_preview_hide(app: AppHandle, state: State<'_, AppState>) -> ZenResult<()> {
    state.browser.hide(&app).map_err(map_err)
}

#[tauri::command]
pub async fn browser_preview_detach(app: AppHandle, state: State<'_, AppState>) -> ZenResult<()> {
    state.browser.detach(&app).map_err(map_err)
}

#[tauri::command]
pub async fn browser_preview_console_tail(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> ZenResult<Vec<ConsoleEntry>> {
    Ok(state.browser.console_tail(limit.unwrap_or(200).min(500)))
}
