#![allow(deprecated)]

use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::AppHandle;

use crate::agent::hooks::HookRegistry;
use crate::agent::tools::spawn_tools::SpawnAgentTool;
use crate::agent::tools::AgentTool;
use crate::agent::tools::ToolRegistry;
use crate::agent::types::AgentRegistry;
use anyhow::Result;
use tokio_util::sync::CancellationToken;

/// Deprecated compatibility alias for `spawn_agent`.
///
/// Delegates entirely to `SpawnAgentTool::do_spawn` with the same
/// parameters. It is intentionally not registered in progressive discovery,
/// the agent tool factory, or default agent allowlists, so models cannot select it.
#[deprecated(
    since = "0.1.0",
    note = "Use spawn_agent for child work or handoff_to_agent to transfer conversation ownership"
)]
pub struct DelegateToAgentTool {
    inner: SpawnAgentTool,
}

impl DelegateToAgentTool {
    pub fn new(
        tool_registry: Arc<tokio::sync::RwLock<ToolRegistry>>,
        agent_registry: Arc<AgentRegistry>,
        hook_registry: Arc<HookRegistry>,
        permissions: crate::tools::GlobalToolRegistry,
    ) -> Self {
        Self {
            inner: SpawnAgentTool::new(tool_registry, agent_registry, hook_registry, permissions),
        }
    }
}

#[async_trait]
impl AgentTool for DelegateToAgentTool {
    fn id(&self) -> &str {
        "delegate_to_agent"
    }

    fn description(&self) -> &str {
        "Delegate a task to a specialized agent. This is the preferred way to hand off work \
         to team members. Use this when you need expertise outside your scope."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "agent_id": {
                    "type": "string",
                    "description": "ID of the specialist agent to delegate to (e.g. 'operational_expert', 'researcher')."
                },
                "task": {
                    "type": "string",
                    "description": "Clear, specific task description for the specialist."
                },
                "context": {
                    "type": "string",
                    "description": "Optional: Additional context from the conversation to help the specialist.",
                    "default": ""
                },
                "max_steps": {
                    "type": "integer",
                    "description": "Maximum iterations for the specialist agent (default: 10).",
                    "default": 10
                }
            },
            "required": ["agent_id", "task"]
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        chat_id: String,
        input: Value,
        depth: u32,
        allowed_tools: Option<Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>>,
        token: CancellationToken,
    ) -> Result<Value> {
        let agent_id = input
            .get("agent_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing required field: agent_id"))?;

        let task = input
            .get("task")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing required field: task"))?;

        let context = input.get("context").and_then(|v| v.as_str()).unwrap_or("");
        let max_steps = input.get("max_steps").and_then(|v| v.as_u64());

        self.inner
            .do_spawn(crate::agent::tools::spawn_tools::SpawnParams {
                app,
                chat_id,
                agent_id,
                task,
                context,
                explicit_model: None,
                explicit_max_steps: max_steps,
                depth,
                allowed_tools,
                token,
                label: "Delegating",
            })
            .await
    }
}
