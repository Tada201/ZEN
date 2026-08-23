use anyhow::Result;
use chrono::Utc;
use futures::stream::{FuturesUnordered, StreamExt};
use tokio::time::timeout;
use tracing::{info, instrument, warn};
use uuid::Uuid;

use super::execution::{OrchestratorRunParams, SynthesizeParams, TaskAgentParams};
use super::Orchestrator;
use super::OrchestratorPhase;
use crate::agent::event_bus::{AgentEvent, ChatDonePayload, ChatErrorPayload};
use crate::agent::task_queue::TaskQueue;
use crate::agent::types::AgentResponse;
use crate::db::models::{ChatMessage, OrchestrationPlan, OrchestrationTask};
use crate::db::queries;

impl Orchestrator {
    /// Run the orchestrator loop for a complex goal
    ///
    /// This is the main entry point for orchestrator-mode execution
    #[instrument(skip_all)]
    pub async fn run_orchestrator_loop(
        &self,
        params: OrchestratorRunParams<'_>,
    ) -> Result<AgentResponse> {
        let OrchestratorRunParams {
            provider,
            model,
            messages,
            chat_id,
            goal,
            config,
            token,
            approval_rx,
            extra_tool_ids,
            extra_instructions,
            model_context_window: _,
        } = params;
        info!("Starting orchestrator loop for goal: {}", goal);
        let _ = self.ctx.wait_for_chat_resume(chat_id, &token).await;

        // Create a placeholder assistant message so the backend owns the row
        // ID that `chat:done` will reference. This lets the frontend persist
        // the execution timeline (`steps_json`) against the real DB row —
        // matching the runner loop and deep-research contracts.
        let mut orchestrator_message_id: Option<String> = None;
        if let Some(ref pool) = self.db_pool {
            match queries::add_message(
                pool,
                &queries::NewMessage {
                    chat_id,
                    role: "assistant",
                    model: Some(model),
                    is_complete: false,
                    kind: Some("orchestrator"),
                    ..Default::default()
                },
            )
            .await
            {
                Ok(msg) => orchestrator_message_id = Some(msg.id),
                Err(e) => {
                    warn!(chat_id = %chat_id, error = %e, "Failed to create orchestrator assistant message");
                }
            }
        }

        // Phase 1: Analyze
        self.emit_progress(
            chat_id,
            OrchestratorPhase::Analyzing,
            0.0,
            "Analyzing goal and identifying requirements...",
        )?;

        // Phase 2: Plan - Break goal into tasks
        self.emit_progress(
            chat_id,
            OrchestratorPhase::Planning,
            10.0,
            "Breaking down goal into subtasks...",
        )?;

        let breakdown = match self
            .break_goal_into_tasks(&*provider, model, &messages, goal)
            .await
        {
            Ok(b) => b,
            Err(e) => {
                let error_msg = format!("Failed to break goal into tasks: {}", e);
                if let (Some(pool), Some(msg_id)) =
                    (self.db_pool.as_ref(), orchestrator_message_id.as_ref())
                {
                    let failure_metadata = serde_json::json!({
                        "error": &error_msg,
                        "status": "failed",
                        "recoverable": false,
                    })
                    .to_string();
                    let _ = queries::update_message(
                        pool,
                        &queries::UpdateMessage {
                            id: msg_id,
                            chat_id,
                            content: &error_msg,
                            is_complete: true,
                            metadata: Some(&failure_metadata),
                            ..Default::default()
                        },
                    )
                    .await;
                }
                let _ = self.emit(AgentEvent::ChatError(ChatErrorPayload {
                    chat_id: chat_id.to_string(),
                    error: error_msg,
                    recoverable: false,
                }));
                return Err(e);
            }
        };

        // --- PERSISTENCE: Save initial plan and tasks ---
        let plan_id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        if let Some(ref pool) = self.db_pool {
            let plan = OrchestrationPlan {
                id: plan_id.clone(),
                chat_id: chat_id.to_string(),
                goal: goal.to_string(),
                complexity: Some(breakdown.complexity.to_string()),
                status: "planning".to_string(),
                created_at: now.clone(),
                updated_at: now.clone(),
            };

            if let Err(e) = queries::save_orchestration_plan(pool, &plan).await {
                warn!("Failed to save orchestration plan: {}", e);
            }

            // Save individual tasks
            for task in &breakdown.tasks {
                let agent_id = breakdown
                    .agent_assignments
                    .iter()
                    .find(|(tid, _)| tid == &task.id)
                    .map(|(_, aid)| aid.clone())
                    .unwrap_or_else(|| "generalist".to_string());

                let otask = OrchestrationTask {
                    id: task.id.clone(),
                    plan_id: plan_id.clone(),
                    description: task.description.clone(),
                    agent_id,
                    priority: match task.priority {
                        crate::agent::task::TaskPriority::Critical => 4,
                        crate::agent::task::TaskPriority::High => 3,
                        crate::agent::task::TaskPriority::Medium => 2,
                        crate::agent::task::TaskPriority::Low => 1,
                    },
                    status: "pending".to_string(),
                    dependencies: serde_json::to_string(&task.dependencies)
                        .unwrap_or_else(|_| "[]".to_string()),
                    result: None,
                    retry_count: 0,
                    created_at: now.clone(),
                    updated_at: now.clone(),
                };

                if let Err(e) = queries::save_orchestration_task(pool, &otask).await {
                    warn!("Failed to save orchestration task {}: {}", task.id, e);
                }
            }
        }

        // --- MANUAL APPROVAL GATE ---
        if let Some(rx) = approval_rx {
            info!("Waiting for user approval of the orchestrator plan...");
            self.emit_progress(
                chat_id,
                OrchestratorPhase::Planning,
                15.0,
                "Waiting for plan approval...",
            )?;

            match rx.await {
                Ok(true) => {
                    info!("Plan approved by user. Proceeding to execution.");
                }
                Ok(false) | Err(_) => {
                    info!("Plan rejected or approval timed out. Aborting orchestrator.");

                    if let Some(ref pool) = self.db_pool {
                        let _ =
                            queries::update_orchestration_plan_status(pool, &plan_id, "rejected")
                                .await;
                    }

                    self.emit_progress(
                        chat_id,
                        OrchestratorPhase::Complete,
                        0.0,
                        "Orchestration rejected by user.",
                    )?;

                    let cancelled_content =
                        "Orchestration was cancelled by the user after reviewing the plan.";
                    if let (Some(pool), Some(msg_id)) =
                        (self.db_pool.as_ref(), orchestrator_message_id.as_ref())
                    {
                        let _ = queries::update_message(
                            pool,
                            &queries::UpdateMessage {
                                id: msg_id,
                                chat_id,
                                content: cancelled_content,
                                is_complete: true,
                                ..Default::default()
                            },
                        )
                        .await;
                    }

                    // Emit ChatDone to signal frontend that streaming is complete
                    let _ = self.emit(AgentEvent::ChatDone(ChatDonePayload {
                        chat_id: chat_id.to_string(),
                        content: Some(cancelled_content.to_string()),
                        tokens_in: 0,
                        tokens_out: 0,
                        reason: "cancelled".to_string(),
                        done: true,
                        message_id: orchestrator_message_id.clone(),
                    }));

                    return Ok(AgentResponse {
                        content: Some(
                            "Orchestration was cancelled by the user after reviewing the plan."
                                .to_string(),
                        ),
                        final_answer: None,
                        tool_calls: vec![],
                        reasoning: None,
                        handoff: None,
                        tokens_in: None,
                        tokens_out: None,
                        message_persisted: false,
                    });
                }
            }
        }

        info!(
            task_count = breakdown.tasks.len(),
            complexity = breakdown.complexity,
            "Task breakdown complete"
        );

        // Create task queue
        let mut queue = TaskQueue::from_tasks(breakdown.tasks.clone());

        // Resolve execution order (respects dependencies)
        if let Err(e) = queue.resolve_order() {
            warn!("Failed to resolve task order: {}", e);
            // Continue anyway - tasks will execute as dependencies allow
        }

        // Phase 3: Execute - Process task queue
        self.emit_progress(
            chat_id,
            OrchestratorPhase::Executing,
            20.0,
            "Executing subtasks...",
        )?;

        if let Some(ref pool) = self.db_pool {
            let _ = queries::update_orchestration_plan_status(pool, &plan_id, "executing").await;
        }

        let mut task_results: Vec<(String, String)> = Vec::new(); // (task_id, result)
        let mut all_messages = messages.clone();
        let mut running_tasks = FuturesUnordered::new();

        // Helper logic to spawn all currently ready tasks
        let spawn_ready = |queue: &mut TaskQueue,
                           running_tasks: &mut FuturesUnordered<_>,
                           all_messages: &[ChatMessage]| {
            for next_ready in queue.pop_all_ready() {
                let task_id = next_ready.task.id.clone();
                let task_desc = next_ready.task.description.clone();

                let agent_id = breakdown
                    .agent_assignments
                    .iter()
                    .find(|(tid, _)| tid == &task_id)
                    .map(|(_, aid)| aid.clone())
                    .unwrap_or_else(|| "generalist".to_string());

                info!("Spawning task: {} - {}", task_id, task_desc);

                let provider_clone = provider.clone();
                let model_clone = model.to_string();
                let chat_id_clone = chat_id.to_string();
                let messages_clone = all_messages.to_vec();
                let config_clone = config.clone();
                let token_clone = token.clone();
                let extra_tool_ids_clone = extra_tool_ids.clone();
                let extra_instructions_clone = extra_instructions.clone();

                running_tasks.push(async move {
                    let result = timeout(
                        std::time::Duration::from_secs(120),
                        self.execute_task_with_agent(TaskAgentParams {
                            provider: &*provider_clone,
                            model: &model_clone,
                            task: &next_ready.task,
                            agent_id: &agent_id,
                            chat_id: &chat_id_clone,
                            messages: &messages_clone,
                            config: config_clone,
                            token: token_clone,
                            extra_tool_ids: extra_tool_ids_clone,
                            extra_instructions: extra_instructions_clone,
                        }),
                    )
                    .await;

                    (task_id, agent_id, result, next_ready)
                });
            }
        };

        // Initial spawn of ready tasks
        spawn_ready(&mut queue, &mut running_tasks, &all_messages);

        while (!queue.is_empty() || !running_tasks.is_empty()) && !token.is_cancelled() {
            tokio::select! {
                Some((task_id, agent_id, result, queued_task)) = running_tasks.next() => {
                    match result {
                        Ok(Ok(response)) => {
                            let result_content = response.content.unwrap_or_else(|| "Task completed".to_string());
                            info!("Task {} completed successfully", task_id);

                            queue.mark_completed(&task_id, Some(100));
                            task_results.push((task_id.clone(), result_content.clone()));

                            if let Some(ref pool) = self.db_pool {
                                let _ = queries::update_orchestration_task_status(pool, &task_id, "completed", Some(&result_content)).await;
                            }

                            all_messages.push(ChatMessage {
                                role: "assistant".to_string(),
                                content: format!("[Task {} complete] {}", agent_id, result_content),
                                reasoning_details: None,
                                images: None,
                                tool_calls: None,
                                tool_call_id: None,
                            });
                        }
                        Ok(Err(e)) => {
                            let error_msg = e.to_string();
                            warn!("Task {} failed: {}", task_id, error_msg);
                            queue.mark_failed(&task_id, &error_msg, Some(100));

                            if queued_task.retry_count < 3 {
                                let plan_b = self.generate_alternative_approach(&queued_task.task, &error_msg);
                                let retry_task = queued_task.retry_with_plan_b(plan_b);
                                queue.push(retry_task);
                                info!("Queued task {} for retry with Plan B", task_id);
                            } else {
                                task_results.push((task_id.clone(), format!("Failed after 3 attempts: {}", error_msg)));
                                if let Some(ref pool) = self.db_pool {
                                    let _ = queries::update_orchestration_task_status(pool, &task_id, "failed", Some(&format!("Failed after 3 attempts: {}", error_msg))).await;
                                }
                            }
                        }
                        Err(_) => {
                            let error_msg = "Task execution timed out after 120s".to_string();
                            warn!("Task {} failed: {}", task_id, error_msg);
                            queue.mark_failed(&task_id, &error_msg, Some(100));
                            task_results.push((task_id.clone(), format!("Timed out: {}", error_msg)));
                        }
                    }

                    // Emit progress update
                    let progress = 20.0 + (queue.completed_count() as f64 / (queue.total_count() as f64).max(1.0)) * 60.0;
                    self.emit_progress(
                        chat_id,
                        OrchestratorPhase::Executing,
                        progress,
                        "Executing subtasks...",
                    )?;

                    // Try to spawn any newly ready tasks
                    spawn_ready(&mut queue, &mut running_tasks, &all_messages);
                }
                _ = tokio::time::sleep(std::time::Duration::from_millis(100)) => {
                    if running_tasks.is_empty() && queue.is_empty() {
                        break;
                    }
                    // Fallback to check if any tasks became ready that we missed
                    spawn_ready(&mut queue, &mut running_tasks, &all_messages);

                    if running_tasks.is_empty() && !queue.is_empty() {
                        // All remaining tasks are blocked or resolved
                        if queue.all_resolved() {
                            break;
                        }
                        warn!("Task queue stuck in parallel execution - breaking out");
                        break;
                    }
                }
            }
        }

        // If all tasks were cancelled before any executed, emit ChatDone and return early
        if token.is_cancelled() && task_results.is_empty() {
            info!(
                "Orchestrator task execution cancelled — no tasks completed, no synthesis needed"
            );
            let cancelled_early_content =
                "Orchestration cancelled before any tasks could complete.";
            if let (Some(pool), Some(msg_id)) =
                (self.db_pool.as_ref(), orchestrator_message_id.as_ref())
            {
                let _ = queries::update_message(
                    pool,
                    &queries::UpdateMessage {
                        id: msg_id,
                        chat_id,
                        content: cancelled_early_content,
                        is_complete: true,
                        ..Default::default()
                    },
                )
                .await;
            }
            let _ = self.emit(AgentEvent::ChatDone(ChatDonePayload {
                chat_id: chat_id.to_string(),
                content: Some(cancelled_early_content.to_string()),
                tokens_in: 0,
                tokens_out: 0,
                reason: "cancelled".to_string(),
                done: true,
                message_id: orchestrator_message_id.clone(),
            }));
            self.emit_progress(
                chat_id,
                OrchestratorPhase::Complete,
                100.0,
                "Orchestration cancelled",
            )?;
            return Ok(AgentResponse {
                content: Some(
                    "Orchestration cancelled before any tasks could complete.".to_string(),
                ),
                final_answer: None,
                tool_calls: vec![],
                reasoning: None,
                handoff: None,
                tokens_in: None,
                tokens_out: None,
                message_persisted: false,
            });
        }

        // Phase 4: Synthesize - Combine all results
        let _ = self.ctx.wait_for_chat_resume(chat_id, &token).await;
        self.emit_progress(
            chat_id,
            OrchestratorPhase::Synthesizing,
            85.0,
            "Synthesizing results...",
        )?;

        if let Some(ref pool) = self.db_pool {
            let _ = queries::update_orchestration_plan_status(pool, &plan_id, "synthesizing").await;
        }

        let final_response = match self
            .synthesize_results(SynthesizeParams {
                provider: &*provider,
                model,
                original_goal: goal,
                task_results: &task_results,
                messages: &all_messages,
                config,
                token,
                chat_id,
                orchestrator_message_id: orchestrator_message_id.as_deref(),
                extra_instructions: extra_instructions.as_deref(),
            })
            .await
        {
            Ok(response) => response,
            Err(e) => {
                let error_msg = format!("Orchestration synthesis failed: {}", e);
                // Persist the failure to the orchestrator assistant message so
                // a reload shows a coherent failed row instead of an
                // incomplete placeholder.
                if let (Some(pool), Some(msg_id)) =
                    (self.db_pool.as_ref(), orchestrator_message_id.as_ref())
                {
                    let failure_metadata = serde_json::json!({
                        "error": &error_msg,
                        "status": "failed",
                        "recoverable": false,
                    })
                    .to_string();
                    let _ = queries::update_message(
                        pool,
                        &queries::UpdateMessage {
                            id: msg_id,
                            chat_id,
                            content: &error_msg,
                            is_complete: true,
                            metadata: Some(&failure_metadata),
                            ..Default::default()
                        },
                    )
                    .await;
                }
                // Emit ChatError — frontend handler sets isStreaming(false), status="failed", and displays error
                let _ = self.emit(AgentEvent::ChatError(
                    crate::agent::event_bus::ChatErrorPayload {
                        chat_id: chat_id.to_string(),
                        error: error_msg,
                        recoverable: false,
                    },
                ));
                return Err(e);
            }
        };

        // Phase 5: Complete
        self.emit_progress(
            chat_id,
            OrchestratorPhase::Complete,
            100.0,
            "Orchestrator complete",
        )?;

        if let Some(ref pool) = self.db_pool {
            let _ = queries::update_orchestration_plan_status(pool, &plan_id, "completed").await;
        }

        // Persist the synthesized assistant response and emit chat:done
        // with the real backend row ID so the frontend can persist steps_json.
        let final_content = final_response.content.clone().unwrap_or_default();
        let tokens_in = final_response.tokens_in.unwrap_or(0) as i64;
        let tokens_out = final_response.tokens_out.unwrap_or(0) as i64;
        if let (Some(pool), Some(msg_id)) =
            (self.db_pool.as_ref(), orchestrator_message_id.as_ref())
        {
            let _ = queries::update_message(
                pool,
                &queries::UpdateMessage {
                    id: msg_id,
                    chat_id,
                    content: &final_content,
                    is_complete: true,
                    tokens_in: Some(tokens_in),
                    tokens_out: Some(tokens_out),
                    ..Default::default()
                },
            )
            .await;
        }

        // Emit chat:done to signal frontend that streaming is complete
        let _ = self.emit(AgentEvent::ChatDone(ChatDonePayload {
            chat_id: chat_id.to_string(),
            content: final_response.content.clone(),
            tokens_in,
            tokens_out,
            reason: "complete".to_string(),
            done: true,
            message_id: orchestrator_message_id.clone(),
        }));

        info!("Orchestrator loop completed");
        Ok(final_response)
    }
}
