use crate::agent::tools::AgentTool;
use anyhow::Result;
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::AppHandle;

pub struct HandoffTool;

#[derive(Debug, Deserialize)]
struct HandoffArgs {
    target_agent_id: String,
    reason: String,
}

#[async_trait]
impl AgentTool for HandoffTool {
    fn id(&self) -> &str {
        "handoff_to_agent"
    }

    fn description(&self) -> &str {
        "Transfers control of the conversation to a specialized expert agent. \
         Use this when the query falls outside your primary domain but fits another agent's expertise."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "target_agent_id": {
                    "type": "string",
                    "description": "The ID of the expert agent to hand off to (e.g., 'operational_expert', 'generalist')"
                },
                "reason": {
                    "type": "string",
                    "description": "Brief explanation for the handoff"
                }
            },
            "required": ["target_agent_id", "reason"]
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
        let args: HandoffArgs = serde_json::from_value(input)?;
        Ok(json!({
            "status": "handoff_initiated",
            "target_agent_id": args.target_agent_id,
            "reason": args.reason
        }))
    }
}
