//! MCP Client — connects to external MCP servers configured via `.mcp.json`.
//!
//! Reads the workspace `.mcp.json`, discovers `tools/list` from each external
//! server, registers them with `ext:{server}:{name}` prefix, and proxies
//! `tools/call` requests.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};

use crate::services::McpConfigService;
use crate::tools::{ToolDefinition, ToolRegistry};

/// Client for connecting to external MCP servers.
pub struct McpClient {
    tool_registry: Arc<RwLock<ToolRegistry>>,
    mcp_config: Arc<McpConfigService>,
    /// External MCP server name → base URL. Populated by `sync_external_servers()`.
    external_server_urls: std::sync::Mutex<HashMap<String, String>>,
}

impl McpClient {
    pub fn new(
        tool_registry: Arc<RwLock<ToolRegistry>>,
        mcp_config: Arc<McpConfigService>,
    ) -> Self {
        Self {
            tool_registry,
            mcp_config,
            external_server_urls: std::sync::Mutex::new(HashMap::new()),
        }
    }

    /// Sync external servers from `.mcp.json` into the tool registry.
    /// Each external server's tools are registered with an `ext:{server}:`
    /// prefix. Failures for individual servers are logged but do not block.
    pub async fn sync_external_servers(&self) {
        let config = match self.mcp_config.read_config().await {
            Ok(c) => c,
            Err(e) => {
                info!(
                    "sync_external_servers: config read failed ({}), skipping",
                    e
                );
                return;
            }
        };
        let servers = match config["mcpServers"].as_object() {
            Some(s) => s,
            None => return,
        };
        if servers.is_empty() {
            return;
        }
        info!(
            "sync_external_servers: {} external servers found",
            servers.len()
        );

        for (server_name, server_cfg) in servers {
            let url = match server_cfg["url"].as_str() {
                Some(u) => u.to_string(),
                None => {
                    warn!(
                        "sync_external_servers: server '{}' has no url, skipping",
                        server_name
                    );
                    continue;
                }
            };

            info!(
                "sync_external_servers: connecting to '{}' at {}",
                server_name, url
            );

            let tools_url = url.trim_end_matches('/').to_string() + "/tools/list";
            // Store the base URL for later execution routing.
            {
                let mut urls = self.external_server_urls.lock().unwrap();
                urls.insert(server_name.clone(), url.clone());
            }
            let client = reqwest::Client::new();
            let body = serde_json::json!({
                "jsonrpc": "2.0",
                "method": "tools/list",
                "id": 1,
            });

            let resp = match client
                .post(&tools_url)
                .json(&body)
                .timeout(std::time::Duration::from_secs(10))
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    warn!(
                        "sync_external_servers: request to '{}' failed: {}",
                        server_name, e
                    );
                    continue;
                }
            };

            let result: serde_json::Value = match resp.json().await {
                Ok(v) => v,
                Err(e) => {
                    warn!(
                        "sync_external_servers: bad json from '{}': {}",
                        server_name, e
                    );
                    continue;
                }
            };

            let tools = match result["result"]["tools"].as_array() {
                Some(t) => t.clone(),
                None => {
                    warn!(
                        "sync_external_servers: no tools array in response from '{}'",
                        server_name
                    );
                    continue;
                }
            };

            let mut registry = self.tool_registry.write().await;
            for tool_json in tools {
                let name = tool_json["name"].as_str().unwrap_or("unknown").to_string();
                let description = tool_json["description"].as_str().unwrap_or("").to_string();
                let parameters = tool_json["input_schema"].clone();
                let def = ToolDefinition {
                    name: name.clone(),
                    description,
                    parameters,
                    risk_level: None,
                    output_schema: Some(tool_json["output_schema"].clone()),
                    annotations: None,
                };
                registry.register_external(server_name, def);
                info!(
                    "sync_external_servers: registered ext:{}:{} from '{}'",
                    server_name, name, server_name
                );
            }
        }
    }

    /// Execute a tool on an external MCP server via HTTP POST.
    /// The `tool_name` is the full `ext:{server}:{name}` prefixed name.
    /// Returns the tool result as a JSON value.
    pub async fn execute_external_tool(
        &self,
        tool_name: &str,
        arguments: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        // Parse prefix: ext:{server}:{tool}
        let without_prefix = tool_name.strip_prefix("ext:").unwrap_or(tool_name);
        let (server_name, actual_tool) = without_prefix
            .split_once(':')
            .ok_or_else(|| format!("Invalid external tool name: {}", tool_name))?;

        let url = {
            let urls = self.external_server_urls.lock().unwrap();
            urls.get(server_name)
                .cloned()
                .ok_or_else(|| format!("No URL for external MCP server '{}'", server_name))?
        };

        let call_url = format!("{}/tools/call", url.trim_end_matches('/'));
        let body = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {
                "name": actual_tool,
                "arguments": arguments,
            },
            "id": 1,
        });

        let client = reqwest::Client::new();
        let resp = client
            .post(&call_url)
            .json(&body)
            .timeout(std::time::Duration::from_secs(30))
            .send()
            .await
            .map_err(|e| format!("External MCP call failed: {}", e))?;

        let result: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Bad JSON from external server: {}", e))?;

        // Extract the tool result from JSON-RPC response
        if let Some(error) = result.get("error") {
            let msg = error
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("Unknown error");
            return Err(format!("External tool error: {}", msg));
        }

        result
            .get("result")
            .cloned()
            .ok_or_else(|| "External tool returned no result".to_string())
    }

    /// Check if a tool name is an external tool (starts with `ext:`).
    pub fn is_external_tool(name: &str) -> bool {
        name.starts_with("ext:")
    }
}
