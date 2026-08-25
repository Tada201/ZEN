//! MCP configuration service — dual-scope `.mcp.json` catalog.
//!
//! Owns read/write of the external MCP server catalog at two scopes:
//! - **User** (global): `~/.config/zen/mcp.json` (via `dirs::config_dir()`),
//!   shared across every workspace. Mirrors the agent user-dir precedent.
//! - **Workspace** (project): `.mcp.json` inside the active workspace root.
//!
//! Workspace resolution is strict — it fails closed with no `current_dir`
//! fallback. User resolution creates the parent directory on first write.
//! On name collisions the workspace entry wins (project overrides global).
//! Every read and write is recorded through `SecurityService` for audit.

use zen_security::service::SecurityService;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::PathBuf;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::RwLock;

pub(crate) const MCP_CONFIG_FILENAME: &str = ".mcp.json";
pub(crate) const USER_CONFIG_SUBDIR: &str = "zen";
pub(crate) const USER_CONFIG_FILENAME: &str = "mcp.json";
pub(crate) const AUDIT_CALLER: &str = "mcp_config_service";

/// Which catalog a server entry lives in. `User` is the global config;
/// `Workspace` is the per-project `.mcp.json`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum McpScope {
    User,
    Workspace,
}

impl McpScope {
    /// Iteration order for merge: User first so Workspace overrides it.
    const MERGE_ORDER: [McpScope; 2] = [McpScope::User, McpScope::Workspace];
}

/// Service that owns MCP config read/write across the User and Workspace scopes.
pub struct McpConfigService {
    pub(crate) workspace_root: Arc<RwLock<PathBuf>>,
    pub(crate) security: Arc<SecurityService>,
}

impl McpConfigService {
    pub fn new(workspace_root: Arc<RwLock<PathBuf>>, security: Arc<SecurityService>) -> Self {
        Self {
            workspace_root,
            security,
        }
    }

