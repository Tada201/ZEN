use async_trait::async_trait;
use serde_json::{json, Value};
use anyhow::Result;
use tauri::AppHandle;

use crate::agent::tools::AgentTool;
use crate::tools::{Tool, ToolOutput, ToolError};
use crate::tools::permission::RiskLevel;

/// A placeholder WebSearchTool that currently just returns a message.
/// In a real implementation, this would call a search API (Tavily, Brave, etc.)
pub struct WebSearchTool;

#[async_trait]
impl AgentTool for WebSearchTool {
    fn id(&self) -> &str {
        "web_search"
    }

    fn description(&self) -> &str {
        "Search the web for current information. Use this when you need facts or news not in the knowledge base."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query"
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
        _allowed_tools: Option<std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>>,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let query = input.get("query").and_then(|v| v.as_str()).unwrap_or("");
        Ok(json!(format!("Web search for '{}' returned: No real search provider configured yet. Please use web_fetch if you have a specific URL.", query)))
    }
}

#[async_trait]
impl Tool for WebSearchTool {
    fn name(&self) -> &str {
        "web_search"
    }

    fn description(&self) -> &str {
        "Search the web for current information."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query"
                }
            },
            "required": ["query"]
        })
    }

    fn risk_level(&self) -> RiskLevel {
        RiskLevel::Medium
    }

    async fn execute(
        &self,
        _app: AppHandle,
        _chat_id: String,
        args: Value,
    ) -> Result<ToolOutput, ToolError> {
        let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
        Ok(ToolOutput {
            content: json!(format!("Web search for '{}' (Placeholder)", query)),
            metadata: None,
        })
    }
}
