use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

use crate::agent::hooks::HookRegistry;
use crate::agent::runner::{Runner, MAX_SPAWN_DEPTH};
use crate::agent::tools::AgentTool;
use crate::agent::tools::ToolRegistry;
use crate::agent::types::{ActionMeta, AgentRegistry, MessageKind, SpawnMeta};
use crate::commands::AppState;
use crate::db::models::ChatMessage;
use anyhow::Result;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

/// Alias tool for spawn_agent - provides semantic clarity for LLM
/// When LLM wants to "delegate" rather than "spawn", it can use this tool
pub struct DelegateToAgentTool {
    tool_registry: Arc<tokio::sync::RwLock<ToolRegistry>>,
    agent_registry: Arc<AgentRegistry>,
    hook_registry: Arc<HookRegistry>,
    permissions: crate::tools::GlobalToolRegistry,
}

impl DelegateToAgentTool {
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
        token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        // Extract arguments
        let agent_id = input
            .get("agent_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing required field: agent_id"))?;

        let task = input
            .get("task")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing required field: task"))?;

        let context = input.get("context").and_then(|v| v.as_str()).unwrap_or("");

        let max_steps = input
            .get("max_steps")
            .and_then(|v| v.as_u64())
            .unwrap_or(10) as usize;

        // Look up the agent
        let agent = self.agent_registry.get(agent_id).cloned().ok_or_else(|| {
            anyhow::anyhow!(
                "Agent '{}' not found. Available: {:?}",
                agent_id,
                self.agent_registry
                    .list()
                    .iter()
                    .map(|a| &a.id)
                    .collect::<Vec<_>>()
            )
        })?;

        // Determine model to use
        let state = app.state::<AppState>();
        let db = state
            .db()
            .await
            .map_err(|e| anyhow::anyhow!("DB init failed: {}", e))?;
        let model = if let Some(override_model) = agent.model_override.clone() {
            override_model
        } else if let Ok(Some(saved_model)) =
            crate::db::queries::get_setting(&db, "model_name").await
        {
            saved_model
        } else {
            "gemini-1.5-flash".to_string()
        };

        // Create parent runner with inherited depth and permissions
        let state_ref = app.state::<crate::commands::AppState>();
        let tool_manager = state_ref.tool_manager.clone();
        let mut parent_runner = Runner::new(
            app.clone(),
            self.tool_registry.clone(),
            self.agent_registry.clone(),
            self.hook_registry.clone(),
            self.permissions.clone(),
            tool_manager,
        )
        .with_depth(depth);

        if let Some(allowed) = allowed_tools {
            parent_runner = parent_runner.with_allowed_tools(allowed);
        }

        // Check depth limit
        if parent_runner.depth >= MAX_SPAWN_DEPTH {
            return Ok(json!({
                "error": format!("Maximum agent nesting depth ({}) reached.", MAX_SPAWN_DEPTH),
                "hint": "Complete current sub-agents before spawning more."
            }));
        }

        let child_runner = parent_runner.child(max_steps);

        // Build delegation prompt with context
        let mut delegation_content = String::new();

        if !context.is_empty() {
            delegation_content.push_str(&format!("## Context\n{}\n\n", context));
        }

        delegation_content.push_str(&format!(
            r#"## Task Delegation

### Your Role
You are {}, a specialized AI agent.
{}

### Task
{}

### Instructions
1. Focus on completing this specific task efficiently
2. Use all your available tools
3. Provide a comprehensive, well-structured result
4. If you need to hand off to another specialist, use handoff_to_agent
"#,
            agent.name,
            agent
                .instructions
                .lines()
                .take(30)
                .collect::<Vec<_>>()
                .join("\n"),
            task
        ));

        // Build child conversation with parent context
        let mut child_messages = Vec::new();

        if let Ok(db) = state.db().await {
            if let Ok(parent_msgs) = crate::db::queries::get_messages(&db, &chat_id).await {
                let history: Vec<ChatMessage> = parent_msgs
                    .into_iter()
                    .filter(|m| m.role != "system")
                    .rev()
                    .take(10)
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .map(|m| ChatMessage {
                        role: m.role,
                        content: m.content,
                        images: m.images.as_ref().and_then(|s| serde_json::from_str(s).ok()),
                        tool_calls: m
                            .tool_calls
                            .as_ref()
                            .and_then(|s| serde_json::from_str(s).ok()),
                        tool_call_id: m.tool_call_id,
                    })
                    .collect();
                child_messages.extend(history);
            }
        }

        child_messages.push(ChatMessage {
            role: "user".to_string(),
            content: delegation_content,
            images: None,
            tool_calls: None,
            tool_call_id: None,
        });

        // Access LLM provider
        let provider = state.provider().await?;
        let provider_clone = provider.clone();

        // Generate unique spawn_id for event tracking and cancellation
        let spawn_id = Uuid::new_v4().to_string();

        // Emit spawn start action
        let spawn_meta = ActionMeta {
            agent_id: agent_id.to_string(),
            agent_name: agent.name.clone(),
            iteration: 0,
            depth: 0,
            progress_percent: None,
            tool_call: None,
            tool_result: None,
            handoff: None,
            spawn: Some(SpawnMeta {
                parent_agent: "delegator".to_string(),
                child_agent: agent.name.clone(),
                task: task.to_string(),
                status: "spawned".to_string(),
                duration_ms: None,
                spawn_id: Some(spawn_id.clone()),
            }),
            approval_request: None,
            ..Default::default()
        };

        let _ = app.emit("chat:message", json!({
            "chat_id": chat_id,
            "kind": MessageKind::AgentSpawn.to_string(),
            "content": format!("Delegating to {} for: {}", agent.name, task.chars().take(80).collect::<String>()),
            "metadata": spawn_meta,
        }));

        let subagent_token = CancellationToken::new();

        // Track the sub-agent token for direct task cancellation
        {
            let mut tokens = state.subagent_cancellation_tokens.lock().await;
            tokens.insert(spawn_id.clone(), subagent_token.clone());
        }

        let _ = app.emit(
            "agent:spawn",
            json!({
                "spawn_id": spawn_id,
                "parent_agent": "delegator",
                "child_agent_id": agent.id,
                "child_agent_name": agent.name,
                "task": task,
                "chat_id": chat_id,
            }),
        );

        state
            .agent
            .event_bus
            .emit(crate::agent::event_bus::AgentEvent::AgentSpawned {
                agent_id: agent.id.clone(),
                agent_type: agent.name.clone(),
            });

        // Run child agent with tokio::select! to handle parent cancellation
        let spawn_start = std::time::Instant::now();
        let result = tokio::select! {
            biased;
            _ = token.cancelled() => {
                Err(anyhow::anyhow!("Parent cancelled — delegation aborted"))
            }
            _ = subagent_token.cancelled() => {
                Err(anyhow::anyhow!("Delegated task cancelled by user"))
            }
            res = child_runner.run(
                provider_clone.as_ref(),
                chat_id.clone(),
                model,
                child_messages,
                agent.clone(),
                crate::llm::ChatRequestConfig::default(),
                CancellationToken::child_token(&token),
            ) => res
        };

        // Cleanup the token after completion
        {
            let mut tokens = state.subagent_cancellation_tokens.lock().await;
            tokens.remove(&spawn_id);
        }
        let spawn_duration_ms = spawn_start.elapsed().as_millis() as u64;

        match result {
            Ok(response) => {
                let content = response
                    .content
                    .unwrap_or_else(|| "Agent completed with no output.".to_string());

                // Emit spawn complete
                let complete_meta = ActionMeta {
                    agent_id: agent_id.to_string(),
                    agent_name: agent.name.clone(),
                    iteration: 0,
                    depth: 0,
                    progress_percent: None,
                    tool_call: None,
                    tool_result: None,
                    handoff: None,
                    spawn: Some(SpawnMeta {
                        parent_agent: "delegator".to_string(),
                        child_agent: agent.name.clone(),
                        task: task.to_string(),
                        status: "completed".to_string(),
                        duration_ms: Some(spawn_duration_ms),
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
                        "content": format!("{} completed in {}ms", agent.name, spawn_duration_ms),
                        "metadata": complete_meta,
                    }),
                );

                state
                    .agent
                    .event_bus
                    .emit(crate::agent::event_bus::AgentEvent::AgentTerminated {
                        agent_id: agent.id.clone(),
                    });

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

                // Emit agent:complete for UI
                let _ = app.emit(
                    "agent:complete",
                    json!({
                        "spawn_id": spawn_id,
                        "agent_id": agent_id,
                        "status": "completed",
                        "result": structured_result,
                        "duration_ms": spawn_duration_ms,
                    }),
                );

                Ok(json!({
                    "agent_id": agent_id,
                    "status": "completed",
                    "result": structured_result,
                    "duration_ms": spawn_duration_ms,
                }))
            }
            Err(e) => {
                state
                    .agent
                    .event_bus
                    .emit(crate::agent::event_bus::AgentEvent::AgentTerminated {
                        agent_id: agent.id.clone(),
                    });

                let _ = app.emit(
                    "agent:complete",
                    json!({
                        "spawn_id": spawn_id,
                        "agent_id": agent_id,
                        "status": "failed",
                        "error": e.to_string(),
                        "duration_ms": spawn_duration_ms,
                    }),
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
