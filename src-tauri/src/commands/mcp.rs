use serde_json::Value;
use tauri::{AppHandle, State};

use crate::commands::AppState;
use crate::error::{ZenError, ZenResult};
use crate::mcp::resources::{
    McpPrompt, McpPromptMessage, McpResource, McpResourceContents, McpResourceTemplate,
};
use crate::services::{McpInventory, McpScope, McpServerEntry, PendingConsent};

/// Read the raw config document for `scope` (User or Workspace).
/// Returns an empty `{"mcpServers": {}}` payload if no file exists yet.
#[tauri::command]
pub async fn mcp_get_config(state: State<'_, AppState>, scope: McpScope) -> ZenResult<Value> {
    state
        .mcp_config
        .read_config(scope)
        .await
        .map_err(|e| ZenError::Custom(format!("MCP config read failed: {}", e)))
}

/// Persist a raw config document into `scope` (User or Workspace).
#[tauri::command]
pub async fn mcp_save_config(
    state: State<'_, AppState>,
    scope: McpScope,
    config: Value,
) -> ZenResult<()> {
    state
        .mcp_config
        .save_config(scope, config)
        .await
        .map_err(|e| ZenError::Custom(format!("MCP config save failed: {}", e)))
}

/// Return the authoritative, bounded MCP inventory used by agent turns.
/// The snapshot is explicit when no server is configured and contains only
/// safe status metadata (never commands, headers, environment values, or
/// server payloads).
#[tauri::command]
pub async fn mcp_get_inventory(state: State<'_, AppState>) -> ZenResult<McpInventory> {
    state
        .mcp_discovery
        .refresh()
        .await
        .map_err(|e| ZenError::Custom(format!("MCP inventory refresh failed: {}", e)))?;
    Ok(state.mcp_discovery.snapshot().await)
}

/// Typed read: every server merged across both scopes (Workspace
/// overrides User on name collision), each tagged with its scope and
/// transport plus env/headers/timeout/disabled. Does NOT trigger a
/// sync — the boot path and the CRUD commands handle connection refresh.
#[tauri::command]
pub async fn mcp_list_servers(state: State<'_, AppState>) -> ZenResult<Vec<McpServerEntry>> {
    state
        .mcp_config
        .list_servers()
        .await
        .map_err(|e| ZenError::Custom(format!("MCP list servers failed: {}", e)))
}

/// Upsert `mcpServers[name]` in `scope` from a raw entry object,
/// preserving unrelated hand-authored sibling fields. Validates the
/// entry has the fields its transport needs. After persisting, spawns a
/// background `sync_external_servers` so the new row is reachable
/// without restarting. The UI listens for per-row `mcp:server:status`.
#[tauri::command]
pub async fn mcp_upsert_server(
    state: State<'_, AppState>,
    app: AppHandle,
    scope: McpScope,
    name: String,
    config: Value,
) -> ZenResult<()> {
    state
        .mcp_config
        .upsert_server(scope, &name, config)
        .await
        .map_err(|e| ZenError::Custom(format!("MCP upsert server failed: {}", e)))?;
    let client = state.mcp_client.clone();
    tokio::spawn(async move {
        client.sync_external_servers(Some(&app)).await;
    });
    Ok(())
}

/// Enable or disable `mcpServers[name]` in `scope` (sets/clears the
/// `disabled` flag) without deleting its config. Re-syncs so a disabled
/// row's tools are unregistered or a re-enabled row reconnects. Returns
/// whether the row existed.
#[tauri::command]
pub async fn mcp_set_enabled(
    state: State<'_, AppState>,
    app: AppHandle,
    scope: McpScope,
    name: String,
    enabled: bool,
) -> ZenResult<bool> {
    let existed = state
        .mcp_config
        .set_enabled(scope, &name, enabled)
        .await
        .map_err(|e| ZenError::Custom(format!("MCP set enabled failed: {}", e)))?;
    if existed {
        let client = state.mcp_client.clone();
        tokio::spawn(async move {
            client.sync_external_servers(Some(&app)).await;
        });
    }
    Ok(existed)
}