    /// Parse the `mcpServers` map of one scope document into typed rows.
    /// Malformed individual entries are skipped best-effort so a partially
    /// hand-authored file still surfaces its valid rows.
    fn parse_entries(scope: McpScope, config: &Value) -> Vec<McpServerEntry> {
        let mut entries = Vec::new();
        let Some(servers) = config.get("mcpServers").and_then(|v| v.as_object()) else {
            return entries;
        };
        for (name, body) in servers {
            let Some(obj) = body.as_object() else { continue };
            let disabled = obj
                .get("disabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let timeout_ms = obj.get("timeout_ms").and_then(|v| v.as_u64());
            let env = obj.get("env").and_then(|v| v.as_object()).map(|m| {
                m.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                    .collect::<std::collections::BTreeMap<_, _>>()
            });
            let headers = obj.get("headers").and_then(|v| v.as_object()).map(|m| {
                m.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                    .collect::<std::collections::BTreeMap<_, _>>()
            });
            // Transport inferred from fields; explicit `type` wins when present.
            let declared_type = obj.get("type").and_then(|v| v.as_str());
            if declared_type == Some("http") || obj.contains_key("url") {
                let Some(url) = obj.get("url").and_then(|v| v.as_str()) else {
                    continue;
                };
                entries.push(McpServerEntry {
                    name: name.clone(),
                    scope,
                    transport: McpTransport::Http,
                    url: Some(url.to_string()),
                    command: None,
                    args: None,
                    env,
                    headers,
                    timeout_ms,
                    disabled,
                });
            } else if obj.contains_key("command") {
                let Some(command) = obj.get("command").and_then(|v| v.as_str()) else {
                    continue;
                };
                let args: Vec<String> = obj
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
                    scope,
                    transport: McpTransport::Stdio,
                    url: None,
                    command: Some(command.to_string()),
                    args: Some(args),
                    env,
                    headers,
                    timeout_ms,
                    disabled,
                });
            }
        }
        entries
    }

    /// Enumerate every server across both scopes. Workspace entries
    /// override User entries with the same name (project beats global),
    /// matching the config hierarchy of Claude Code / Codex.
    pub async fn list_servers(&self) -> Result<Vec<McpServerEntry>, McpConfigError> {
        let mut merged: std::collections::BTreeMap<String, McpServerEntry> =
            std::collections::BTreeMap::new();
        for scope in McpScope::MERGE_ORDER {
            // A missing/unavailable scope is not fatal — the other scope
            // should still list. Only a real parse/IO error propagates.
            let config = match self.read_config(scope).await {
                Ok(c) => c,
                Err(McpConfigError::NoWorkspace) | Err(McpConfigError::InvalidWorkspace(_)) => {
                    continue;
                }
                Err(e) => return Err(e),
            };
            for entry in Self::parse_entries(scope, &config) {
                merged.insert(entry.name.clone(), entry);
            }
        }
        Ok(merged.into_values().collect())
    }

    /// Merged raw `mcpServers` map across both scopes for the client's
    /// connection sync. Unlike `list_servers`, this preserves each entry's
    /// full JSON body (env/headers/args/timeout_ms/disabled and any
    /// hand-authored fields) so the client can connect from it directly.
    /// Workspace entries override User entries with the same name. A
    /// missing/unavailable scope is skipped rather than fatal. Each entry is
    /// tagged with a non-persisted `__scope` marker (the winning scope) so the
    /// client can report a server's origin in the consent UI; the connection
    /// path ignores unknown fields and the consent fingerprint excludes it.
    pub async fn merged_servers(&self) -> Result<Map<String, Value>, McpConfigError> {
        let mut merged = Map::new();
        for scope in McpScope::MERGE_ORDER {
            let config = match self.read_config(scope).await {
                Ok(c) => c,
                Err(McpConfigError::NoWorkspace) | Err(McpConfigError::InvalidWorkspace(_)) => {
                    continue;
                }
                Err(e) => return Err(e),
            };
            if let Some(servers) = config.get("mcpServers").and_then(|v| v.as_object()) {
                let scope_label = match scope {
                    McpScope::User => "user",
                    McpScope::Workspace => "workspace",
                };
                for (name, body) in servers {
                    let mut body = body.clone();
                    if let Some(obj) = body.as_object_mut() {
                        obj.insert("__scope".to_string(), Value::String(scope_label.to_string()));
                    }
                    merged.insert(name.clone(), body);
                }
            }
        }
        Ok(merged)
    }

    /// Upsert `mcpServers[name]` in `scope` from a raw entry object,
    /// preserving unrelated hand-authored sibling fields. Validates the
    /// name and that the entry carries the fields its transport needs
    /// (`url` for http, `command` for stdio) so we never persist a
    /// malformed row. Secret env values are stored as written (typically
    /// `${env:VAR}` references) — the client expands them at spawn time.
    pub async fn upsert_server(
        &self,
        scope: McpScope,
        name: &str,
        entry: Value,
    ) -> Result<(), McpConfigError> {
        if name.trim().is_empty() {
            return Err(McpConfigError::Parse(
                "<empty name>".to_string(),
                "MCP server name must not be empty".to_string(),
            ));
        }
        let new_obj = entry.as_object().ok_or_else(|| {
            McpConfigError::Parse(
                format!("<server '{name}'>"),
                "MCP server entry must be a JSON object".to_string(),
            )
        })?;
        Self::validate_entry(name, new_obj)?;

        let mut config = self.read_config(scope).await?;
        let servers = config
            .as_object_mut()
            .and_then(|o| {
                if !o.contains_key("mcpServers") {
                    o.insert("mcpServers".to_string(), Value::Object(Map::new()));
                }
                o.get_mut("mcpServers")
            })
            .and_then(|v| v.as_object_mut())
            .ok_or_else(|| {
                McpConfigError::Parse(
                    "<root>".to_string(),
                    "mcpServers is present but not an object".to_string(),
                )
            })?;

        // Merge onto any existing entry so hand-authored siblings survive,
        // but remove fields owned by the previous transport. Leaving `url`
        // beside a new stdio `command` (or vice versa) makes the runtime pick
        // the wrong transport because URL detection intentionally wins.
        let incoming_http = new_obj
            .get("type")
            .and_then(|v| v.as_str())
            .is_some_and(|kind| kind == "http")
            || new_obj.contains_key("url");
        let existing = servers
            .entry(name.to_string())
            .or_insert_with(|| Value::Object(Map::new()));
        if !existing.is_object() {
            *existing = Value::Object(Map::new());
        }
        if let Some(target) = existing.as_object_mut() {
            if incoming_http {
                for key in ["command", "args", "env"] {
                    target.remove(key);
                }
            } else {
                for key in ["url", "headers"] {
                    target.remove(key);
                }
            }
            for (k, v) in new_obj {
                target.insert(k.clone(), v.clone());
            }
        }
        self.save_config(scope, config).await
    }

    /// Validate a complete raw config too, because JSON mode and the public
    /// save command bypass `upsert_server`. This is the last persistence gate
    /// against mixed transports and raw credential headers.
    pub(crate) fn validate_config_document(config: &Value) -> Result<(), McpConfigError> {
        let Some(root) = config.as_object() else {
            return Err(McpConfigError::Parse(
                "<root>".to_string(),
                "MCP config must be a JSON object".to_string(),
            ));
        };
        let Some(servers) = root.get("mcpServers") else {
            return Ok(());
        };
        let Some(servers) = servers.as_object() else {
            return Err(McpConfigError::Parse(
                "<root>".to_string(),
                "mcpServers is present but not an object".to_string(),
            ));
        };
        for (name, body) in servers {
            let Some(obj) = body.as_object() else {
                return Err(McpConfigError::Parse(
                    format!("<server '{name}'>"),
                    "MCP server entry must be a JSON object".to_string(),
                ));
            };
            Self::validate_entry(name, obj)?;
        }
        Ok(())
    }

    /// Reject an entry that can't produce a working connection or that stores
    /// a credential directly in normal config. Secret-bearing values must be
    /// references such as `${env:MCP_TOKEN}` or `${secret:MCP_TOKEN}` and are
    /// expanded only in memory.
    pub(crate) fn validate_entry(name: &str, obj: &Map<String, Value>) -> Result<(), McpConfigError> {
        let declared = obj.get("type").and_then(|v| v.as_str());
        if let Some(kind) = declared {
            if kind != "http" && kind != "stdio" {
                return Err(McpConfigError::Parse(
                    format!("<server '{name}'>"),
                    "entry type must be 'http' or 'stdio'".to_string(),
                ));
            }
        }
        let has_url = obj
            .get("url")
            .and_then(|v| v.as_str())
            .is_some_and(|s| !s.trim().is_empty());
        let has_cmd = obj
            .get("command")
            .and_then(|v| v.as_str())
            .is_some_and(|s| !s.trim().is_empty());
        if has_url && has_cmd {
            return Err(McpConfigError::Parse(
                format!("<server '{name}'>"),
                "entry must not contain both 'url' and 'command'".to_string(),
            ));
        }
        let ok = match declared {
            Some("http") => has_url,
            Some("stdio") => has_cmd,
            _ => has_url || has_cmd,
        };
        if !ok {
            return Err(McpConfigError::Parse(
                format!("<server '{name}'>"),
                "entry needs a non-empty 'url' (http) or 'command' (stdio)".to_string(),
            ));
        }
        if let Some(headers) = obj.get("headers") {
            Self::validate_string_map(name, "headers", headers, true)?;
        }
        if let Some(env) = obj.get("env") {
            Self::validate_string_map(name, "env", env, false)?;
        }
        Ok(())
    }

    fn validate_string_map(
        name: &str,
        field: &str,
        value: &Value,
        header_mode: bool,
    ) -> Result<(), McpConfigError> {
        let Some(map) = value.as_object() else {
            return Err(McpConfigError::Parse(
                format!("<server '{name}'>"),
                format!("{field} must be an object of string values"),
            ));
        };
        for (key, value) in map {
            let Some(value) = value.as_str() else {
                return Err(McpConfigError::Parse(
                    format!("<server '{name}'>"),
                    format!("{field} values must be strings"),
                ));
            };
            if key.chars().any(|c| c.is_control()) || value.chars().any(|c| c.is_control()) {
                return Err(McpConfigError::Parse(
                    format!("<server '{name}'>"),
                    format!("{field} contains a control character"),
                ));
            }
            if header_mode && is_reserved_mcp_header(key) {
                return Err(McpConfigError::Parse(
                    format!("<server '{name}'>"),
                    format!("{field}['{key}'] is controlled by the MCP client"),
                ));
            }
            let sensitive = if header_mode {
                is_sensitive_header(key)
            } else {
                is_sensitive_secret_name(key)
            };
            if sensitive && !contains_secret_reference(value) {
                return Err(McpConfigError::Parse(
                    format!("<server '{name}'>"),
                    format!("{field}['{key}'] must use an environment reference; raw secrets are not persisted"),
                ));
            }
        }
        Ok(())
    }

    /// Set `mcpServers[name].disabled = !enabled` in `scope`. Returns
    /// whether the row existed. A disabled row is skipped by the client's
    /// sync so its tools are unregistered without losing its config.
    pub async fn set_enabled(
        &self,
        scope: McpScope,
        name: &str,
        enabled: bool,
    ) -> Result<bool, McpConfigError> {
        let mut config = self.read_config(scope).await?;
        let Some(entry) = config
            .as_object_mut()
            .and_then(|o| o.get_mut("mcpServers"))
            .and_then(|v| v.as_object_mut())
            .and_then(|s| s.get_mut(name))
            .and_then(|e| e.as_object_mut())
        else {
            return Ok(false);
        };
        if enabled {
            entry.remove("disabled");
        } else {
            entry.insert("disabled".to_string(), Value::Bool(true));
        }
        self.save_config(scope, config).await?;
        Ok(true)
    }

    /// Remove `mcpServers[name]` from `scope` if present. Returns whether
    /// removal happened so the caller can skip a no-op resync.
    pub async fn remove_server(&self, scope: McpScope, name: &str) -> Result<bool, McpConfigError> {
        let mut config = self.read_config(scope).await?;
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
            return Ok(false);
        }
        self.save_config(scope, config).await?;
        Ok(true)
    }
}

