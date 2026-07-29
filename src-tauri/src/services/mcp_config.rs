//! MCP `.mcp.json` configuration service.
//!
//! Owns read/write of the external MCP server catalog inside the active
//! workspace. Resolution is strict: every operation requires a valid
//! workspace root. When the workspace root is unavailable, invalid, or
//! unwritable the service fails closed — there is no `current_dir`
//! fallback and no silent empty default. Every read and write is recorded
//! through `SecurityService` for audit.

use crate::services::{AuditEvent, PermissionDecision, PrivilegedOperation, SecurityService};
use crate::workspace;
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;
use thiserror::Error;
use tokio::fs;
use tokio::sync::RwLock;

const MCP_CONFIG_FILENAME: &str = ".mcp.json";
const AUDIT_CALLER: &str = "mcp_config_service";

/// Service that owns `.mcp.json` read/write for the active workspace.
pub struct McpConfigService {
    workspace_root: Arc<RwLock<PathBuf>>,
    security: Arc<SecurityService>,
}

impl McpConfigService {
    pub fn new(workspace_root: Arc<RwLock<PathBuf>>, security: Arc<SecurityService>) -> Self {
        Self {
            workspace_root,
            security,
        }
    }

    /// Resolve the canonical `.mcp.json` path inside the active workspace.
    /// Returns `Err` if the workspace root is empty, missing, or invalid.
    /// Never falls back to `current_dir`.
    async fn resolve_target_path(&self) -> Result<PathBuf, McpConfigError> {
        let root = self.workspace_root.read().await.clone();
        if root.as_os_str().is_empty() {
            return Err(McpConfigError::NoWorkspace);
        }
        workspace::canonicalize_workspace_root(&root)
            .map_err(|e| McpConfigError::InvalidWorkspace(e.to_string()))?;
        Ok(root.join(MCP_CONFIG_FILENAME))
    }

    async fn audit(
        &self,
        operation: PrivilegedOperation,
        decision: PermissionDecision,
        target: Option<String>,
        reason: String,
    ) {
        self.security
            .record_audit(AuditEvent {
                operation,
                decision,
                caller: AUDIT_CALLER.to_string(),
                target,
                reason: Some(reason),
            })
            .await;
    }

    /// Read `.mcp.json` from the active workspace. If the file does not
    /// exist yet, returns an empty `{"mcpServers": {}}` payload and
    /// audits the read as allow. Any other failure (parse error, IO
    /// error, invalid workspace) returns `Err` and is audited as deny.
    pub async fn read_config(&self) -> Result<Value, McpConfigError> {
        let target_path = match self.resolve_target_path().await {
            Ok(p) => p,
            Err(e) => {
                self.audit(
                    PrivilegedOperation::FileRead,
                    PermissionDecision::Deny,
                    None,
                    format!("MCP config read denied: {}", e),
                )
                .await;
                return Err(e);
            }
        };

        match fs::read_to_string(&target_path).await {
            Ok(content) => match serde_json::from_str::<Value>(&content) {
                Ok(val) => {
                    self.audit(
                        PrivilegedOperation::FileRead,
                        PermissionDecision::Allow,
                        Some(target_path.display().to_string()),
                        "MCP config read succeeded".to_string(),
                    )
                    .await;
                    Ok(val)
                }
                Err(e) => {
                    self.audit(
                        PrivilegedOperation::FileRead,
                        PermissionDecision::Deny,
                        Some(target_path.display().to_string()),
                        format!("MCP config parse failed: {}", e),
                    )
                    .await;
                    Err(McpConfigError::Parse(
                        target_path.display().to_string(),
                        e.to_string(),
                    ))
                }
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                // No file yet — return empty default and audit as allow
                // so admins can see the lookup happened.
                self.audit(
                    PrivilegedOperation::FileRead,
                    PermissionDecision::Allow,
                    Some(target_path.display().to_string()),
                    "MCP config not found, returning empty default".to_string(),
                )
                .await;
                Ok(serde_json::json!({ "mcpServers": {} }))
            }
            Err(e) => {
                self.audit(
                    PrivilegedOperation::FileRead,
                    PermissionDecision::Deny,
                    Some(target_path.display().to_string()),
                    format!("MCP config read failed: {}", e),
                )
                .await;
                Err(McpConfigError::Io(
                    target_path.display().to_string(),
                    e.to_string(),
                ))
            }
        }
    }

