use std::sync::Arc;
use async_trait::async_trait;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

use crate::agent::tools::AgentTool;
use crate::agent::runner::{Runner, MAX_SPAWN_DEPTH};
use crate::agent::types::{AgentRegistry, ActionMeta, SpawnMeta, MessageKind};
use crate::agent::hooks::HookRegistry;
use crate::agent::tools::ToolRegistry;
use anyhow::Result;
use crate::commands::AppState;
use crate::db::models::ChatMessage;
use uuid::Uuid;
use tokio_util::sync::CancellationToken;

/// Tool that spawns a child agent runner for parallel sub-tasks.
/// The child agent runs with its own conversation context and bounded iterations,
/// then returns its final response as a tool result.
///
/// Unlike other tools, SpawnAgentTool accesses the LLM provider through the
/// AppHandle's managed state, so it doesn't need a direct LLM reference.
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
        Self { tool_registry, agent_registry, hook_registry, permissions }
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
        token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let agent_id = input.get("agent_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing required field: agent_id"))?;

        let task = input.get("task")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing required field: task"))?;

        let max_steps = input.get("max_steps")
            .and_then(|v| v.as_u64())
            .unwrap_or(10) as usize;

        let model_override = input.get("model")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        // Look up the agent
        let agent = self.agent_registry.get(agent_id)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!(
                "Agent '{}' not found. Available: {:?}",
                agent_id,
                self.agent_registry.list().iter().map(|a| &a.id).collect::<Vec<_>>()
            ))?;

        // Determine model to use (priority: explicit override > agent override > active setting)
        let state = app.state::<crate::commands::AppState>();
        let model = if let Some(m) = model_override.or(agent.model_override.clone()) {
            m
        } else {
            crate::db::queries::get_setting(&state.db().await.map_err(|e| anyhow::anyhow!("DB init failed: {}", e))?, "model_name")
                .await?
                .unwrap_or_else(|| "gemini-1.5-flash".to_string())
        };

        // Check depth limit before spawning (prevents infinite recursion)
        if depth >= MAX_SPAWN_DEPTH {
            return Ok(json!({
                "error": format!("Maximum agent nesting depth ({}) reached. Cannot spawn more sub-agents.", MAX_SPAWN_DEPTH),
                "hint": "Try completing the task with current agents or break the task into smaller steps."
            }));
        }

        // Create child runner with bounded iterations via parent context if available
        // Note: Since AgentTool::run is called from Runner::execute_single_tool,
        // we should ideally have access to the parent runner, but the current trait
        // is stateless. The simplest fix is to use the passed-in depth.
        let mut child_runner = Runner::new(
            app.clone(),
            self.tool_registry.clone(),
            self.agent_registry.clone(),
            self.hook_registry.clone(),
            self.permissions.clone(),
        ).with_depth(depth + 1).with_max_iterations(max_steps);

        if let Some(allowed) = allowed_tools {
            child_runner = child_runner.with_allowed_tools(allowed);
        }
        
        // Create unique memory scope for this subagent task
        // Format: subagent:{agent_id}:{timestamp}:{task_hash}
        let task_hash = {
            use sha2::{Sha256, Digest};
            let mut hasher = Sha256::new();
            hasher.update(task.as_bytes());
            format!("{:x}", hasher.finalize())[..8].to_string()
        };
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let memory_scope = format!("subagent:{}:{}:{}", agent_id, timestamp, task_hash);
        
        let child_runner = child_runner.with_memory_scope(memory_scope.clone());

        // Build structured delegation prompt for the sub-agent
        let delegation_prompt = format!(
            r#"## TASK DELEGATION

### Your Role
You are {}, a specialized AI agent.
{}

### Task to Execute
{}

### Output Requirements
1. Provide a comprehensive response addressing the task
2. If using tools, explain what you're doing and why
3. If you need to hand off to another specialist, use handoff_to_agent
4. Return your final result clearly formatted

### Context
This task was delegated to you by the main agent. Focus on completing this specific task.
"#,
            agent.name,
            agent.instructions.lines().take(50).collect::<Vec<_>>().join("\n"),
            task
        );

        // Build child conversation with parent context so sub-agent knows what's been discovered.
        // Fetch last 10 messages from parent chat to avoid token bloat.
        let mut child_messages = Vec::new();

        let context_state = app.state::<crate::commands::AppState>();
        if let Ok(db) = context_state.db().await {
            if let Ok(parent_msgs) = crate::db::queries::get_messages(&db, &chat_id).await {
                // Take last 10 messages (most recent context), skip system messages
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
                        tool_calls: m.tool_calls.as_ref().and_then(|s| serde_json::from_str(s).ok()),
                        tool_call_id: m.tool_call_id,
                    })
                    .collect();
                child_messages.extend(history);
            }
        }

        // Append the delegation task as the final user message
        child_messages.push(ChatMessage {
            role: "user".to_string(),
            content: delegation_prompt,
            images: None,
            tool_calls: None,
            tool_call_id: None,
        });

        // Access the LLM provider through AppHandle → managed AppState
        let state = app.state::<AppState>();
        let provider = state.llm.read().await;

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
                parent_agent: "parent".to_string(),
                child_agent: agent.name.clone(),
                task: task.to_string(),
                status: "spawned".to_string(),
                duration_ms: None,
                spawn_id: Some(spawn_id.clone()),
            }),
            approval_request: None,
            ..Default::default()
        };

        // Emit chat:message for timeline display
        let _ = app.emit("chat:message", json!({
            "chat_id": chat_id,
            "kind": MessageKind::AgentSpawn.to_string(),
            "content": format!("Spawning {} for: {}", agent.name, task.chars().take(80).collect::<String>()),
            "metadata": spawn_meta,
        }));

        let subagent_token = CancellationToken::new();
        
        // Track the sub-agent token for direct task cancellation
        {
            let mut tokens = state.subagent_cancellation_tokens.lock().await;
            tokens.insert(spawn_id.clone(), subagent_token.clone());
        }

        // Emit agent:spawn event for UI detection
        let _ = app.emit("agent:spawn", json!({
            "spawn_id": spawn_id,
            "parent_agent": agent_id,
            "child_agent_id": agent.id,
            "child_agent_name": agent.name,
            "task": task,
            "chat_id": chat_id,
        }));

        // Emit internal AgentEvent::AgentSpawned for backend coordination (ISSUE-008)
        state.agent.event_bus.emit(crate::agent::event_bus::AgentEvent::AgentSpawned {
            agent_id: agent.id.clone(),
            agent_type: agent.name.clone(),
        });

        // Wrap in tokio::select! to handle parent cancellation
        let spawn_start = std::time::Instant::now();
        let result = tokio::select! {
            biased;
            _ = token.cancelled() => {
                Err(anyhow::anyhow!("Parent cancelled — sub-agent aborted"))
            }
            _ = subagent_token.cancelled() => {
                Err(anyhow::anyhow!("Sub-agent task cancelled by user"))
            }
            res = child_runner.run(
                provider.as_deref().ok_or_else(|| anyhow::anyhow!("LLM not initialized"))?,
                chat_id.clone(),
                model,
                child_messages,
                agent.clone(),
                crate::llm::ChatRequestConfig::default(),
                CancellationToken::child_token(&token), // Pass a child token
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
                let content = response.content.unwrap_or_else(|| "Sub-agent completed with no output.".to_string());

                // Emit spawn complete action
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
                        parent_agent: "parent".to_string(),
                        child_agent: agent.name.clone(),
                        task: task.to_string(),
                        status: "completed".to_string(),
                        duration_ms: Some(spawn_duration_ms),
                        spawn_id: Some(spawn_id.clone()),
                    }),
                    approval_request: None,
                    ..Default::default()
                };
                let _ = app.emit("chat:message", json!({
                    "chat_id": chat_id,
                    "kind": MessageKind::AgentSpawn.to_string(),
                    "content": format!("{} completed in {}ms", agent.name, spawn_duration_ms),
                    "metadata": complete_meta,
                }));

                // ✅ FIX #1: Emit explicit session end marker
                let session_end_meta = ActionMeta {
                    agent_id: agent_id.to_string(),
                    agent_name: agent.name.clone(),
                    iteration: 0,
                    depth: 0,
                    progress_percent: None,
                    tool_call: None,
                    tool_result: None,
                    handoff: None,
                    spawn: Some(SpawnMeta {
                        parent_agent: "parent".to_string(),
                        child_agent: agent.name.clone(),
                        task: task.to_string(),
                        status: "session_ended".to_string(),
                        duration_ms: Some(spawn_duration_ms),
                        spawn_id: Some(spawn_id.clone()),
                    }),
                    approval_request: None,
                    ..Default::default()
                };
                let _ = app.emit("chat:message", json!({
                    "chat_id": chat_id,
                    "kind": MessageKind::AgentSpawn.to_string(),
                    "content": format!("─ {} session ended [{}: {} completion]", agent.name, agent_id, spawn_duration_ms),
                    "metadata": session_end_meta,
                }));

                // Emit internal AgentEvent::AgentTerminated for backend coordination (ISSUE-008)
                state.agent.event_bus.emit(crate::agent::event_bus::AgentEvent::AgentTerminated {
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

                // Emit agent:complete event for UI task board tracking
                let _ = app.emit("agent:complete", json!({
                    "spawn_id": spawn_id,
                    "agent_id": agent.id, // Use consistent canonical ID
                    "chat_id": chat_id,
                    "status": "completed",
                    "result": structured_result,
                    "duration_ms": spawn_duration_ms,
                }));

                Ok(json!({
                    "agent_id": agent_id,
                    "status": "completed",
                    "result": structured_result,
                    "duration_ms": spawn_duration_ms,
                }))
            }
            Err(e) => {
                // ✅ FIX #1: Emit explicit session end marker on error
                let error_session_meta = ActionMeta {
                    agent_id: agent_id.to_string(),
                    agent_name: agent.name.clone(),
                    iteration: 0,
                    depth: 0,
                    progress_percent: None,
                    tool_call: None,
                    tool_result: None,
                    handoff: None,
                    spawn: Some(SpawnMeta {
                        parent_agent: "parent".to_string(),
                        child_agent: agent.name.clone(),
                        task: task.to_string(),
                        status: "session_failed".to_string(),
                        duration_ms: Some(spawn_duration_ms),
                        spawn_id: Some(spawn_id.clone()),
                    }),
                    approval_request: None,
                    ..Default::default()
                };
                let _ = app.emit("chat:message", json!({
                    "chat_id": chat_id,
                    "kind": MessageKind::AgentSpawn.to_string(),
                    "content": format!("✗ {} session failed: {}", agent.name, e),
                    "metadata": error_session_meta,
                }));

                // Emit internal AgentEvent::AgentTerminated for backend coordination (ISSUE-008)
                state.agent.event_bus.emit(crate::agent::event_bus::AgentEvent::AgentTerminated {
                    agent_id: agent.id.clone(),
                });

                // Emit agent:complete event for UI task board tracking (error case)
                let _ = app.emit("agent:complete", json!({
                    "spawn_id": spawn_id,
                    "agent_id": agent.id, // Use consistent canonical ID
                    "chat_id": chat_id,
                    "status": "failed",
                    "error": e.to_string(),
                    "duration_ms": spawn_duration_ms,
                }));

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
