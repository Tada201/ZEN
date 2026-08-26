//! `SpawnAgentTool` construction and `do_spawn`: the core child-agent run.

use std::collections::VecDeque;
use std::sync::Arc;
use tauri::Manager;
use tokio_util::sync::CancellationToken;

use anyhow::Result;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::agent::hooks::HookRegistry;
use crate::agent::tools::child_runner;
use crate::agent::types::AgentRegistry;
use crate::commands::AppState;

use super::completion::{emit_completion_events, CompletionParams};
use super::failure::{
    classify_spawn_error, spawn_failure_status, ErrorClass, SpawnFailure, SpawnFailureError,
};
use super::messaging::collect_intermediate_segments;
use super::model_select::{
    configured_agent_model, configured_agent_reasoning, inherited_model_for_child,
};
use super::outcome::validate_subagent_output;
use super::params::SpawnParams;
use super::{MAX_GLOBAL_CONCURRENT_SUBAGENTS, SUBAGENT_TIMEOUT_SECONDS};

static SUBAGENT_CONCURRENCY: std::sync::LazyLock<Arc<tokio::sync::Semaphore>> =
    std::sync::LazyLock::new(|| Arc::new(tokio::sync::Semaphore::new(MAX_GLOBAL_CONCURRENT_SUBAGENTS)));

/// Tool that spawns a child agent runner for parallel sub-tasks.
/// The child agent runs with its own conversation context and bounded iterations,
/// then returns its final response as a tool result.
pub struct SpawnAgentTool {
    agent_registry: Arc<AgentRegistry>,
    hook_registry: Arc<HookRegistry>,
}

impl SpawnAgentTool {
    pub fn new(
        agent_registry: Arc<AgentRegistry>,
        hook_registry: Arc<HookRegistry>,
    ) -> Self {
        Self {
            agent_registry,
            hook_registry,
        }
    }