    /// Serialize and write `.mcp.json` into the active workspace. Fails
    /// closed when the workspace is unavailable, the path is invalid, or
    /// the file cannot be written.
    pub async fn save_config(&self, config: Value) -> Result<(), McpConfigError> {
        let target_path = match self.resolve_target_path().await {
            Ok(p) => p,
            Err(e) => {
                self.audit(
                    PrivilegedOperation::FileWrite,
                    PermissionDecision::Deny,
                    None,
                    format!("MCP config save denied: {}", e),
                )
                .await;
                return Err(e);
            }
        };

        let content = match serde_json::to_string_pretty(&config) {
            Ok(s) => s,
            Err(e) => {
                self.audit(
                    PrivilegedOperation::FileWrite,
                    PermissionDecision::Deny,
                    Some(target_path.display().to_string()),
                    format!("MCP config serialize failed: {}", e),
                )
                .await;
                return Err(McpConfigError::Parse(
                    target_path.display().to_string(),
                    e.to_string(),
                ));
            }
        };

        match fs::write(&target_path, content).await {
            Ok(()) => {
                self.audit(
                    PrivilegedOperation::FileWrite,
                    PermissionDecision::Allow,
                    Some(target_path.display().to_string()),
                    "MCP config saved".to_string(),
                )
                .await;
                Ok(())
            }
            Err(e) => {
                self.audit(
                    PrivilegedOperation::FileWrite,
                    PermissionDecision::Deny,
                    Some(target_path.display().to_string()),
                    format!("MCP config write failed: {}", e),
                )
                .await;
                Err(McpConfigError::Io(
                    target_path.display().to_string(),
                    e.to_string(),
                ))
            }
        }
    }

    /// Enumerate every server in `.mcp.json`'s `mcpServers` map. Both
    /// HTTP (`url` field) and stdio (`command`+`args` fields) entries
    /// are surfaced so the typed settings UI can display every row
    /// regardless of transport. Entries with neither field are
    /// filtered out as best-effort rather than aborting the read — a
    /// partially hand-authored file should still surface its valid
    /// rows in the UI.
    pub async fn list_servers(&self) -> Result<Vec<McpServerEntry>, McpConfigError> {
        let config = self.read_config().await?;
        let mut entries = Vec::new();
        if let Some(servers) = config.get("mcpServers").and_then(|v| v.as_object()) {
            for (name, body) in servers {
                if let Some(url) = body.get("url").and_then(|v| v.as_str()) {
                    entries.push(McpServerEntry {
                        name: name.clone(),
                        transport: McpTransport::Http,
                        url: Some(url.to_string()),
                        command: None,
                        args: None,
                    });
                } else if let Some(command) = body.get("command").and_then(|v| v.as_str()) {
                    let args: Vec<String> = body
                        .get("args")
                        .and_then(|v| v.as_array())
                        .map(|a| {
                            a.iter()
                                .filter_map(|v| v.as_str().map(str::to_string))
                                .collect()
                        })
                        .unwrap_or_default();
                    entries.push(McpServerEntry {
                        name: name.clone(),
                        transport: McpTransport::Stdio,
                        url: None,
                        command: Some(command.to_string()),
                        args: Some(args),
                    });
                }
            }
        }
        Ok(entries)
    }