pub(crate) fn is_reserved_mcp_header(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "accept"
            | "content-type"
            | "mcp-protocol-version"
            | "mcp-session-id"
            | "mcp-method"
            | "mcp-name"
    )
}

pub(crate) fn is_sensitive_header(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "authorization"
            | "proxy-authorization"
            | "x-api-key"
            | "api-key"
            | "cookie"
            | "set-cookie"
    )
}

fn is_sensitive_secret_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    ["token", "secret", "password", "credential", "api_key", "apikey", "auth"]
        .iter()
        .any(|marker| lower.contains(marker))
}

fn contains_secret_reference(value: &str) -> bool {
    value.contains("${env:")
        || value.contains("${secret:")
        || value
            .split('$')
            .skip(1)
            .any(|part| part.chars().next().is_some_and(|c| c == '_' || c.is_ascii_alphabetic()))
}

/// Transport type an external MCP server uses.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum McpTransport {
    /// Streamable HTTP transport (`url` field).
    Http,
    /// stdio transport (`command`+`args` fields).
    Stdio,
}

/// Typed view of a single `mcpServers[name]` entry, tagged with the scope
/// it was read from. Hand-authored sibling fields not modeled here stay on
/// disk because the CRUD helpers operate on `serde_json::Value`.
#[derive(Debug, Clone, Serialize)]
pub struct McpServerEntry {
    pub name: String,
    pub scope: McpScope,
    pub transport: McpTransport,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
    /// Environment variables for stdio servers (values may be `${env:VAR}`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<std::collections::BTreeMap<String, String>>,
    /// HTTP request headers for http servers (values may be `${env:VAR}`);
    /// this is the HTTP auth analog of stdio `env` (e.g. `Authorization`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<std::collections::BTreeMap<String, String>>,
    /// Per-server request timeout override in milliseconds.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_ms: Option<u64>,
    /// When true the client skips this row during sync (tools unregistered).
    pub disabled: bool,
}

