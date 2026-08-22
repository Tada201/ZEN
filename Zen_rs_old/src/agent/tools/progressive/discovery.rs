use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::{Arc, Weak};
use tauri::AppHandle;
use tokio::sync::RwLock;

use crate::agent::tools::progressive::ProgressiveToolRegistry;
use crate::agent::tools::AgentTool;

pub(super) struct ToolsSearchTool {
    registry: Weak<RwLock<ProgressiveToolRegistry>>,
}

impl ToolsSearchTool {
    pub(super) fn new(registry: Arc<RwLock<ProgressiveToolRegistry>>) -> Self {
        Self {
            registry: Arc::downgrade(&registry),
        }
    }
}

#[async_trait]
impl AgentTool for ToolsSearchTool {
    fn id(&self) -> &str {
        "tools_search"
    }

    fn description(&self) -> &str {
        "Search for available tools by name, category, or description. Use this to discover and select appropriate tools for a given task."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query to find relevant tools (e.g., 'file operations', 'map navigation', 'system metrics')"
                }
            },
            "required": ["query"]
        })
    }

    async fn run(
        &self,
        _app: AppHandle,
        _chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<
            std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>,
        >,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let query = input["query"]
            .as_str()
            .ok_or_else(|| anyhow!("query is required"))?;

        let registry_arc = self
            .registry
            .upgrade()
            .ok_or_else(|| anyhow!("Registry has been dropped"))?;
        let results = {
            let registry_guard = registry_arc.read().await;
            registry_guard.search_tools(query)
        };

        if results.is_empty() {
            return Ok(json!({
                "message": "No tools found matching your query. Try different keywords or use 'list_tools' to see all available tools.",
                "results": []
            }));
        }

        let tool_summaries: Vec<Value> = results
            .into_iter()
            .map(|m| {
                json!({
                    "id": m.id,
                    "name": m.name,
                    "description": m.description,
                    "category": m.category,
                    "tags": m.tags,
                    "detailLevel": m.detail_level
                })
            })
            .collect();

        Ok(json!({
            "message": format!("Found {} matching tool(s). Use these tool IDs to call specific tools.", tool_summaries.len()),
            "results": tool_summaries
        }))
    }
}

pub(super) struct ListToolsStandalone {
    registry: Weak<RwLock<ProgressiveToolRegistry>>,
}

impl ListToolsStandalone {
    pub(super) fn new(registry: Arc<RwLock<ProgressiveToolRegistry>>) -> Self {
        Self {
            registry: Arc::downgrade(&registry),
        }
    }
}

#[async_trait]
impl AgentTool for ListToolsStandalone {
    fn id(&self) -> &str {
        "list_tools"
    }

    fn description(&self) -> &str {
        "Lists all available tools with their descriptions. Use to see what tools are currently accessible."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "description": "Optional category filter (search, file, system, map, osint, agent, memory, visualization)"
                }
            },
            "additionalProperties": false
        })
    }

    async fn run(
        &self,
        _app: AppHandle,
        _chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<
            std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>,
        >,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let registry_arc = self
            .registry
            .upgrade()
            .ok_or_else(|| anyhow!("Registry has been dropped"))?;
        let metadata = {
            let registry_guard = registry_arc.read().await;
            registry_guard.get_metadata()
        };

        let category_filter = input.get("category").and_then(|v| v.as_str());

        let filtered: Vec<Value> = metadata
            .into_iter()
            .filter(|m| {
                if let Some(cat) = category_filter {
                    m.category == cat
                } else {
                    true
                }
            })
            .map(|m| {
                json!({
                    "id": m.id,
                    "name": m.name,
                    "description": m.description,
                    "category": m.category,
                    "detailLevel": m.detail_level
                })
            })
            .collect();

        Ok(json!({
            "total_tools": filtered.len(),
            "tools": filtered
        }))
    }
}