    /// Core child-agent execution logic. The deprecated delegate alias also
    /// calls this implementation for compatibility with persisted references.
    pub(crate) async fn do_spawn(&self, params: SpawnParams<'_>) -> Result<Value> {
        let SpawnParams {
            app,
            chat_id,
            agent_id,
            task,
            context,
            explicit_model,
            explicit_max_steps,
            depth,
            allowed_tools,
            token,
            label,
            adhoc_instructions,
            adhoc_tools,
            success_criteria,
            constraints,
            relevant_files,
            parent_tool_call_id,
        } = params;
        if agent_id == "voice_display" {
            anyhow::bail!(
                "voice_display is an internal render-only agent started automatically after a voice response; do not spawn it manually"
            );
        }

        // Determine the caller's tool ceiling so ad-hoc agents inherit the
        // same authority (minus delegation tools) instead of the hardcoded
        // generalist set.
        let caller_tool_ids: Vec<String> = if let Some(ref allowed) = allowed_tools {
            let guard = allowed.lock().await;
            guard.iter().cloned().collect()
        } else {
            Vec::new()
        };

        // Built-in profiles ship without a model override, so a child must be
        // able to inherit the model the parent turn is running on. Prefer the
        // chat's own model, then the globally selected one. Resolving this
        // before `resolve_agent` keeps the "no model anywhere" case a single
        // actionable error instead of an opaque provider rejection.
        let inherited_model = inherited_model_for_child(&app, &chat_id).await;

        // A per-agent model chosen in the Subagents settings page (stored under
        // `agent_model.<id>`) lets a built-in like generalist/explore run on a
        // specific model without editing its fixed profile. An explicit `model`
        // in the spawn call still wins for that one run; otherwise the
        // configured selection takes priority over the inherited parent model
        // and carries its own provider.
        let configured_model = if explicit_model.is_some() || adhoc_instructions.is_some() {
            None
        } else {
            configured_agent_model(&app, agent_id).await
        };
        let effective_explicit: Option<String> = explicit_model
            .map(str::to_string)
            .or_else(|| configured_model.as_ref().map(|(_, model)| model.clone()));

        let mut resolved = if let Some(instructions) = adhoc_instructions {
            child_runner::resolve_adhoc_agent(
                &self.agent_registry,
                if agent_id.is_empty() { None } else { Some(agent_id) },
                instructions,
                &adhoc_tools,
                &caller_tool_ids,
                explicit_model,
                inherited_model.as_deref(),
                explicit_max_steps,
            )?
        } else {
            child_runner::resolve_agent(
                &self.agent_registry,
                agent_id,
                effective_explicit.as_deref(),
                inherited_model.as_deref(),
                explicit_max_steps,
            )?
        };
        // Pin the provider paired with a configured per-agent model. resolve_agent
        // clears model_provider whenever an explicit model is supplied (so it
        // falls back to the active provider); the configured selection may name a
        // provider other than the active one, so restore it here.
        if let Some((Some(provider), _)) = configured_model.as_ref() {
            resolved.model_provider = Some(provider.clone());
        }
        // Phase 11: inject_workspace_agents_md reads the workspace root off
        // the context instead of a host handle.
        let agent_ctx = app.state::<crate::services::agent_context::AgentContext>().inner().clone();
        child_runner::inject_workspace_agents_md(&agent_ctx.workspace_folder, &mut resolved).await;

        let handoff = child_runner::build_subagent_handoff(
            &resolved,
            task,
            context,
            success_criteria,
            &constraints,
            &relevant_files,
        );
        let child_messages = child_runner::build_child_messages_from_handoff(&handoff);
        let memory_scope = child_runner::subagent_memory_scope(agent_id, task);

        let spawn_id = Uuid::new_v4().to_string();
        let parent_tool_call_id = parent_tool_call_id.clone();

        // Create a shared inbox so the parent/orchestrator can inject messages
        // into this sub-agent while it is running.
        let message_inbox: Arc<tokio::sync::Mutex<VecDeque<zen_db::models::ChatMessage>>> =
            Arc::new(tokio::sync::Mutex::new(VecDeque::new()));
        let child_tool_call_ids = Arc::new(tokio::sync::Mutex::new(Vec::new()));
        let intermediate_commentary: Arc<tokio::sync::Mutex<Vec<(u64, String)>>> =
            Arc::new(tokio::sync::Mutex::new(Vec::new()));

        let mut child_runner_instance =
            child_runner::build_child_runner(child_runner::ChildRunnerParams {
                ctx: &agent_ctx,
                agent_registry: self.agent_registry.clone(),
                hook_registry: self.hook_registry.clone(),
                parent_depth: depth,
                resolved: &resolved,
                allowed_tools,
            })?;
        // Use the stable spawn_id as the child runner's trace_id so every tool
        // event emitted by the sub-agent is correlated with this subagent step.
        child_runner_instance = child_runner_instance
            .with_trace_id(spawn_id.clone())
            .with_parent_tool_call_id(parent_tool_call_id.clone())
            .with_child_tool_call_ids(child_tool_call_ids.clone())
            .with_intermediate_commentary(intermediate_commentary.clone())
            .with_memory_scope(memory_scope)
            .with_message_inbox(message_inbox.clone());

        let state = app.state::<AppState>();
        let provider = if let Some(provider_name) = resolved.model_provider.as_deref() {
            let db = state.db().await?;
            state.provider_by_name(provider_name, &db).await?
        } else {
            state.provider().await?
        };

        // Apply the per-agent reasoning effort chosen in the Subagents page (when
        // an explicit/ad-hoc run hasn't overridden the agent). Normalized through
        // the model's resolved capability so an unsupported level is clamped or
        // dropped rather than sent raw. Empty means inherit → no override.
        let child_config = {
            let mut cfg = zen_llm::ChatRequestConfig::default();
            let configured_effort = if explicit_model.is_some() || adhoc_instructions.is_some() {
                None
            } else {
                configured_agent_reasoning(&app, agent_id).await
            };
            if let Some(effort) = configured_effort {
                let capability = provider.reasoning_capability(&resolved.model);
                let intent = zen_llm::ReasoningIntent {
                    enabled: true,
                    effort: Some(effort),
                    budget_tokens: None,
                };
                cfg.resolved_reasoning = Some(capability.normalize_request(&intent));
            }
            cfg
        };
        tracing::info!(
            spawn_id = %spawn_id,
            agent_id = %agent_id,
            model = %resolved.model,
            model_provider = resolved.model_provider.as_deref().unwrap_or("<active>"),
            "Spawning sub-agent"
        );

        // Register the inbox only after all fallible setup (runner build,
        // provider resolution) has succeeded. Registering earlier leaked an
        // orphaned queue whenever an early `?` return skipped the cleanup path.
        {
            let mut queues = state.subagent_message_queues.lock().await;
            queues.insert(spawn_id.clone(), message_inbox);
        }

        // Register this sub-agent instance with the SwarmCoordinator so the
        // swarm view stays consistent with actual running sub-agents.
        let swarm_agent = crate::agent::types::Agent {
            id: spawn_id.clone(),
            name: resolved.agent.name.clone(),
            instructions: resolved.agent.instructions.clone(),
            tool_ids: resolved.agent.tool_ids.clone(),
            model_override: resolved.model.clone().into(),
            max_iterations: Some(resolved.effective_max_steps),
            context_window: resolved.effective_context_window,
            max_messages_in_memory: resolved.effective_max_messages,
            description: resolved.agent.description.clone(),
            model_tier: resolved.agent.model_tier,
        };
        if let Err(e) = state.swarm.spawn_agent(swarm_agent).await {
            tracing::warn!(spawn_id = %spawn_id, "Swarm registration failed: {}", e);
        }

        let subagent_token = CancellationToken::new();
        {
            let mut tokens = state.subagent_cancellation_tokens.lock().await;
            tokens.insert(spawn_id.clone(), (chat_id.clone(), subagent_token.clone()));
        }

        // Single typed spawn emission on the event bus: the bridge flattens
        // `AgentSpawn` to the exact `agent:spawn` payload shape the frontend
        // listens for (card creation, agents-panel focus, voice activity).
        state
            .agent
            .event_bus
            .emit(crate::agent::event_bus::AgentEvent::AgentSpawn(
                crate::agent::event_bus::AgentSpawnPayload {
                    spawn_id: spawn_id.clone(),
                    parent_agent: label.to_string(),
                    child_agent_id: resolved.agent.id.clone(),
                    child_agent_name: resolved.agent.name.clone(),
                    task: task.to_string(),
                    chat_id: chat_id.clone(),
                    timestamp: chrono::Utc::now().to_rfc3339(),
                },
            ));

        // Emit a chat-visible sub-agent step so the inline timeline can render
        // the delegated task from start through completion.
        state
            .agent
            .event_bus
            .emit(crate::agent::event_bus::AgentEvent::SubagentStep(
                crate::agent::event_bus::SubagentStepPayload {
                    chat_id: chat_id.clone(),
                    spawn_id: spawn_id.clone(),
                    parent_tool_call_id: parent_tool_call_id.clone(),
                    agent_id: agent_id.to_string(),
                    agent_name: resolved.agent.name.clone(),
                    task: task.to_string(),
                    status: "running".to_string(),
                    result_summary: None,
                    result_content: None,
                    intermediate_content: None,
                    error: None,
                    duration_ms: 0,
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    // Child tool ids are linked authoritatively by each child
                    // tool event's parent_tool_call_id and trace_id.
                    child_tool_call_ids: Some(Vec::new()),
                },
            ));

        // Run child agent with cancellation support
        let spawn_start = std::time::Instant::now();
        // Bound global concurrent child runs. Acquired here (not at registration)
        // so queued children still show as running in the panel while waiting for
        // a slot, and the permit is released the moment this run finishes.
        let _permit = SUBAGENT_CONCURRENCY.clone().acquire_owned().await.ok();
        let result = tokio::select! {
            biased;
            _ = token.cancelled() => {
                Err(anyhow::Error::new(SpawnFailureError::new(
                    SpawnFailure::ParentCancelled,
                    "Parent cancelled — sub-agent aborted",
                )))
            }
            _ = subagent_token.cancelled() => {
                Err(anyhow::Error::new(SpawnFailureError::new(
                    SpawnFailure::UserCancelled,
                    "Sub-agent task cancelled by user",
                )))
            }
            _ = tokio::time::sleep(std::time::Duration::from_secs(SUBAGENT_TIMEOUT_SECONDS)) => {
                Err(anyhow::Error::new(SpawnFailureError::new(
                    SpawnFailure::Timeout,
                    format!("Sub-agent timed out after {SUBAGENT_TIMEOUT_SECONDS} seconds"),
                )))
            }
            res = child_runner_instance.run(
                provider.as_ref(),
                chat_id.clone(),
                resolved.model,
                child_messages,
                resolved.agent.clone(),
                child_config,
                CancellationToken::child_token(&token),
            ) => res
        };

        // Cleanup token and message inbox
        {
            let mut tokens = state.subagent_cancellation_tokens.lock().await;
            tokens.remove(&spawn_id);
        }
        {
            let mut queues = state.subagent_message_queues.lock().await;
            queues.remove(&spawn_id);
        }
        let spawn_duration_ms = spawn_start.elapsed().as_millis() as u64;

        match result {
            Ok(response) => {
                let final_answer = response.final_answer.clone();
                let content = response
                    .content
                    .unwrap_or_else(|| "Sub-agent completed with no output.".to_string());

                let validated = validate_subagent_output(&content);
                let status_str = validated.status.as_str();
                let summary = validated.summary.clone();
                // The panel's final reply must be only the child's terminal-turn
                // answer, not the accumulated per-iteration commentary — the
                // interleaved segments already render those. Prefer final_answer;
                // fall back to full_content for adapters that don't set it.
                // Bound it so a runaway child cannot bloat the parent event/DB.
                const MAX_RESULT_CONTENT: usize = 16_000;
                let result_content = {
                    let source = final_answer
                        .as_deref()
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .unwrap_or_else(|| validated.full_content.trim());
                    if source.is_empty() {
                        None
                    } else {
                        Some(source.chars().take(MAX_RESULT_CONTENT).collect::<String>())
                    }
                };
                // Interleaved commentary the child produced between tool calls.
                // Bound the total so a chatty child can't bloat the event/DB.
                let intermediate_content = collect_intermediate_segments(&intermediate_commentary).await;

                // Try to preserve any structured JSON the child returned, but wrap it
                // with validation metadata so callers can tell whether the result is
                // trustworthy.
                let parsed: Result<serde_json::Value, _> = serde_json::from_str(&content);
                let structured_result = match parsed {
                    Ok(json) => {
                        let mut wrapper = json;
                        if let Some(obj) = wrapper.as_object_mut() {
                            obj.insert("__validated_status".to_string(), json!(status_str));
                            obj.insert("__validation_notes".to_string(), json!(validated.notes));
                        }
                        wrapper
                    }
                    Err(_) => {
                        json!({
                            "status": status_str,
                            "summary": summary,
                            "full_content": validated.full_content,
                            "validation_notes": validated.notes,
                        })
                    }
                };

                let _ = emit_completion_events(CompletionParams {
                    app: &app,
                    chat_id: &chat_id,
                    agent_id,
                    agent_name: &resolved.agent.name,
                    task,
                    spawn_id: &spawn_id,
                    label,
                    status: status_str,
                    error: None,
                    result_summary: Some(&summary),
                    duration_ms: spawn_duration_ms,
                });

                // Update the chat-visible sub-agent step with the final result.
                let completed_child_tool_call_ids = child_tool_call_ids.lock().await.clone();
                state
                    .agent
                    .event_bus
                    .emit(crate::agent::event_bus::AgentEvent::SubagentStep(
                        crate::agent::event_bus::SubagentStepPayload {
                            chat_id: chat_id.clone(),
                            spawn_id: spawn_id.clone(),
                            parent_tool_call_id: parent_tool_call_id.clone(),
                            agent_id: agent_id.to_string(),
                            agent_name: resolved.agent.name.clone(),
                            task: task.to_string(),
                            status: status_str.to_string(),
                            result_summary: Some(summary.clone()),
                            result_content: result_content.clone(),
                            intermediate_content: intermediate_content.clone(),
                            error: None,
                            duration_ms: spawn_duration_ms,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            // Child tool ids are linked authoritatively by each child
                            // tool event's parent_tool_call_id and trace_id.
                            child_tool_call_ids: Some(completed_child_tool_call_ids),
                        },
                    ));

                if let Err(e) = state.swarm.terminate_agent(&spawn_id).await {
                    tracing::warn!(spawn_id = %spawn_id, "Swarm termination failed: {}", e);
                }

                Ok(json!({
                    "spawn_id": spawn_id,
                    "agent_id": agent_id,
                    "agent_name": resolved.agent.name,
                    "status": status_str,
                    "result": structured_result,
                    "summary": summary,
                    "validation_notes": validated.notes,
                    "duration_ms": spawn_duration_ms,
                }))
            }
            Err(e) => {
                let error_text = e.to_string();
                let terminal_status = spawn_failure_status(&e);
                let error_class = classify_spawn_error(&e);
                let retry_hint = match error_class {
                    ErrorClass::Transient => "This looks like a transient error (network, timeout, rate limit). You may retry the same task.",
                    ErrorClass::Permanent => "This looks like a permanent error (permission, invalid input, not found). Review the task before retrying.",
                    ErrorClass::Retryable => "This error may be retryable with a different approach or smaller task.",
                };

                let _ = emit_completion_events(CompletionParams {
                    app: &app,
                    chat_id: &chat_id,
                    agent_id,
                    agent_name: &resolved.agent.name,
                    task,
                    spawn_id: &spawn_id,
                    label,
                    status: terminal_status,
                    error: Some(&error_text),
                    result_summary: None,
                    duration_ms: spawn_duration_ms,
                });

                // Mark the chat-visible sub-agent step as failed.
                let failed_child_tool_call_ids = child_tool_call_ids.lock().await.clone();
                state
                    .agent
                    .event_bus
                    .emit(crate::agent::event_bus::AgentEvent::SubagentStep(
                        crate::agent::event_bus::SubagentStepPayload {
                            chat_id: chat_id.clone(),
                            spawn_id: spawn_id.clone(),
                            parent_tool_call_id: parent_tool_call_id.clone(),
                            agent_id: agent_id.to_string(),
                            agent_name: resolved.agent.name.clone(),
                            task: task.to_string(),
                            status: terminal_status.to_string(),
                            result_summary: None,
                            result_content: None,
                            intermediate_content: collect_intermediate_segments(&intermediate_commentary).await,
                            error: Some(error_text.clone()),
                            duration_ms: spawn_duration_ms,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            // Child tool ids are linked authoritatively by each child
                            // tool event's parent_tool_call_id and trace_id.
                            child_tool_call_ids: Some(failed_child_tool_call_ids),
                        },
                    ));

                if let Err(e) = state.swarm.terminate_agent(&spawn_id).await {
                    tracing::warn!(spawn_id = %spawn_id, "Swarm termination failed: {}", e);
                }

                Ok(json!({
                    "spawn_id": spawn_id,
                    "agent_id": agent_id,
                    "agent_name": resolved.agent.name,
                    "status": terminal_status,
                    "error": error_text,
                    "error_class": error_class.as_str(),
                    "retry_hint": retry_hint,
                    "duration_ms": spawn_duration_ms,
                }))
            }
        }
    }
}