/// Errors raised by `McpConfigService`.
#[derive(Debug, Error)]
pub enum McpConfigError {
    #[error("MCP config requires a valid active workspace; no workspace root is set")]
    NoWorkspace,

    #[error("MCP config requires a valid active workspace: {0}")]
    InvalidWorkspace(String),

    #[error("MCP config file '{0}' could not be read or written: {1}")]
    Io(String, String),

    #[error("MCP config file '{0}' is not valid JSON: {1}")]
    Parse(String, String),
}

#[cfg(test)]
mod tests {
    use super::*;

    fn doc(servers: Value) -> Value {
        serde_json::json!({ "mcpServers": servers })
    }

    #[test]
    fn parse_entries_reads_stdio_http_env_timeout_disabled() {
        let config = doc(serde_json::json!({
            "web": { "type": "http", "url": "https://mcp.example/mcp", "timeout_ms": 5000 },
            "mem": {
                "command": "npx",
                "args": ["-y", "server-memory"],
                "env": { "TOK": "${env:X}" },
                "disabled": true
            },
            "bad": { "type": "http" }
        }));
        let mut entries = McpConfigService::parse_entries(McpScope::User, &config);
        entries.sort_by(|a, b| a.name.cmp(&b.name));
        // "bad" (http with no url) is dropped best-effort.
        assert_eq!(entries.len(), 2);
        let mem = entries.iter().find(|e| e.name == "mem").unwrap();
        assert_eq!(mem.transport, McpTransport::Stdio);
        assert!(mem.disabled);
        assert_eq!(mem.command.as_deref(), Some("npx"));
        assert_eq!(mem.env.as_ref().unwrap().get("TOK").unwrap(), "${env:X}");
        let web = entries.iter().find(|e| e.name == "web").unwrap();
        assert_eq!(web.transport, McpTransport::Http);
        assert_eq!(web.timeout_ms, Some(5000));
    }