    /// Upsert `mcpServers[name].url = url` while preserving any
    /// unrelated fields on the same entry object (e.g. `headers`,
    /// `env`, `timeout`). Empty name or url is rejected so we never
    /// write a malformed `.mcp.json`. The typed shape is intentionally
    /// additive — the entry body remains a `serde_json::Value` map so
    /// hand-authored extensions round-trip cleanly.
    pub async fn add_server(&self, name: &str, url: &str) -> Result<(), McpConfigError> {
        if name.trim().is_empty() {
            return Err(McpConfigError::Parse(
                "<empty name>".to_string(),
                "MCP server name must not be empty".to_string(),
            ));
        }
        if url.trim().is_empty() {
            return Err(McpConfigError::Parse(
                format!("<server '{}'>", name),
                "MCP server url must not be empty".to_string(),
            ));
        }
        let mut config = self.read_config().await?;
        let servers = config
            .as_object_mut()
            .and_then(|o| o.get_mut("mcpServers"))
            .and_then(|v| v.as_object_mut())
            .ok_or_else(|| {
                McpConfigError::Parse(
                    "<root>".to_string(),
                    "mcpServers missing or not an object".to_string(),
                )
            })?;
        let entry = servers
            .entry(name.to_string())
            .or_insert_with(|| serde_json::json!({}));
        match entry.as_object_mut() {
            Some(obj) => {
                obj.insert("url".to_string(), serde_json::Value::String(url.to_string()));
            }
            None => {
                // Existing entry was a scalar (legacy users may have
                // written `"my_server": "http://..."`). Replace it with
                // a fresh object so future round-trips through the
                // typed UI keep their structure intact.
                *entry = serde_json::json!({ "url": url });
            }
        }
        self.save_config(config).await
    }

    /// Remove `mcpServers[name]` if present. Returns whether removal
    /// actually happened so the caller can decide whether to trigger
    /// a follow-up sync — no-op deletes should not churn the registry.
    pub async fn remove_server(&self, name: &str) -> Result<bool, McpConfigError> {
        let mut config = self.read_config().await?;
        let removed = if let Some(servers) = config
            .as_object_mut()
            .and_then(|o| o.get_mut("mcpServers"))
            .and_then(|v| v.as_object_mut())
        {
            servers.remove(name).is_some()
        } else {
            false
        };
        if !removed {
            // Don't rewrite `.mcp.json` if nothing actually changed.
            return Ok(false);
        }
        self.save_config(config).await?;
        Ok(true)
    }
}

/// Transport type an external MCP server uses. Determined at read
/// time from the presence of `url` (HTTP) vs `command` (stdio) in
/// the `.mcp.json` entry.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum McpTransport {
    /// Streamable HTTP transport (`url` field in `.mcp.json`).
    Http,
    /// stdio transport (`command`+`args` fields in `.mcp.json`).
    Stdio,
}

/// Typed view of a single `mcpServers[name]` entry. The wire shape
/// exposes the transport and the relevant fields for that transport;
/// `url` is `Some` for HTTP entries, `command`/`args` are `Some` for
/// stdio entries. Arbitrary hand-authored sibling fields (e.g.
/// `headers`, `env`, `timeout`) stay on disk because the typed
/// helpers operate on `serde_json::Value` rather than a strict struct
/// that would silently drop them.
#[derive(Debug, Clone, Serialize)]
pub struct McpServerEntry {
    pub name: String,
    pub transport: McpTransport,
    /// Set for HTTP-transport entries.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// Set for stdio-transport entries.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    /// Set for stdio-transport entries.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
}

/// Errors raised by `McpConfigService`. The variants are designed so the
/// command layer can convert them directly into IPC-safe errors without
/// leaking filesystem details the renderer should not see.
#[derive(Debug, Error)]
pub enum McpConfigError {
    /// No workspace root is configured. The service refuses to read or
    /// write `.mcp.json` outside an active workspace.
    #[error("MCP config requires a valid active workspace; no workspace root is set")]
    NoWorkspace,

    /// Workspace root is set but does not exist or is not a directory.
    #[error("MCP config requires a valid active workspace: {0}")]
    InvalidWorkspace(String),

    /// Filesystem IO failed.
    #[error("MCP config file '{0}' could not be read or written: {1}")]
    Io(String, String),

    /// File existed but was not valid JSON, or the supplied config could
    /// not be serialized.
    #[error("MCP config file '{0}' is not valid JSON: {1}")]
    Parse(String, String),
}