/// Remove `mcpServers[name]` from `scope` (no-op if absent). When the
/// row is actually deleted, spawns a background `sync_external_servers`
/// so the cleared row's adapters are wiped and remaining rows are
/// re-handshaken. Returns whether the row existed.
#[tauri::command]
pub async fn mcp_remove_server(
    state: State<'_, AppState>,
    app: AppHandle,
    scope: McpScope,
    name: String,
) -> ZenResult<bool> {
    let removed = state
        .mcp_config
        .remove_server(scope, &name)
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

/// Force-reconnect to every server across both scopes without modifying
/// config. Useful after a transient outage or a hand-edit. Each row
/// emits `mcp:server:status` events to the UI as the sync progresses.
#[tauri::command]
pub async fn mcp_reconnect(state: State<'_, AppState>, app: AppHandle) -> ZenResult<()> {
    let client = state.mcp_client.clone();
    tokio::spawn(async move {
        client.sync_external_servers(Some(&app)).await;
    });
    Ok(())
}

/// List every MCP server currently blocked pending human connection consent.
/// Each entry carries the transport, origin (http host or stdio command),
/// stdio args, the *names* (never values) of configured headers/env vars, and
/// the fingerprint the UI must echo back to approve. Populated by the most
/// recent `sync_external_servers`.
#[tauri::command]
pub async fn mcp_list_pending(state: State<'_, AppState>) -> ZenResult<Vec<PendingConsent>> {
    Ok(state.mcp_client.consent().list_pending().await)
}

/// Approve a pending MCP server's connection for the exact `fingerprint` the
/// user reviewed, then re-sync so it connects. Rejects a stale fingerprint so
/// a server whose config changed after the prompt was shown can't be approved
/// blind. Approval persists across restarts.
#[tauri::command]
pub async fn mcp_approve_server(
    state: State<'_, AppState>,
    app: AppHandle,
    name: String,
    fingerprint: String,
) -> ZenResult<()> {
    state
        .mcp_client
        .consent()
        .approve(&name, &fingerprint)
        .await
        .map_err(|e| ZenError::Custom(format!("MCP consent approve failed: {}", e)))?;
    let client = state.mcp_client.clone();
    tokio::spawn(async move {
        client.sync_external_servers(Some(&app)).await;
    });
    Ok(())
}

/// Deny (or revoke) consent for an MCP server. Any prior approval is removed
/// so the server stays disconnected on the next sync, and it drops out of the
/// pending list. Any stored OAuth token is also cleared. Re-syncs so a
/// previously-connected-but-now-denied server is torn down and its tools
/// unregistered.
#[tauri::command]
pub async fn mcp_deny_server(
    state: State<'_, AppState>,
    app: AppHandle,
    name: String,
) -> ZenResult<()> {
    state.mcp_client.consent().deny(&name).await;
    // Best-effort: revoke any keyring-stored OAuth token so a re-approve
    // re-authorizes from scratch rather than reusing a credential the user
    // just rejected.
    let _ = crate::mcp::oauth::clear_token(&state.secret_manager, &name).await;
    let client = state.mcp_client.clone();
    tokio::spawn(async move {
        client.sync_external_servers(Some(&app)).await;
    });
    Ok(())
}

/// Run the interactive OAuth 2.1 (PKCE, RFC 9728 discovery) authorization for
/// an MCP HTTP server: discovers the authorization server from the server URL
/// (or the `resourceMetadataUrl` a 401 advertised), opens the system browser
/// to a loopback redirect, exchanges the code, and stores the resulting token
/// in the OS keyring. On success the client re-syncs so the server connects
/// with the new bearer token. `clientId` identifies this app to the
/// authorization server; `scopes` is an optional space-delimited scope list.
#[tauri::command]
pub async fn mcp_authorize_oauth(
    state: State<'_, AppState>,
    app: AppHandle,
    name: String,
    server_url: String,
    client_id: String,
    scopes: Option<String>,
    resource_metadata_url: Option<String>,
) -> ZenResult<()> {
    let token = crate::mcp::oauth::authorize(
        &app,
        &server_url,
        resource_metadata_url.as_deref(),
        &client_id,
        scopes.as_deref(),
    )
    .await
    .map_err(|e| ZenError::Custom(format!("MCP OAuth authorization failed: {}", e)))?;
    crate::mcp::oauth::store_token(&state.secret_manager, &name, &token)
        .await
        .map_err(|e| ZenError::Custom(format!("MCP OAuth token store failed: {}", e)))?;
    let client = state.mcp_client.clone();
    tokio::spawn(async move {
        client.sync_external_servers(Some(&app)).await;
    });
    Ok(())
}

// ─── Phase 5: resources & prompts (explicit user-controlled reads) ───
//
// These never auto-inject into the model. The UI lists what a server offers and
// the user picks; every returned value is safety-normalized in the client layer
// (URI allowlist, control-char stripping, size caps, binary kept as base64)
// before it crosses this boundary.

/// `resources/list` for one connected server, safety-normalized.
#[tauri::command]
pub async fn mcp_list_resources(
    state: State<'_, AppState>,
    server_name: String,
) -> ZenResult<Vec<McpResource>> {
    state
        .mcp_client
        .list_resources(&server_name)
        .await
        .map_err(|e| ZenError::Custom(format!("MCP list resources failed: {}", e)))
}

/// `resources/templates/list` for one connected server, safety-normalized.
#[tauri::command]
pub async fn mcp_list_resource_templates(
    state: State<'_, AppState>,
    server_name: String,
) -> ZenResult<Vec<McpResourceTemplate>> {
    state
        .mcp_client
        .list_resource_templates(&server_name)
        .await
        .map_err(|e| ZenError::Custom(format!("MCP list resource templates failed: {}", e)))
}

/// `resources/read` for a specific URI. The URI is validated against the scheme
/// allowlist / path-traversal guard before the request is sent.
#[tauri::command]
pub async fn mcp_read_resource(
    state: State<'_, AppState>,
    server_name: String,
    uri: String,
) -> ZenResult<Vec<McpResourceContents>> {
    state
        .mcp_client
        .read_resource(&server_name, &uri)
        .await
        .map_err(|e| ZenError::Custom(format!("MCP read resource failed: {}", e)))
}

/// `prompts/list` for one connected server, safety-normalized.
#[tauri::command]
pub async fn mcp_list_prompts(
    state: State<'_, AppState>,
    server_name: String,
) -> ZenResult<Vec<McpPrompt>> {
    state
        .mcp_client
        .list_prompts(&server_name)
        .await
        .map_err(|e| ZenError::Custom(format!("MCP list prompts failed: {}", e)))
}

/// `prompts/get` with user-supplied arguments. Message content is sanitized to
/// plain text and embedded resources are summarized to their URI — never
/// inlined — so a prompt can't smuggle executable or opaque content.
#[tauri::command]
pub async fn mcp_get_prompt(
    state: State<'_, AppState>,
    server_name: String,
    name: String,
    arguments: Option<Value>,
) -> ZenResult<Vec<McpPromptMessage>> {
    state
        .mcp_client
        .get_prompt(&server_name, &name, arguments.unwrap_or(Value::Null))
        .await
        .map_err(|e| ZenError::Custom(format!("MCP get prompt failed: {}", e)))
}

