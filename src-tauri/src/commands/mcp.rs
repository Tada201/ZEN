use serde_json::Value;
use tauri::State;

use crate::commands::AppState;
use crate::error::{ZenError, ZenResult};

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
