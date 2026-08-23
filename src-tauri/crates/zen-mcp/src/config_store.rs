//! Persistence half of `McpConfigService`: path resolution, scoped
//! .mcp.json file I/O and the audit hook (split from config.rs during the
//! Phase 8 extraction, per the plan's parsing-vs-persistence split).

use std::path::{Path, PathBuf};
use tokio::fs;

use serde_json::Value;
use zen_security::service::{AuditEvent, PermissionDecision, PrivilegedOperation};

use super::config::{
    AUDIT_CALLER, MCP_CONFIG_FILENAME, USER_CONFIG_FILENAME, USER_CONFIG_SUBDIR, McpConfigError,
    McpConfigService, McpScope,
};

/// Local twin of the app's `workspace::canonicalize_workspace_root`
/// (exists + is-dir gate, then std canonicalize).
pub(crate) fn canonicalize_workspace_root(path: &Path) -> Result<PathBuf, String> {
    if !path.exists() || !path.is_dir() {
        return Err(format!(
            "Workspace root does not exist or is not a directory: {}",
            path.display()
        ));
    }
    path.canonicalize()
        .map_err(|e| format!("Failed to resolve workspace root: {}", e))
}

impl McpConfigService {
    pub(crate) async fn resolve_target_path(&self, scope: McpScope) -> Result<PathBuf, McpConfigError> {
        match scope {
            McpScope::Workspace => {
                let root = self.workspace_root.read().await.clone();
                if root.as_os_str().is_empty() {
                    return Err(McpConfigError::NoWorkspace);
                }
                canonicalize_workspace_root(&root)
                    .map_err(|e| McpConfigError::InvalidWorkspace(e.to_string()))?;
                Ok(root.join(MCP_CONFIG_FILENAME))
            }
            McpScope::User => {
                let dir = dirs::config_dir()
                    .ok_or_else(|| {
                        McpConfigError::InvalidWorkspace(
                            "OS config directory is not available".to_string(),
                        )
                    })?
                    .join(USER_CONFIG_SUBDIR);
                Ok(dir.join(USER_CONFIG_FILENAME))
            }
        }
    }

    pub(crate) async fn audit(
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

    /// Read the config document for `scope`. A missing file yields an
    /// empty `{"mcpServers": {}}` default (audited as allow). Parse/IO
    pub async fn read_config(&self, scope: McpScope) -> Result<Value, McpConfigError> {
        let target_path = match self.resolve_target_path(scope).await {
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

    /// Serialize and write the config document for `scope`. Creates the
    /// parent directory for the User scope on first write. Fails closed
    /// when the scope path is unavailable or the file cannot be written.
    pub async fn save_config(&self, scope: McpScope, config: Value) -> Result<(), McpConfigError> {
        Self::validate_config_document(&config)?;
        let target_path = match self.resolve_target_path(scope).await {
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

        // User scope may not have its parent dir yet — create it lazily.
        if let Some(parent) = target_path.parent() {
            if let Err(e) = fs::create_dir_all(parent).await {
                self.audit(
                    PrivilegedOperation::FileWrite,
                    PermissionDecision::Deny,
                    Some(target_path.display().to_string()),
                    format!("MCP config dir create failed: {}", e),
                )
                .await;
                return Err(McpConfigError::Io(
                    target_path.display().to_string(),
                    e.to_string(),
                ));
            }
        }

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
}