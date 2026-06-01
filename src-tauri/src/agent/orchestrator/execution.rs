use anyhow::Result;
use serde_json::json;
use std::sync::atomic::Ordering;
use tokio_util::sync::CancellationToken;
use tracing::{error, info};

use super::Orchestrator;
use super::OrchestratorPhase;
use crate::agent::event_bus::{AgentEvent, ChatChunkFirstPayload, ChatChunkPayload};
use crate::agent::runner::{self, Runner};
use crate::agent::task::Task;
use crate::agent::types::{ActionMeta, AgentResponse, MessageKind, SpawnMeta};
use crate::db::models::ChatMessage;
use crate::llm::{ChatRequestConfig, LlmChunk, LlmProvider};

impl Orchestrator {
    /// Execute a single task with the assigned agent
    pub(crate) async fn execute_task_with_agent(
        &self,
        provider: &dyn LlmProvider,
        model: &str,
        task: &Task,
        agent_id: &str,
        chat_id: &str,
        messages: &[ChatMessage],
        config: ChatRequestConfig,
        token: CancellationToken,
    ) -> Result<AgentResponse> {
        // Get agent definition
        let agent = self
            .agent_registry
            .get(agent_id)
            .cloned()
            .or_else(|| {
                // Fallback to generalist if agent not found
                self.agent_registry.get("generalist").cloned()
            })
            .ok_or_else(|| anyhow::anyhow!("Agent '{}' not found", agent_id))?;

        // Create runner for this agent
        let mut runner = Runner::new(
            self.app.clone(),
            self.tool_registry.clone(),
            self.agent_registry.clone(),
            self.hook_registry.clone(),
            self.permissions.clone(),
            self.tool_manager.clone(),
        );

        // Pass direct channel for high-performance streaming if available
        if let Some(ref channel) = self.on_event {
            runner = runner.with_channel(channel.clone());
        }

        // Pass db_pool if available
        if let Some(ref db_pool) = self.db_pool {
            runner = runner.with_db_pool(db_pool.clone());
        }

        // Build task-specific prompt
        let task_prompt = format!(
            "Execute the following task:\n\n\
             **Task**: {}\n\n\
             **Context**: This is part of a larger orchestrator workflow.\n\
             Focus on completing this specific task efficiently.\n\
             Use all available tools at your disposal.\n\n\
             Provide a comprehensive result that can be synthesized with other task results.",
            task.description
        );

        // Create messages for this task
        let mut task_messages = messages.to_vec();
        task_messages.push(ChatMessage {
            role: "user".to_string(),
            content: task_prompt,
            reasoning_details: None,
            images: None,
            tool_calls: None,
            tool_call_id: None,
        });

        // Emit spawn start action for chat timeline (this now also bridges to AgentEvent)
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
                parent_agent: "orchestrator".to_string(),
                child_agent: agent.name.clone(),
                task: task.description.clone(),
                status: "spawned".to_string(),
                duration_ms: None,
                spawn_id: None,
            }),
            approval_request: None,
            ..Default::default()
        };

        let spawn_content = format!(
            "Spawning {} for: {}",
            agent.name,
            task.description.chars().take(80).collect::<String>()
        );
        let spawn_id = if let Some(ref pool) = self.db_pool {
            runner::persist_and_emit_action(
                &self.app,
                pool,
                chat_id,
                None,
                MessageKind::AgentSpawn,
                spawn_content,
                spawn_meta,
                Some("assistant"),
                None,
                &self.on_event,
            )
            .await?
        } else {
            runner::emit_action_only(
                &self.app,
                chat_id,
                None,
                MessageKind::AgentSpawn,
                spawn_content,
                spawn_meta,
                &self.on_event,
            )?
        };

        let start_time = std::time::Instant::now();
        // Run the agent with tokio::select! to handle parent cancellation
        let result = tokio::select! {
            biased;
            _ = token.cancelled() => {
                Err(anyhow::anyhow!("Parent cancelled — orchestration task aborted"))
            }
            res = runner.run(
                provider,
                chat_id.to_string(),
                model.to_string(),
                task_messages,
                agent.clone(),
                config,
                token.clone(),
            ) => res
        };
        let duration_ms = start_time.elapsed().as_millis() as u64;

        match result {
            Ok(response) => {
                // Emit complete action for chat timeline (this now also bridges to AgentEvent)
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
                        parent_agent: "orchestrator".to_string(),
                        child_agent: agent.name.clone(),
                        task: task.description.clone(),
                        status: "completed".to_string(),
                        duration_ms: Some(duration_ms),
                        spawn_id: Some(spawn_id),
                    }),
                    approval_request: None,
                    ..Default::default()
                };

                let complete_content = format!("{} completed in {}ms", agent.name, duration_ms);
                if let Some(ref pool) = self.db_pool {
                    let _ = runner::persist_and_emit_action(
                        &self.app,
                        pool,
                        chat_id,
                        None,
                        MessageKind::AgentComplete,
                        complete_content,
                        complete_meta,
                        Some("assistant"),
                        None,
                        &self.on_event,
                    )
                    .await;
                } else {
                    let _ = runner::emit_action_only(
                        &self.app,
                        chat_id,
                        None,
                        MessageKind::AgentComplete,
                        complete_content,
                        complete_meta,
                        &self.on_event,
                    );
                }

                Ok(response)
            }
            Err(e) => {
                // Emit failed action for chat timeline (this now also bridges to AgentEvent)
                let failed_meta = ActionMeta {
                    agent_id: agent_id.to_string(),
                    agent_name: agent.name.clone(),
                    iteration: 0,
                    depth: 0,
                    progress_percent: None,
                    tool_call: None,
                    tool_result: None,
                    handoff: None,
                    spawn: Some(SpawnMeta {
                        parent_agent: "orchestrator".to_string(),
                        child_agent: agent.name.clone(),
                        task: task.description.clone(),
                        status: "failed".to_string(),
                        duration_ms: Some(duration_ms),
                        spawn_id: Some(spawn_id),
                    }),
                    approval_request: None,
                    ..Default::default()
                };

                let failed_content =
                    format!("{} failed after {}ms: {}", agent.name, duration_ms, e);
                if let Some(ref pool) = self.db_pool {
                    let _ = runner::persist_and_emit_action(
                        &self.app,
                        pool,
                        chat_id,
                        None,
                        MessageKind::AgentComplete,
                        failed_content,
                        failed_meta,
                        Some("assistant"),
                        None,
                        &self.on_event,
                    )
                    .await;
                } else {
                    let _ = runner::emit_action_only(
                        &self.app,
                        chat_id,
                        None,
                        MessageKind::AgentComplete,
                        failed_content,
                        failed_meta,
                        &self.on_event,
                    );
                }

                Err(e)
            }
        }
    }

    /// Synthesize all task results into a final comprehensive response.
    /// Streams output to the frontend via chat:partial events.
    pub(crate) async fn synthesize_results(
        &self,
        provider: &dyn LlmProvider,
        model: &str,
        original_goal: &str,
        task_results: &[(String, String)],
        messages: &[ChatMessage],
        config: ChatRequestConfig,
        token: CancellationToken,
        chat_id: &str,
    ) -> Result<AgentResponse> {
        info!("Synthesizing {} task results", task_results.len());

        let system_prompt = r#"You are synthesizing the results of a multi-agent orchestration.
Your job is to combine all task results into a comprehensive, coherent final answer.

Guidelines:
1. Acknowledge the original goal
2. Summarize what was accomplished
3. Present results from each task in a logical order
4. Highlight key findings, code, or outputs
5. Note any tasks that failed and their impact
6. Provide actionable next steps if relevant

Be thorough but organized. Use formatting (headers, lists, code blocks) to make the response easy to read."#;

        let task_results_str = task_results
            .iter()
            .map(|(id, result)| format!("- **Task {}**: {}", id, result))
            .collect::<Vec<_>>()
            .join("\n");

        let user_content = format!(
            "Original Goal: {}\n\n\
             Task Results:\n{}\n\n\
             Synthesize these results into a comprehensive final answer.",
            original_goal, task_results_str
        );

        let mut synth_messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: system_prompt.to_string(),
                reasoning_details: None,
                images: None,
                tool_calls: None,
                tool_call_id: None,
            },
            ChatMessage {
                role: "user".to_string(),
                content: user_content,
                reasoning_details: None,
                images: None,
                tool_calls: None,
                tool_call_id: None,
            },
        ];

        // Add context from execution
        synth_messages.extend(messages.iter().take(10).cloned());

        // Create a weak pointer for the orchestrator to use in the callback
        // This is tricky because LlmProvider::chat_stream expects Box<dyn Fn(String) + Send + 'static>
        // and doesn't support async closures easily or closure with non-static lifetimes.
        // We use the direct channel if available, otherwise app_clone.
        let maybe_channel = self.on_event.clone();
        let app_clone = self.app.clone();
        let chat_id_owned = chat_id.to_string();

        // First-chunk immediate emission flag — bypasses the 40ms buffer for TTFT
        let first_chunk_sent = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let first_chunk_sent_clone = first_chunk_sent.clone();

        // Optimize IPC: Buffer tokens for ~40ms windows to reduce event frequency
        let buffer = std::sync::Arc::new(std::sync::Mutex::new((
            String::new(),
            std::time::Instant::now(),
            "text",
        )));
        let buffer_clone = buffer.clone();

        let maybe_channel_clone = maybe_channel.clone();
        let app_clone_2 = app_clone.clone();
        let chat_id_owned_2 = chat_id_owned.clone();

        // Streaming artifact detector for orchestrator-synthesized output
        let detector = std::sync::Arc::new(std::sync::Mutex::new(
            crate::agent::event_bus::StreamingArtifactDetector::new({
                let app = app_clone_2.clone();
                let on_event = maybe_channel_clone.clone();
                move |ev| {
                    ev.emit_via(&app, &on_event);
                }
            }),
        ));
        let detector_clone = detector.clone();

        let on_chunk = Box::new(move |chunk: LlmChunk| {
            let (chunk_text, chunk_type) = match chunk {
                LlmChunk::Text(t) => (t, "text"),
                LlmChunk::Thought(t) => (t, "thought"),
                LlmChunk::ToolCallDelta { .. } => return,
            };

            // Feed text chunks to the artifact detector
            if chunk_type == "text" && !chunk_text.is_empty() {
                if let Ok(mut det) = detector_clone.lock() {
                    det.feed(&chunk_text, &chat_id_owned_2);
                }
            }

            // ── FIRST CHUNK IMMEDIATE EMISSION (A2) ──
            // Emit ChatChunkFirst for TTFT diagnostics and immediate first
            // render, then let the chunk fall through to the normal buffered
            // chat:chunk path. The frontend de-duplicates the first delta.
            if !chunk_text.is_empty() && !first_chunk_sent_clone.swap(true, Ordering::SeqCst) {
                AgentEvent::ChatChunkFirst(ChatChunkFirstPayload {
                    chat_id: chat_id_owned_2.clone(),
                    delta: chunk_text.clone(),
                    r#type: chunk_type.to_string(),
                })
                .emit_via(&app_clone_2, &maybe_channel_clone);
            }

            if !chunk_text.is_empty() {
                let mut data = match buffer_clone.lock() {
                    Ok(guard) => guard,
                    Err(poisoned) => {
                        error!("[orchestrator] buffer mutex poisoned, recovering");
                        poisoned.into_inner()
                    }
                };

                // If type changed, flush immediately
                if data.2 != chunk_type && !data.0.is_empty() {
                    let old_text = std::mem::take(&mut data.0);
                    let old_type = data.2;

                    AgentEvent::ChatChunk(ChatChunkPayload {
                        chat_id: chat_id_owned_2.clone(),
                        delta: old_text,
                        r#type: old_type.to_string(),
                        done: false,
                    })
                    .emit_via(&app_clone_2, &maybe_channel_clone);

                    data.1 = std::time::Instant::now();
                }

                data.0.push_str(&chunk_text);
                data.2 = chunk_type;

                if data.1.elapsed().as_millis() >= 40 {
                    let text = std::mem::take(&mut data.0);
                    let current_type = data.2;
                    data.1 = std::time::Instant::now();
                    drop(data);

                    AgentEvent::ChatChunk(ChatChunkPayload {
                        chat_id: chat_id_owned_2.clone(),
                        delta: text,
                        r#type: current_type.to_string(),
                        done: false,
                    })
                    .emit_via(&app_clone_2, &maybe_channel_clone);
                }
            }
        });

        let response = provider
            .chat_stream(model, synth_messages, None, config, on_chunk, token)
            .await?;

        // Final flush: Send any remaining tokens in the buffer
        let mut data = match buffer.lock() {
            Ok(guard) => guard,
            Err(poisoned) => {
                error!("[orchestrator] buffer mutex poisoned during final flush");
                poisoned.into_inner()
            }
        };
        if !data.0.is_empty() {
            let text = std::mem::take(&mut data.0);
            let current_type = data.2;
            let _ = self.emit(AgentEvent::ChatChunk(ChatChunkPayload {
                chat_id: chat_id.to_string(),
                delta: text,
                r#type: current_type.to_string(),
                done: true,
            }));
        }

        // Flush the artifact detector
        if let Ok(mut det) = detector.lock() {
            det.flush();
        }

        Ok(AgentResponse {
            content: Some(response.content),
            tool_calls: vec![],
            reasoning: None,
            handoff: None,
            tokens_in: response.tokens_in,
            tokens_out: response.tokens_out,
            message_persisted: false,
        })
    }

    /// Generate an alternative approach for a failed task
    pub(crate) fn generate_alternative_approach(&self, task: &Task, error: &str) -> String {
        format!(
            "Task '{}' failed: {}\n\n\
             Alternative approach:\n\
             1. Try using different tools or methods\n\
             2. Break the task into smaller subtasks\n\
             3. Focus on what CAN be accomplished with available resources\n\
             4. If completely blocked, provide a clear explanation of the limitation",
            task.description, error
        )
    }

    /// Emit progress update to frontend
    pub(crate) fn emit_progress(
        &self,
        chat_id: &str,
        phase: OrchestratorPhase,
        progress: f64,
        message: &str,
    ) -> Result<()> {
        let _ = self.emit(AgentEvent::OrchestratorProgress(json!({
            "chat_id": chat_id,
            "phase": phase,
            "progress": progress,
            "message": message,
        })));
        Ok(())
    }
}
