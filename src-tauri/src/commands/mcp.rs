use crate::commands::AppState;
use crate::error::ZenResult;
use serde_json::Value;
use std::fs;
use tauri::State;

#[tauri::command]
pub async fn mcp_get_config(state: State<'_, AppState>) -> ZenResult<Value> {
    let ws = state.workspace_folder.read().await;
    let path = ws.join(".mcp.json");
    if path.exists() {
        let content = fs::read_to_string(&path)?;
        let val: Value = serde_json::from_str(&content)?;
        Ok(val)
    } else {
        // Fallback to project root / current directory
        let fallback_path = std::env::current_dir()?.join(".mcp.json");
        if fallback_path.exists() {
            let content = fs::read_to_string(&fallback_path)?;
            let val: Value = serde_json::from_str(&content)?;
            Ok(val)
        } else {
            Ok(serde_json::json!({ "mcpServers": {} }))
        }
    }
}

#[tauri::command]
pub async fn mcp_save_config(state: State<'_, AppState>, config: Value) -> ZenResult<()> {
    let ws = state.workspace_folder.read().await;
    let path = ws.join(".mcp.json");
    let content = serde_json::to_string_pretty(&config)?;
    fs::write(&path, content)?;
    Ok(())
}

#[tauri::command]
pub async fn mcp_get_status(state: State<'_, AppState>) -> ZenResult<Value> {
    let server = state.mcp_server.read().await;
    Ok(server.get_info())
}

#[tauri::command]
pub async fn mcp_get_http_token(state: State<'_, AppState>) -> ZenResult<String> {
    let server = state.mcp_server.read().await;
    Ok(server.http_auth_token().to_string())
}

#[tauri::command]
pub async fn mcp_start_server(state: State<'_, AppState>) -> ZenResult<()> {
    let server_arc = state.mcp_server.clone();
    let mut server = state.mcp_server.write().await;
    server
        .start(server_arc)
        .await
        .map_err(|e| crate::error::ZenError::Internal(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn mcp_stop_server(state: State<'_, AppState>) -> ZenResult<()> {
    let mut server = state.mcp_server.write().await;
    server
        .stop()
        .await
        .map_err(|e| crate::error::ZenError::Internal(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn mcp_list_tools(state: State<'_, AppState>) -> ZenResult<Value> {
    let registry = state.tools.read().await;
    let tools = registry.list_direct_definitions();
    Ok(serde_json::to_value(tools)?)
}
