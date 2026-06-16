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

const MAX_PARALLEL_SUBAGENTS: usize = 8;

/// Parameters for spawning a child agent.
pub(crate) struct SpawnParams<'a> {
    pub app: AppHandle,
    pub chat_id: String,
    pub agent_id: &'a str,
    pub task: &'a str,
    pub context: &'a str,
    pub explicit_model: Option<&'a str>,
    pub explicit_max_steps: Option<u64>,
    pub depth: u32,
    pub allowed_tools: Option<Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>>,
    pub token: CancellationToken,
    pub label: &'a str,
}

/// Parameters for emitting spawn completion events.
struct CompletionParams<'a> {
    app: &'a AppHandle,
    chat_id: &'a str,
    agent_id: &'a str,
    agent_name: &'a str,
    task: &'a str,
    spawn_id: &'a str,
    label: &'a str,
    status: &'a str,
    error: Option<&'a str>,
    result_summary: Option<&'a str>,
    duration_ms: u64,
}

fn result_summary(value: &Value) -> Option<String> {
    value
        .get("summary")
        .or_else(|| value.get("result").and_then(|result| result.get("summary")))
        .and_then(Value::as_str)
        .map(|summary| summary.chars().take(500).collect())
}

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
    pub(crate) async fn do_spawn(&self, params: SpawnParams<'_>) -> Result<Value> {
        let SpawnParams { app, chat_id, agent_id, task, context, explicit_model, explicit_max_steps, depth, allowed_tools, token, label } = params;
        child_runner::check_depth(depth)?;

        if agent_id == "voice_display" {
            anyhow::bail!(
                "voice_display is an internal render-only agent started automatically after a voice response; do not spawn it manually"
            );
        }

        let resolved = child_runner::resolve_agent(
            &self.agent_registry,
            agent_id,
            explicit_model,
            explicit_max_steps,
        )?;

        let delegation_prompt = child_runner::build_delegation_prompt(&resolved, task, context);
        let memory_scope = child_runner::subagent_memory_scope(agent_id, task);
        let child_messages =
            child_runner::build_child_messages(&app, &chat_id, &delegation_prompt).await;

        let mut child_runner_instance = child_runner::build_child_runner(child_runner::ChildRunnerParams {
            app: &app,
            tool_registry: self.tool_registry.clone(),
            agent_registry: self.agent_registry.clone(),
            hook_registry: self.hook_registry.clone(),
            permissions: self.permissions.clone(),
            parent_depth: depth,
            resolved: &resolved,
            allowed_tools,
        })?;
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
                let summary = result_summary(&structured_result);

                let _ = emit_completion_events(CompletionParams {
                    app: &app,
                    chat_id: &chat_id,
                    agent_id,
                    agent_name: &resolved.agent.name,
                    task,
                    spawn_id: &spawn_id,
                    label,
                    status: "completed",
                    error: None,
                    result_summary: summary.as_deref(),
                    duration_ms: spawn_duration_ms,
                });

                Ok(json!({
                    "spawn_id": spawn_id,
                    "agent_id": agent_id,
                    "agent_name": resolved.agent.name,
                    "status": "completed",
                    "result": structured_result,
                    "summary": summary,
                    "duration_ms": spawn_duration_ms,
                }))
            }
            Err(e) => {
                let _ = emit_completion_events(CompletionParams {
                    app: &app,
                    chat_id: &chat_id,
                    agent_id,
                    agent_name: &resolved.agent.name,
                    task,
                    spawn_id: &spawn_id,
                    label,
                    status: "failed",
                    error: Some(&e.to_string()),
                    result_summary: None,
                    duration_ms: spawn_duration_ms,
                });

                Ok(json!({
                    "spawn_id": spawn_id,
                    "agent_id": agent_id,
                    "agent_name": resolved.agent.name,
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
        "Spawn one or more sub-agents for independent specialized tasks. A batch runs in \
         parallel and returns all results, including failures, without discarding successful \
         siblings. Use separate calls when tasks depend on earlier results."
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
                },
                "agents": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": MAX_PARALLEL_SUBAGENTS,
                    "description": "Independent sub-agents to run concurrently. Use agent_id/task for one child.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "agent_id": { "type": "string" },
                            "task": { "type": "string" },
                            "context": { "type": "string" },
                            "max_steps": { "type": "integer", "minimum": 1 },
                            "model": { "type": "string" }
                        },
                        "required": ["agent_id", "task"]
                    }
                }
            },
            "oneOf": [
                { "required": ["agent_id", "task"] },
                { "required": ["agents"] }
            ]
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
        if let Some(agents) = input.get("agents").and_then(Value::as_array) {
            if agents.is_empty() || agents.len() > MAX_PARALLEL_SUBAGENTS {
                return Err(anyhow::anyhow!(
                    "agents must contain between 1 and {} entries",
                    MAX_PARALLEL_SUBAGENTS
                ));
            }

            let futures = agents.iter().map(|request| {
                let app = app.clone();
                let chat_id = chat_id.clone();
                let allowed_tools = allowed_tools.clone();
                let token = token.clone();
                async move {
                    let agent_id =
                        request
                            .get("agent_id")
                            .and_then(Value::as_str)
                            .ok_or_else(|| {
                                anyhow::anyhow!("Missing required field: agents[].agent_id")
                            })?;
                    let task = request
                        .get("task")
                        .and_then(Value::as_str)
                        .ok_or_else(|| anyhow::anyhow!("Missing required field: agents[].task"))?;
                    let context = request.get("context").and_then(Value::as_str).unwrap_or("");
                    let max_steps = request.get("max_steps").and_then(Value::as_u64);
                    let model = request.get("model").and_then(Value::as_str);
                    self.do_spawn(SpawnParams {
                        app,
                        chat_id,
                        agent_id,
                        task,
                        context,
                        explicit_model: model,
                        explicit_max_steps: max_steps,
                        depth,
                        allowed_tools,
                        token,
                        label: "Spawning",
                    })
                    .await
                }
            });

            let settled = futures::future::join_all(futures).await;
            let results = settled
                .into_iter()
                .map(|result| match result {
                    Ok(value) => value,
                    Err(error) => json!({ "status": "error", "error": error.to_string() }),
                })
                .collect::<Vec<_>>();
            let completed = results
                .iter()
                .filter(|result| result.get("status").and_then(Value::as_str) == Some("completed"))
                .count();

            return Ok(json!({
                "status": if completed == results.len() { "completed" } else if completed == 0 { "error" } else { "partial" },
                "parallel": true,
                "completed": completed,
                "failed": results.len() - completed,
                "results": results,
            }));
        }

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

        self.do_spawn(SpawnParams {
            app,
            chat_id,
            agent_id,
            task,
            context: "",
            explicit_model: model,
            explicit_max_steps: max_steps,
            depth,
            allowed_tools,
            token,
            label: "Spawning",
        })
        .await
    }
}

/// Shared helper to emit completion events for spawn/delegate tools.
fn emit_completion_events(params: CompletionParams<'_>) -> Result<()> {
    let CompletionParams { app, chat_id, agent_id, agent_name, task, spawn_id, label, status, error, result_summary, duration_ms } = params;
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
        format!(
            "✗ {} session failed: {}",
            agent_name,
            error.unwrap_or("unknown")
        )
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
            "result": result_summary.map(|summary| json!({ "summary": summary })),
            "duration_ms": duration_ms,
        }),
    );

    Ok(())
}
