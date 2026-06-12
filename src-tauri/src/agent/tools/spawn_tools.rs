use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

use crate::agent::hooks::HookRegistry;
use crate::agent::tools::child_runner;
use crate::agent::tools::AgentTool;
use crate::agent::tools::ToolRegistry;
use crate::agent::types::{ActionMeta, AgentRegistry, MessageKind, SpawnMeta};
use crate::commands::AppState;
use anyhow::Result;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

/// Tool that spawns a child agent runner for parallel sub-tasks.
/// The child agent runs with its own conversation context and bounded iterations,
/// then returns its final response as a tool result.
pub struct SpawnAgentTool {
    tool_registry: Arc<tokio::sync::RwLock<ToolRegistry>>,
    agent_registry: Arc<AgentRegistry>,
    hook_registry: Arc<HookRegistry>,
    permissions: crate::tools::GlobalToolRegistry,
}

impl SpawnAgentTool {
    pub fn new(
        tool_registry: Arc<tokio::sync::RwLock<ToolRegistry>>,
        agent_registry: Arc<AgentRegistry>,
        hook_registry: Arc<HookRegistry>,
        permissions: crate::tools::GlobalToolRegistry,
    ) -> Self {
        Self {
            tool_registry,
            agent_registry,
            hook_registry,
            permissions,
        }
    }

    /// Core child-agent execution logic. The deprecated delegate alias also
    /// calls this implementation for compatibility with persisted references.
    pub(crate) async fn do_spawn(
        &self,
        app: AppHandle,
        chat_id: String,
        agent_id: &str,
        task: &str,
        context: &str,
        explicit_model: Option<&str>,
        explicit_max_steps: Option<u64>,
        depth: u32,
        allowed_tools: Option<Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>>,
        token: CancellationToken,
        label: &str,
    ) -> Result<Value> {
        child_runner::check_depth(depth)?;

        let resolved =
            child_runner::resolve_agent(&self.agent_registry, agent_id, explicit_model, explicit_max_steps)?;

        let delegation_prompt = child_runner::build_delegation_prompt(&resolved, task, context);
        let memory_scope = child_runner::subagent_memory_scope(agent_id, task);
        let child_messages =
            child_runner::build_child_messages(&app, &chat_id, &delegation_prompt).await;

        let mut child_runner_instance = child_runner::build_child_runner(
            &app,
            self.tool_registry.clone(),
            self.agent_registry.clone(),
            self.hook_registry.clone(),
            self.permissions.clone(),
            depth,
            &resolved,
            allowed_tools,
        )?;
        child_runner_instance = child_runner_instance.with_memory_scope(memory_scope);

        let state = app.state::<AppState>();
        let provider = state.provider().await?;
        let spawn_id = Uuid::new_v4().to_string();

        // Emit spawn start
        let spawn_meta = ActionMeta {
            agent_id: agent_id.to_string(),
            agent_name: resolved.agent.name.clone(),
            iteration: 0,
            depth: 0,
            progress_percent: None,
            tool_call: None,
            tool_result: None,
            handoff: None,
            spawn: Some(SpawnMeta {
                parent_agent: label.to_string(),
                child_agent: resolved.agent.name.clone(),
                task: task.to_string(),
                status: "spawned".to_string(),
                duration_ms: None,
                spawn_id: Some(spawn_id.clone()),
            }),
            approval_request: None,
            ..Default::default()
        };

        let _ = app.emit(
            "chat:message",
            json!({
                "chat_id": chat_id,
                "kind": MessageKind::AgentSpawn.to_string(),
                "content": format!("{} to {} for: {}", label, resolved.agent.name, task.chars().take(80).collect::<String>()),
                "metadata": spawn_meta,
            }),
        );

        let subagent_token = CancellationToken::new();
        {
            let mut tokens = state.subagent_cancellation_tokens.lock().await;
            tokens.insert(spawn_id.clone(), subagent_token.clone());
        }

        let _ = app.emit(
            "agent:spawn",
            json!({
                "spawn_id": spawn_id,
                "parent_agent": label,
                "child_agent_id": resolved.agent.id,
                "child_agent_name": resolved.agent.name,
                "task": task,
                "chat_id": chat_id,
            }),
        );

        state
            .agent
            .event_bus
            .emit(crate::agent::event_bus::AgentEvent::AgentSpawned {
                agent_id: resolved.agent.id.clone(),
                agent_type: resolved.agent.name.clone(),
            });

        // Run child agent with cancellation support
        let spawn_start = std::time::Instant::now();
        let result = tokio::select! {
            biased;
            _ = token.cancelled() => {
                Err(anyhow::anyhow!("Parent cancelled — sub-agent aborted"))
            }
            _ = subagent_token.cancelled() => {
                Err(anyhow::anyhow!("Sub-agent task cancelled by user"))
            }
            res = child_runner_instance.run(
                provider.as_ref(),
                chat_id.clone(),
                resolved.model,
                child_messages,
                resolved.agent.clone(),
                crate::llm::ChatRequestConfig::default(),
                CancellationToken::child_token(&token),
            ) => res
        };

        // Cleanup token
        {
            let mut tokens = state.subagent_cancellation_tokens.lock().await;
            tokens.remove(&spawn_id);
        }
        let spawn_duration_ms = spawn_start.elapsed().as_millis() as u64;

        match result {
            Ok(response) => {
                let content = response
                    .content
                    .unwrap_or_else(|| "Sub-agent completed with no output.".to_string());

                let _ = emit_completion_events(
                    &app,
                    &chat_id,
                    agent_id,
                    &resolved.agent.name,
                    task,
                    &spawn_id,
                    label,
                    "completed",
                    None,
                    spawn_duration_ms,
                );

                let parsed: Result<serde_json::Value, _> = serde_json::from_str(&content);
                let structured_result = match parsed {
                    Ok(json) => json,
                    Err(_) => {
                        json!({
                            "status": "success",
                            "summary": content.chars().take(500).collect::<String>(),
                            "full_content": content,
                        })
                    }
                };

                Ok(json!({
                    "agent_id": agent_id,
                    "status": "completed",
                    "result": structured_result,
                    "duration_ms": spawn_duration_ms,
                }))
            }
            Err(e) => {
                let _ = emit_completion_events(
                    &app,
                    &chat_id,
                    agent_id,
                    &resolved.agent.name,
                    task,
                    &spawn_id,
                    label,
                    "failed",
                    Some(&e.to_string()),
                    spawn_duration_ms,
                );

                Ok(json!({
                    "agent_id": agent_id,
                    "status": "error",
                    "error": e.to_string(),
                    "duration_ms": spawn_duration_ms,
                }))
            }
        }
    }
}