    #[test]
    fn validate_entry_enforces_transport_fields() {
        let http_ok: Map<String, Value> =
            serde_json::from_value(serde_json::json!({ "type": "http", "url": "http://x" }))
                .unwrap();
        assert!(McpConfigService::validate_entry("a", &http_ok).is_ok());

        let stdio_ok: Map<String, Value> =
            serde_json::from_value(serde_json::json!({ "command": "npx" })).unwrap();
        assert!(McpConfigService::validate_entry("a", &stdio_ok).is_ok());

        let empty: Map<String, Value> =
            serde_json::from_value(serde_json::json!({ "type": "http" })).unwrap();
        assert!(McpConfigService::validate_entry("a", &empty).is_err());
    }

    #[test]
    fn rejects_raw_sensitive_headers_and_accepts_env_references() {
        let raw: Map<String, Value> = serde_json::from_value(serde_json::json!({
            "type": "http",
            "url": "https://mcp.example/mcp",
            "headers": { "Authorization": "Bearer raw-token" }
        }))
        .unwrap();
        assert!(McpConfigService::validate_entry("a", &raw).is_err());

        let referenced: Map<String, Value> = serde_json::from_value(serde_json::json!({
            "type": "http",
            "url": "https://mcp.example/mcp",
            "headers": { "Authorization": "Bearer ${env:MCP_TOKEN}" }
        }))
        .unwrap();
        assert!(McpConfigService::validate_entry("a", &referenced).is_ok());
    }

    #[test]
    fn transport_validation_rejects_stale_mixed_fields() {
        let mixed: Map<String, Value> = serde_json::from_value(serde_json::json!({
            "type": "stdio",
            "command": "npx",
            "url": "https://mcp.example/mcp"
        }))
        .unwrap();
        assert!(McpConfigService::validate_entry("a", &mixed).is_err());
    }
}