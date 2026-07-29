use serde_json::Value;
use tauri::{AppHandle, State};

use crate::commands::AppState;
use crate::error::{ZenError, ZenResult};
use crate::services::McpServerEntry;

/// Read the `.mcp.json` configuration from the active workspace.
/// Returns an empty `{"mcpServers": {}}` payload if no file exists yet.
#[tauri::command]
pub async fn mcp_get_config(state: State<'_, AppState>) -> ZenResult<Value> {
    state
        .mcp_config
        .read_config()
        .await
        .map_err(|e| ZenError::Custom(format!("MCP config read failed: {}", e)))
}

/// Persist a new `.mcp.json` configuration in the active workspace.
#[tauri::command]
pub async fn mcp_save_config(state: State<'_, AppState>, config: Value) -> ZenResult<()> {
    state
        .mcp_config
        .save_config(config)
        .await
        .map_err(|e| ZenError::Custom(format!("MCP config save failed: {}", e)))
}

/// Typed read: list every server declared in `.mcp.json` with its
/// canonical `url`. Entries missing `url` are filtered out
/// best-effort (a partially hand-authored file still surfaces its
/// valid rows). This command does NOT trigger a sync — the boot path
/// in `lib.rs` already covers startup, and the typed CRUD
/// (`mcp_add_server` / `mcp_remove_server` / `mcp_reconnect`) is the
/// in-session way to refresh connections.
#[tauri::command]
pub async fn mcp_list_servers(
    state: State<'_, AppState>,
) -> ZenResult<Vec<McpServerEntry>> {
    state
        .mcp_config
        .list_servers()
        .await
        .map_err(|e| ZenError::Custom(format!("MCP list servers failed: {}", e)))
}

/// Upsert `mcpServers[name].url = url`, preserving any unrelated
/// sibling fields on the entry object. After persisting, spawns a
/// background `sync_external_servers` so the new row is reachable
/// without restarting the app. The UI listens for per-row
/// `mcp:server:status` events to update its status pills.
#[tauri::command]
pub async fn mcp_add_server(
    state: State<'_, AppState>,
    app: AppHandle,
    name: String,
    url: String,
) -> ZenResult<()> {
    state
        .mcp_config
        .add_server(&name, &url)
        .await
        .map_err(|e| ZenError::Custom(format!("MCP add server failed: {}", e)))?;
    let client = state.mcp_client.clone();
    tokio::spawn(async move {
        client.sync_external_servers(Some(&app)).await;
    });
    Ok(())
}

/// Remove `mcpServers[name]` (no-op if absent). When the row is
/// actually deleted, spawns a background `sync_external_servers` so
/// the cleared row's adapters are wiped and any remaining rows are
/// re-handshaken. Returns whether the row existed.
#[tauri::command]
pub async fn mcp_remove_server(
    state: State<'_, AppState>,
    app: AppHandle,
    name: String,
) -> ZenResult<bool> {
    let removed = state
        .mcp_config
        .remove_server(&name)
        .await
        .map_err(|e| ZenError::Custom(format!("MCP remove server failed: {}", e)))?;
    if removed {
        let client = state.mcp_client.clone();
        tokio::spawn(async move {
            client.sync_external_servers(Some(&app)).await;
        });
    }
    Ok(removed)
}

/// Force-reconnect to every server in `.mcp.json` without modifying
/// the config. Useful after a transient outage or when an operator
/// edited `.mcp.json` by hand. Each row hands out
/// `mcp:server:status` events to the UI as the sync progresses.
#[tauri::command]
pub async fn mcp_reconnect(
    state: State<'_, AppState>,
    app: AppHandle,
) -> ZenResult<()> {
    let client = state.mcp_client.clone();
    tokio::spawn(async move {
        client.sync_external_servers(Some(&app)).await;
    });
    Ok(())
}