#[async_trait]
impl AgentTool for SpawnAgentTool {
    fn id(&self) -> &str {
        "spawn_agent"
    }

    fn description(&self) -> &str {
        "Spawn a sub-agent to handle a specific task. The sub-agent runs independently with \
         its own conversation context and returns the result. Use this for parallel or \
         specialized subtasks like research, analysis, or operational mapping."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "agent_id": {
                    "type": "string",
                    "description": "ID of the agent to spawn (e.g. 'generalist', 'researcher', 'operational_expert')."
                },
                "task": {
                    "type": "string",
                    "description": "The task/question to give the sub-agent as a user message."
                },
                "max_steps": {
                    "type": "integer",
                    "description": "Maximum iterations for the sub-agent (default: 10).",
                    "default": 10
                },
                "model": {
                    "type": "string",
                    "description": "Optional model override for the sub-agent."
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

        let max_steps = input.get("max_steps").and_then(|v| v.as_u64());
        let model = input.get("model").and_then(|v| v.as_str());

        self.do_spawn(
            app,
            chat_id,
            agent_id,
            task,
            "",
            model,
            max_steps,
            depth,
            allowed_tools,
            token,
            "Spawning",
        )
        .await
    }
}

/// Shared helper to emit completion events for spawn/delegate tools.
fn emit_completion_events(
    app: &AppHandle,
    chat_id: &str,
    agent_id: &str,
    agent_name: &str,
    task: &str,
    spawn_id: &str,
    label: &str,
    status: &str,
    error: Option<&str>,
    duration_ms: u64,
) -> Result<()> {
    let state = app.state::<AppState>();

    // Emit chat:message completion
    let complete_meta = ActionMeta {
        agent_id: agent_id.to_string(),
        agent_name: agent_name.to_string(),
        iteration: 0,
        depth: 0,
        progress_percent: None,
        tool_call: None,
        tool_result: None,
        handoff: None,
        spawn: Some(SpawnMeta {
            parent_agent: label.to_string(),
            child_agent: agent_name.to_string(),
            task: task.to_string(),
            status: status.to_string(),
            duration_ms: Some(duration_ms),
            spawn_id: Some(spawn_id.to_string()),
        }),
        approval_request: None,
        ..Default::default()
    };

    let content = if status == "completed" {
        format!("{} completed in {}ms", agent_name, duration_ms)
    } else {
        format!("✗ {} session failed: {}", agent_name, error.unwrap_or("unknown"))
    };

    let _ = app.emit(
        "chat:message",
        json!({
            "chat_id": chat_id,
            "kind": MessageKind::AgentSpawn.to_string(),
            "content": content,
            "metadata": complete_meta,
        }),
    );

    state
        .agent
        .event_bus
        .emit(crate::agent::event_bus::AgentEvent::AgentTerminated {
            agent_id: agent_id.to_string(),
        });

    let _ = app.emit(
        "agent:complete",
        json!({
            "spawn_id": spawn_id,
            "agent_id": agent_id,
            "chat_id": chat_id,
            "parent_agent": label,
            "child_agent_id": agent_id,
            "child_agent_name": agent_name,
            "task": task,
            "status": status,
            "error": error,
            "duration_ms": duration_ms,
        }),
    );

    Ok(())
}
