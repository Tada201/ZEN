use crate::commands::AppState;
use crate::error::ZenResult;
use serde::Serialize;
use serde_json::Value;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct McpToolCatalogEntry {
    pub name: String,
    pub description: Option<String>,
    pub parameters: serde_json::Value,
    pub risk_level: Option<String>,
    /// True when the tool is honored by the non-interactive MCP path.
    /// Mirrors `ToolRegistry::is_mcp_exposable` so the renderer never
    /// presents a tool as "callable over JSON-RPC" when the server will
    /// reject it at call time.
    pub mcp_exposable: bool,
    /// Human-readable reason when `mcp_exposable` is false. None when true.
    pub unavailability_reason: Option<String>,
}

/// Thin IPC adapter over `McpConfigService`. All `.mcp.json` access —
/// workspace resolution, validation, audit events, fail-closed behavior —
/// lives in the service. The command layer only translates the typed
/// error into an IPC-safe response.
#[tauri::command]
pub async fn mcp_get_config(state: State<'_, AppState>) -> ZenResult<Value> {
    state
        .mcp_config
        .read_config()
        .await
        .map_err(|e| crate::error::ZenError::Internal(e.to_string()))
}

/// Thin IPC adapter — see `mcp_get_config`.
#[tauri::command]
pub async fn mcp_save_config(state: State<'_, AppState>, config: Value) -> ZenResult<()> {
    state
        .mcp_config
        .save_config(config)
        .await
        .map_err(|e| crate::error::ZenError::Internal(e.to_string()))
}

#[tauri::command]
pub async fn mcp_get_status(state: State<'_, AppState>) -> ZenResult<Value> {
    let server = state.mcp_server.read().await;
    Ok(server.get_info())
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
pub async fn mcp_list_tools(
    state: State<'_, AppState>,
) -> ZenResult<Vec<McpToolCatalogEntry>> {
    let registry = state.tools.read().await;
    let defs = registry.list_direct_definitions();
    let entries: Vec<McpToolCatalogEntry> = defs
        .into_iter()
        .map(|def| {
            let mcp_exposable = registry.is_mcp_exposable(&def.name);
            let unavailability_reason = if mcp_exposable {
                None
            } else {
                let reason = match def.risk_level {
                    Some(crate::tools::permission::RiskLevel::Critical) => {
                        "Critical risk — requires explicit user approval. Not available over non-interactive MCP."
                    }
                    Some(crate::tools::permission::RiskLevel::High) => {
                        "High risk — needs a permission decision that cannot be made non-interactively."
                    }
                    Some(crate::tools::permission::RiskLevel::Medium) => {
                        "Medium risk — `SecurityService` does not auto-allow Medium tools under the default policy, so the non-interactive MCP path would reject them. Use the interactive chat surface instead."
                    }
                    _ => "Not exposed via the non-interactive MCP path.",
                };
                Some(reason.to_string())
            };
            McpToolCatalogEntry {
                name: def.name,
                description: if def.description.is_empty() {
                    None
                } else {
                    Some(def.description)
                },
                parameters: def.parameters,
                risk_level: def.risk_level.map(|r| format!("{:?}", r)),
                mcp_exposable,
                unavailability_reason,
            }
        })
        .collect();
    Ok(entries)
}
