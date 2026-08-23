use crate::agent::tools::ToolRegistry;
use anyhow::Result;
use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::AppHandle;

pub struct ListToolsTool {
    registry: Arc<ToolRegistry>,
}

impl ListToolsTool {
    pub fn new(registry: Arc<ToolRegistry>) -> Self {
        Self { registry }
    }
}

#[async_trait]
impl zen_tools::AgentTool<tauri::AppHandle> for ListToolsTool {
    fn id(&self) -> &str {
        "list_available_tools"
    }

    fn description(&self) -> &str {
        "Returns a list of all tools currently available to the agent, including their IDs and descriptions. \
         Use this when the user asks what you can do or what tools are available."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {},
            "additionalProperties": false
        })
    }

    async fn run(
        &self,
        _app: AppHandle,
        _chat_id: String,
        _input: Value,
        _depth: u32,
        _allowed_tools: Option<
            std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>,
        >,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let tools = self.registry.list();
        let mut tool_info = Vec::new();

        for tool in tools {
            tool_info.push(json!({
                "id": tool.id(),
                "description": tool.description(),
            }));
        }

        Ok(json!({
            "available_tools": tool_info
        }))
    }
}
