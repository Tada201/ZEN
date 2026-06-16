use super::actions::{emit_action_only, persist_and_emit_action, ActionEmitParams, ActionPersistParams};
use super::escalation::{EarlyToolExecutionContext, EarlyToolExecutionState, EscalationParams};
use super::helpers::{
    generate_handoff_summary, parse_file_changes, parse_text_tool_calls,
    strip_text_tool_call_blocks,
};
use super::lifecycle::Runner;
use super::memory_bootstrap::{
    cached_recall_context, compact_context_if_needed, load_initial_conversation,
    load_memory_run_settings, truncate_conversation_by_message_count,
};
use super::turn_persistence::{save_assistant_message, AssistantMessageSave};
use crate::agent::chat_status::ChatStatusPhase;
use crate::agent::event_bus::{
    AgentEvent, ChatChunkPayload, ChatDonePayload, ChatErrorPayload, ChatStatusPayload,
};
use crate::agent::middleware::{EnrichmentContext, MiddlewareChain};
use crate::agent::types::*;
use crate::db::models::ChatMessage;
use crate::db::queries;
use crate::llm::LlmProvider;
use anyhow::{Context, Result};
use std::collections::HashMap;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

/// Maximum recursion depth for sub-agent spawning (prevents infinite loops)
pub const MAX_SPAWN_DEPTH: u32 = 3;

fn voice_display_tool_evidence(conversation: &[ChatMessage]) -> String {
    conversation
        .iter()
        .rev()
        .filter(|message| message.role == "tool")
        .take(4)
        .map(|message| message.content.chars().take(3_000).collect::<String>())
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n\n")
}

impl Runner {
    #[allow(clippy::too_many_arguments)]
    pub async fn run(
        &self,
        provider: &dyn LlmProvider,
        chat_id: String,
        model: String,
        messages: Vec<ChatMessage>,
        agent: crate::agent::types::Agent,
        config: crate::llm::ChatRequestConfig,
        token: CancellationToken,
    ) -> Result<crate::agent::types::AgentResponse, anyhow::Error> {
        let memory_settings = load_memory_run_settings(self.db_pool.as_ref(), &self.config).await;
        let run_config = memory_settings.run_config;
        let summarization_enabled = memory_settings.summarization_enabled;
        let semantic_recall_enabled = memory_settings.semantic_recall_enabled;
        let max_recalled_messages = memory_settings.max_recalled_messages;
        let drift_detection_enabled = memory_settings.drift_detection_enabled;

        // ── Fix #3: Skip duplicate DB fetch – chat.rs already loaded fresh messages ──
        // The runner trusts the passed-in `messages` slice; only falls back to a DB
        // fetch when the slice is empty (e.g. orchestrator path) or no DB is available.
        let mut conversation =
            load_initial_conversation(self.db_pool.as_ref(), &chat_id, messages).await;
        let voice_user_request = conversation
            .iter()
            .rev()
            .find(|message| message.role == "user")
            .map(|message| message.content.clone())
            .unwrap_or_default();

        // ── Fix #1: Pre-load cached recall from previous turn (zero-cost) ──
        // The heavy embedding work runs in a background task AFTER the LLM responds.
        // On the first message of a new chat the cache is empty – the recall block is simply absent.
        let cached_recall_context =
            cached_recall_context(&self.app, &chat_id, semantic_recall_enabled).await;
        // Suppress the old per-loop cache variables – recall is now injected once at iteration start
        // context_tracker still needs its first-msg vector for drift; but we no longer block on it.
        // We'll skip the blocker and just initialise to None (drift check is best-effort).
        let _ = drift_detection_enabled; // consumed below when checking

        let mut iteration = 0;
        let mut current_agent = agent;
        let mut call_counts: HashMap<String, usize> = HashMap::new();
        let mut consecutive_errors = 0;
        let mut just_received_tool_results = false;
        let mut total_tokens_in: i64 = 0;
        let mut total_tokens_out: i64 = 0;
        let mut message_persisted = false;
        let mut assistant_message_id: Option<String> = None;
        let mut accumulated_commentary = String::new();
        let early_tool_state = Arc::new(EarlyToolExecutionState::new());

        // ── P1: Check if provider supports structured tool calling ──
        let tools_supported = provider.supports_tools(&model);

        loop {
            // Yield to the executor to prevent thread starvation during tight loops
            tokio::task::yield_now().await;

            if token.is_cancelled() {
                tracing::info!(chat_id = %chat_id, "Agent loop cancelled by client");

                // Save partial content to database if available
                if let Some(ref db) = self.db_pool {
                    let partial_text = if !accumulated_commentary.is_empty() {
                        accumulated_commentary.clone()
                    } else {
                        conversation
                            .last()
                            .filter(|m| m.role == "assistant")
                            .map(|m| m.content.clone())
                            .unwrap_or_else(|| "Agent run cancelled.".to_string())
                    };

                    message_persisted |= save_assistant_message(AssistantMessageSave {
                        db,
                        chat_id: &chat_id,
                        model: &model,
                        message_id: &mut assistant_message_id,
                        content: &partial_text,
                        is_complete: false,
                        tokens_in: Some(total_tokens_in),
                        tokens_out: Some(total_tokens_out),
                        tool_calls: None,
                        reasoning_details: None,
                        error_context: "Failed to save partial assistant message to SQLite",
                    })
                    .await;
                }

                self.trigger_background_embedding(&chat_id);

                // Emit completion event to unlock the chat UI
                self.emit(AgentEvent::ChatDone(ChatDonePayload {
                    chat_id: chat_id.clone(),
                    content: Some("Agent run cancelled.".to_string()),
                    tokens_in: total_tokens_in,
                    tokens_out: total_tokens_out,
                    reason: "cancelled".to_string(),
                    done: true,
                }));
                return Ok(AgentResponse {
                    content: Some("Agent run cancelled.".to_string()),
                    tool_calls: vec![],
                    reasoning: None,
                    handoff: None,
                    tokens_in: Some(total_tokens_in),
                    tokens_out: Some(total_tokens_out),
                    message_persisted,
                });
            }
            iteration += 1;
            if iteration > run_config.max_iterations {
                tracing::warn!(
                    "Agent loop reached max iterations ({})",
                    run_config.max_iterations
                );
                let final_msg = format!(
                    "Completed {} steps. Here's what I found so far based on the tools I used.",
                    run_config.max_iterations
                );

                // Emit chunk for UI awareness
                self.emit(AgentEvent::ChatChunk(ChatChunkPayload {
                    chat_id: chat_id.clone(),
                    delta: final_msg.clone(),
                    r#type: "text".to_string(),
                    done: false,
                    message_id: None,
                }));

                if !accumulated_commentary.is_empty() {
                    accumulated_commentary.push('\n');
                }
                accumulated_commentary.push_str(&final_msg);

                // Save max iterations reached assistant response to SQLite database
                if let Some(ref db) = self.db_pool {
                    message_persisted |= save_assistant_message(AssistantMessageSave {
                        db,
                        chat_id: &chat_id,
                        model: &model,
                        message_id: &mut assistant_message_id,
                        content: &accumulated_commentary,
                        is_complete: true,
                        tokens_in: Some(total_tokens_in),
                        tokens_out: Some(total_tokens_out),
                        tool_calls: None,
                        reasoning_details: None,
                        error_context: "Failed to save max iterations assistant message to SQLite",
                    })
                    .await;
                }

                self.spawn_voice_display_agent(
                    &chat_id,
                    &model,
                    &voice_user_request,
                    &accumulated_commentary,
                    &voice_display_tool_evidence(&conversation),
                    token.child_token(),
                );

                // Emit completion event to unlock the chat UI
                self.emit(AgentEvent::ChatDone(ChatDonePayload {
                    chat_id: chat_id.clone(),
                    content: Some(final_msg.clone()),
                    tokens_in: total_tokens_in,
                    tokens_out: total_tokens_out,
                    reason: "max_iterations".to_string(),
                    done: true,
                }));
                if summarization_enabled {
                    self.trigger_background_compaction(
                        &chat_id,
                        &model,
                        run_config.summarization_model.clone(),
                    );
                }
                self.trigger_background_embedding(&chat_id);
                return Ok(AgentResponse {
                    content: Some(final_msg),
                    tool_calls: vec![],
                    reasoning: None,
                    handoff: None,
                    tokens_in: Some(total_tokens_in),
                    tokens_out: Some(total_tokens_out),
                    message_persisted,
                });
            }

            // ── Emit status ──
            self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
                message: format!("{} – Step {}", current_agent.name, iteration),
                chat_id: chat_id.clone(),
                iteration: Some(iteration),
                phase: Some(if current_agent.id == "generalist" {
                    ChatStatusPhase::AGENT_STEP.to_string()
                } else {
                    ChatStatusPhase::AGENT_STREAMING.to_string()
                }),
                metadata: Some(serde_json::json!({
                    "status": "running",
                    "agentId": current_agent.id,
                    "agentName": current_agent.name,
                    "iteration": iteration,
                    "depth": self.depth,
                })),
            }));

            // ── Context compaction (token-aware, fixes #23) ──
            compact_context_if_needed(&mut conversation, &run_config, summarization_enabled);

            // ── Message-count truncation (per-agent config override) ──
            truncate_conversation_by_message_count(
                &mut conversation,
                run_config.max_messages_in_memory,
            );

            // ── Build authorized tools for current agent ──
            let (authorized_tool_ids, meta_tools) = self
                .authorized_tools_for_agent(&current_agent, run_config.tools_enabled)
                .await;

            // ── Build system prompt via middleware chain (D3.2) ──
            let app_inner = self.app.clone();

            let mut enrich_ctx = EnrichmentContext {
                system_content: current_agent.instructions.clone(),
                conversation: conversation.clone(),
                extra_system_messages: Vec::new(),
                chat_id: chat_id.clone(),
                recall_block: cached_recall_context.clone(),
                authorized_tool_ids: authorized_tool_ids.clone(),
                tools_supported,
                tools_enabled: run_config.tools_enabled,
            };

            let chain = MiddlewareChain::default_chain(app_inner.clone(), self.db_pool.clone());
            chain.enrich_all(&mut enrich_ctx).await?;

            let system_content = enrich_ctx.system_content;

            let mut full_context = vec![ChatMessage {
                role: "system".to_string(),
                content: system_content.clone(),
                reasoning_details: None,
                images: None,
                tool_calls: None,
                tool_call_id: None,
            }];

            // Inject extra system messages from middleware (e.g. summaries)
            for msg in enrich_ctx.extra_system_messages {
                full_context.push(ChatMessage {
                    role: "system".to_string(),
                    content: msg,
                    reasoning_details: None,
                    images: None,
                    tool_calls: None,
                    tool_call_id: None,
                });
            }

            let needs_summary_context = summarization_enabled
                && (iteration > 1 || conversation.len() > run_config.compaction_threshold);

            if needs_summary_context {
                if let Some(ref db) = self.db_pool {
                    // Cold: previous session summaries
                    if let Ok(prev_summaries) = queries::get_previous_summaries(db, &chat_id).await
                    {
                        for summary in prev_summaries {
                            full_context.push(ChatMessage {
                                role: "system".to_string(),
                                content: format!(
                                    "[Previous conversation summary]: {}",
                                    summary.summary
                                ),
                                reasoning_details: None,
                                images: None,
                                tool_calls: None,
                                tool_call_id: None,
                            });
                        }
                    }

                    // Warm: current session summary (if compacted)
                    if let Ok(Some(current_summary)) =
                        queries::get_current_summary(db, &chat_id).await
                    {
                        full_context.push(ChatMessage {
                            role: "system".to_string(),
                            content: format!(
                                "[Current conversation summary]: {}",
                                current_summary.summary
                            ),
                            reasoning_details: None,
                            images: None,
                            tool_calls: None,
                            tool_call_id: None,
                        });
                    }
                }
            }

            full_context.extend(conversation.clone());

            // ── Call LLM with auto-escalation (Phase 3.5) ──
            let chat_id_inner = chat_id.clone();

            // P1: Only pass structured tools if provider supports them
            let tools_arg = if tools_supported && !meta_tools.is_empty() {
                Some(meta_tools)
            } else {
                None
            };
            let early_tools = tools_arg.as_ref().map(|_| EarlyToolExecutionContext {
                chat_id: chat_id_inner.clone(),
                iteration,
                agent_id: current_agent.id.clone(),
                agent_name: current_agent.name.clone(),
                authorized_tool_ids: authorized_tool_ids.clone(),
                state: early_tool_state.clone(),
            });
            let agent_stream = if current_agent.id == "generalist" {
                None
            } else {
                Some((current_agent.id.clone(), current_agent.name.clone()))
            };

            // Auto-escalation: try current model, fallback to cloud if local fails
            let response = match self
                .call_llm_with_escalation(
                    &mut assistant_message_id,
                    EscalationParams {
                        provider,
                        model: &model,
                        messages: full_context.clone(),
                        tools: tools_arg.clone(),
                        config: config.clone(),
                        token: token.clone(),
                        app: &app_inner,
                        chat_id: &chat_id_inner,
                        stream_channel: None,
                        early_tools,
                        agent_stream,
                    },
                )
                .await
            {
                Ok(resp) => resp,
                Err(e) => {
                    // Check if we already tried escalation inside call_llm_with_escalation
                    // If we did, the error message will reflect that.
                    tracing::error!("LLM chat_stream failed: {}", e);

                    // Emit error event to unlock the chat UI
                    self.emit(AgentEvent::ChatError(ChatErrorPayload {
                        chat_id: chat_id.clone(),
                        error: e.to_string(),
                        recoverable: false,
                    }));

                    return Err(e).context("LLM chat_stream failed after all attempts");
                }
            };

            // Accumulate token counts (fixes #21)
            total_tokens_in += response.tokens_in.unwrap_or(0) as i64;
            total_tokens_out += response.tokens_out.unwrap_or(0) as i64;

            // ── Parse tool calls ──
            let mut tool_calls = Vec::new();
            let mut visible_response_content = response.content.clone();

            // Collect structured tool calls from the provider
            let mut raw_calls: Vec<crate::db::models::ToolCall> = Vec::new();
            if let Some(tc_list) = response.tool_calls {
                raw_calls.extend(tc_list);
            }

            // P1: If no structured calls, try to extract text-mode JSON tool blocks
            // from the response content (for models that don't support structured tools).
            if raw_calls.is_empty() && !tools_supported && !response.content.is_empty() {
                if let Some(parsed) = parse_text_tool_calls(&response.content) {
                    visible_response_content = strip_text_tool_call_blocks(&response.content);
                    raw_calls.extend(parsed);
                }
            }

            for tc in raw_calls {
                let call_signature = format!("{}:{}", tc.name, tc.args);
                let count = call_counts.entry(call_signature.clone()).or_insert(0);
                *count += 1;

                if *count > self.config.max_duplicate_calls {
                    tracing::warn!(
                        "Tool '{}' called {} times with same args – skipping to prevent loop",
                        tc.name,
                        count
                    );
                    continue;
                }

                tool_calls.push(ToolCall {
                    id: tc.id.clone(),
                    name: tc.name.clone(),
                    args: tc.args.clone(),
                });
            }

            // ── No tool calls → check if we should exit or nudge ──
            if tool_calls.is_empty() {
                // If we just received tool results but the model gave an empty/useless response,
                // nudge it to try again with the data it has.
                // A response is "useless" if:
                //   - It's very short (<100 chars) – likely just "Sure" or "Let me check"
                //   - It doesn't contain any specific data from the tool results
                let response_seems_empty = visible_response_content.trim().len() < 100;
                let response_is_non_answer = {
                    let lower = visible_response_content.to_lowercase();
                    lower.contains("let me")
                        || lower.contains("i'll check")
                        || lower.contains("i will")
                        || lower.contains("searching")
                        || lower.contains("looking into")
                        || lower.contains("i found some")
                        || (lower.contains("i don't") && lower.contains("information"))
                        || (lower.contains("i cannot") && lower.contains("find"))
                };
                if just_received_tool_results && (response_seems_empty || response_is_non_answer) {
                    tracing::info!("Model gave non-substantive response after tool results ({} chars) – nudging to use data", visible_response_content.trim().len());

                    // Collect a brief summary of what tool data is available
                    let tool_data_hint: String = conversation
                        .iter()
                        .rev()
                        .filter(|m| m.role == "tool")
                        .take(3)
                        .map(|m| m.content.chars().take(120).collect::<String>())
                        .collect::<Vec<_>>()
                        .join("; ");

                    conversation.push(ChatMessage {
                        role: "assistant".to_string(),
                        content: visible_response_content.clone(),
                        reasoning_details: response.reasoning_details.clone(),
                        images: None,
                        tool_calls: None,
                        tool_call_id: None,
                    });
                    conversation.push(ChatMessage {
                        role: "system".to_string(),
                        content: format!(
                            "CRITICAL: You received tool results containing real data but your response did not include it. \
                             The tool data includes: [{}]. \
                             You MUST now write a response that includes the SPECIFIC DATA from the tool results. \
                             Do NOT say 'I found information' – instead, write out what that information actually IS. \
                             Include numbers, names, descriptions, and key facts from the data you received.",
                            if tool_data_hint.is_empty() { "data available in conversation".to_string() } else { tool_data_hint }
                        ),
                        reasoning_details: None,
                        images: None,
                        tool_calls: None,
                        tool_call_id: None,
                    });
                    just_received_tool_results = false;
                    continue; // Re-run the LLM with the nudge
                }

                if !visible_response_content.trim().is_empty() {
                    if !accumulated_commentary.is_empty() {
                        accumulated_commentary.push('\n');
                    }
                    accumulated_commentary.push_str(&visible_response_content);
                }

                // Save final completed assistant response to SQLite database
                if let Some(ref db) = self.db_pool {
                    let serialized_reasoning = response
                        .reasoning_details
                        .as_ref()
                        .and_then(|rd| serde_json::to_string(rd).ok());
                    message_persisted |= save_assistant_message(AssistantMessageSave {
                        db,
                        chat_id: &chat_id,
                        model: &model,
                        message_id: &mut assistant_message_id,
                        content: &accumulated_commentary,
                        is_complete: true,
                        tokens_in: Some(total_tokens_in),
                        tokens_out: Some(total_tokens_out),
                        tool_calls: None,
                        reasoning_details: serialized_reasoning.as_deref(),
                        error_context: "Failed to save final assistant message to SQLite",
                    })
                    .await;
                }

                self.spawn_voice_display_agent(
                    &chat_id,
                    &model,
                    &voice_user_request,
                    &accumulated_commentary,
                    &voice_display_tool_evidence(&conversation),
                    token.child_token(),
                );

                // Emit completion event to unlock the chat UI
                self.emit(AgentEvent::ChatDone(ChatDonePayload {
                    chat_id: chat_id.clone(),
                    content: Some(accumulated_commentary.clone()),
                    tokens_in: total_tokens_in,
                    tokens_out: total_tokens_out,
                    reason: "complete".to_string(),
                    done: true,
                }));
                if summarization_enabled {
                    self.trigger_background_compaction(
                        &chat_id,
                        &model,
                        run_config.summarization_model.clone(),
                    );
                }
                self.trigger_background_embedding(&chat_id);
                // ── Fix #1: Refresh recall cache for the NEXT turn (background) ──
                self.trigger_background_recall_cache(
                    &chat_id,
                    max_recalled_messages,
                    semantic_recall_enabled,
                );

                return Ok(AgentResponse {
                    content: Some(accumulated_commentary),
                    tool_calls: vec![],
                    reasoning: None,
                    handoff: None,
                    tokens_in: Some(total_tokens_in),
                    tokens_out: Some(total_tokens_out),
                    message_persisted,
                });
            }

            // ── Record assistant message with tool calls ──
            let models_tool_calls: Vec<crate::db::models::ToolCall> = tool_calls
                .iter()
                .map(|tc| crate::db::models::ToolCall {
                    id: tc.id.clone(),
                    name: tc.name.clone(),
                    args: tc.args.clone(),
                })
                .collect();

            // ── Emit intermediate commentary to the user ──
            // If the LLM produced text alongside tool calls, it was already streamed via callback.
            // We just need to ensure it's saved correctly if DB is enabled.
            if !visible_response_content.trim().is_empty() {
                tracing::info!(
                    "Recording intermediate commentary: {}...",
                    visible_response_content
                        .chars()
                        .take(80)
                        .collect::<String>()
                );
                if !accumulated_commentary.is_empty() {
                    accumulated_commentary.push('\n');
                }
                accumulated_commentary.push_str(&visible_response_content);
            }

            let serialized_tool_calls = if !models_tool_calls.is_empty() {
                Some(serde_json::to_string(&models_tool_calls).unwrap_or_default())
            } else {
                None
            };

            // Save intermediate commentary & tool calls to DB (fixes #22)
            if let Some(ref db) = self.db_pool {
                let serialized_reasoning = response
                    .reasoning_details
                    .as_ref()
                    .and_then(|rd| serde_json::to_string(rd).ok());
                message_persisted |= save_assistant_message(AssistantMessageSave {
                    db,
                    chat_id: &chat_id,
                    model: &model,
                    message_id: &mut assistant_message_id,
                    content: &accumulated_commentary,
                    is_complete: false,
                    tokens_in: None,
                    tokens_out: None,
                    tool_calls: serialized_tool_calls.as_deref(),
                    reasoning_details: serialized_reasoning.as_deref(),
                    error_context: "Failed to save intermediate assistant message to SQLite",
                })
                .await;
            }

            conversation.push(ChatMessage {
                role: "assistant".to_string(),
                content: visible_response_content,
                reasoning_details: response.reasoning_details.clone(),
                images: None,
                tool_calls: Some(models_tool_calls),
                tool_call_id: None,
            });

            self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
                chat_id: chat_id.clone(),
                message: format!(
                    "Planning {} tool {}",
                    tool_calls.len(),
                    if tool_calls.len() == 1 {
                        "call"
                    } else {
                        "calls"
                    }
                ),
                iteration: Some(iteration),
                phase: Some(ChatStatusPhase::TOOL_BATCH_PLANNED.to_string()),
                metadata: Some(serde_json::json!({
                    "toolCount": tool_calls.len(),
                    "parallel": tool_calls.len() > 1,
                    "tools": tool_calls.iter().map(|tc| tc.name.clone()).collect::<Vec<_>>(),
                    "iteration": iteration,
                })),
            }));

            let mut ordered_results: Vec<Option<ToolResult>> = vec![None; tool_calls.len()];
            let mut remaining_calls: Vec<ToolCall> = Vec::new();
            let mut remaining_indexes: Vec<usize> = Vec::new();

            for (index, tool_call) in tool_calls.iter().enumerate() {
                let id_key = EarlyToolExecutionState::key_for(
                    &tool_call.name,
                    &tool_call.args,
                    Some(&tool_call.id),
                    Some(index),
                );
                let sig_key = EarlyToolExecutionState::key_for(
                    &tool_call.name,
                    &tool_call.args,
                    None,
                    Some(index),
                );
                let key = if early_tool_state.was_started(&id_key).await {
                    id_key
                } else {
                    sig_key
                };
                if early_tool_state.was_started(&key).await {
                    ordered_results[index] =
                        early_tool_state.wait_for_result(&key, token.clone()).await;
                }

                if ordered_results[index].is_none() {
                    remaining_indexes.push(index);
                    remaining_calls.push(tool_call.clone());
                }
            }

            let remaining_results = if remaining_calls.is_empty() {
                Vec::new()
            } else {
                self.execute_tools_with_hooks(
                    &remaining_calls,
                    &chat_id,
                    iteration,
                    &current_agent.id,
                    &current_agent.name,
                    &authorized_tool_ids,
                    token.clone(),
                )
                .await
            };

            for (index, result) in remaining_indexes
                .into_iter()
                .zip(remaining_results)
            {
                ordered_results[index] = Some(result);
            }

            let results: Vec<ToolResult> = ordered_results
                .into_iter()
                .enumerate()
                .map(|(index, maybe_result)| {
                    maybe_result.unwrap_or_else(|| ToolResult {
                        tool_call_id: tool_calls[index].id.clone(),
                        content: serde_json::json!({
                            "error": "Tool call did not produce a result.",
                            "tool": tool_calls[index].name,
                        }),
                        is_error: true,
                        duration_ms: 0,
                    })
                })
                .collect();

            let mut had_error = false;
            let mut had_success = false;
            for (tool_call, result) in tool_calls.iter().zip(results.iter()) {
                if result.is_error {
                    had_error = true;
                    tracing::warn!("Tool '{}' error: {}", tool_call.name, result.content);
                } else {
                    had_success = true;
                }

                // Check for agent handoff
                if tool_call.name == "handoff_to_agent" {
                    if let Some(target_id) = result
                        .content
                        .get("target_agent_id")
                        .or_else(|| {
                            result
                                .content
                                .get("output")
                                .and_then(|v| v.get("target_agent_id"))
                        })
                        .and_then(|v| v.as_str())
                    {
                        if let Some(next_agent) = self.agent_registry.get(target_id) {
                            tracing::info!("HANDOFF: {} → {}", current_agent.id, next_agent.id);

                            // Emit chat:status for general status updates
                            self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
                                message: format!("Transferring to {}", next_agent.name),
                                chat_id: chat_id.clone(),
                                iteration: Some(iteration),
                                phase: Some(ChatStatusPhase::HANDOFF.to_string()),
                                metadata: Some(serde_json::json!({
                                    "fromAgent": current_agent.name,
                                    "toAgent": next_agent.name,
                                    "iteration": iteration,
                                })),
                            }));

                            // Phase 3.4: Generate handoff summary (context compression)
                            let handoff_summary = generate_handoff_summary(
                                &conversation,
                                &current_agent.name,
                                &tool_call.args,
                            );

                            // Emit structured handoff action with summary
                            let handoff_reason = tool_call
                                .args
                                .get("reason")
                                .and_then(|v| v.as_str())
                                .unwrap_or("Specialized expertise required")
                                .to_string();

                            let handoff_meta = HandoffMeta {
                                from_agent: current_agent.id.clone(),
                                to_agent: next_agent.id.clone(),
                                reason: format!(
                                    "{} | Summary: {}",
                                    handoff_reason, handoff_summary
                                ),
                            };

                            let action_meta = ActionMeta {
                                agent_id: current_agent.id.clone(),
                                agent_name: current_agent.name.clone(),
                                iteration,
                                depth: self.depth,
                                tool_call: None,
                                tool_result: None,
                                handoff: Some(handoff_meta),
                                progress_percent: None,
                                spawn: None,
                                approval_request: None,
                                ..Default::default()
                            };

                            if let Some(ref db) = self.db_pool {
                                let _ = persist_and_emit_action(ActionPersistParams {
                                    app: &self.app,
                                    db_pool: db,
                                    chat_id: &chat_id,
                                    id: None,
                                    kind: MessageKind::AgentHandoff,
                                    content: format!(
                                        "{} handing off to {}",
                                        current_agent.name, next_agent.name
                                    ),
                                    meta: action_meta,
                                    role: None,
                                    tool_call_id: None,
                                    channel: &self.on_event,
                                })
                                .await;
                            } else {
                                let _ = emit_action_only(ActionEmitParams {
                                    app: &self.app,
                                    chat_id: &chat_id,
                                    id: None,
                                    kind: MessageKind::AgentHandoff,
                                    content: format!(
                                        "{} handing off to {}",
                                        current_agent.name, next_agent.name
                                    ),
                                    meta: action_meta,
                                    channel: &self.on_event,
                                });
                            }

                            // Inject context bridge so the new agent knows what happened before it
                            conversation.push(ChatMessage {
                                role: "system".to_string(),
                                content: format!(
                                    "[Context bridge] You are now taking over from {}. {}",
                                    current_agent.name, handoff_summary
                                ),
                                reasoning_details: None,
                                images: None,
                                tool_calls: None,
                                tool_call_id: None,
                            });

                            current_agent = next_agent.clone();
                        }
                    }
                }

                // Extract string content from tool result:
                // - If it's a JSON object with "result" field (formatted output), use that
                // - If it's a JSON object with "error" field, use error message
                // - Otherwise, convert to string
                let content_str = match &result.content {
                    serde_json::Value::String(s) => s.clone(),
                    serde_json::Value::Object(obj) => {
                        // Tool returned structured result {result, exit_code, timed_out}
                        if let Some(formatted_result) = obj.get("result") {
                            match formatted_result {
                                serde_json::Value::String(s) => s.clone(),
                                _ => formatted_result.to_string(),
                            }
                        } else if let Some(error) = obj.get("error") {
                            format!("Error: {}", error)
                        } else {
                            // Fall back to stringifying the whole object
                            result.content.to_string()
                        }
                    }
                    _ => result.content.to_string(),
                };
                conversation.push(ChatMessage {
                    role: "tool".to_string(),
                    content: content_str.clone(),
                    reasoning_details: None,
                    images: None,
                    tool_calls: None,
                    tool_call_id: Some(result.tool_call_id.clone()),
                });

                // Emit structured tool_result action (Phase 1.4)
                // Check if this is a file operation with diff data
                let files = parse_file_changes(&result.content);

                let tool_result_meta = ToolResultMeta {
                    tool_name: tool_call.name.clone(),
                    status: if result.is_error {
                        "error".to_string()
                    } else {
                        "ok".to_string()
                    },
                    duration_ms: result.duration_ms,
                    content_summary: content_str.chars().take(200).collect(),
                    args: tool_call.args.clone(), // P1: Added args for result preview
                    files,
                    raw_result: Some(result.content.clone()),
                    tool_call_id: Some(result.tool_call_id.clone()),
                };

                let action_meta = ActionMeta {
                    agent_id: current_agent.id.clone(),
                    agent_name: current_agent.name.clone(),
                    iteration,
                    depth: self.depth,
                    progress_percent: None,
                    tool_call: Some(ToolCallMeta {
                        // P1: Populate tool_call for correlation
                        tool_name: tool_call.name.clone(),
                        args: tool_call.args.clone(),
                        status: if result.is_error {
                            "failed".to_string()
                        } else {
                            "completed".to_string()
                        },
                        tool_call_id: Some(result.tool_call_id.clone()),
                    }),
                    tool_result: Some(tool_result_meta),
                    handoff: None,
                    spawn: None,
                    approval_request: None,
                    ..Default::default()
                };

                let result_content = format!(
                    "{}: {} {}",
                    tool_call.name,
                    if result.is_error { "Error" } else { "Success" },
                    content_str.chars().take(50).collect::<String>()
                );

                if let Some(ref db) = self.db_pool {
                    let _ = persist_and_emit_action(ActionPersistParams {
                        app: &self.app,
                        db_pool: db,
                        chat_id: &chat_id,
                        id: None,
                        kind: MessageKind::ToolResult,
                        content: result_content,
                        meta: action_meta,
                        role: Some("tool"),
                        tool_call_id: Some(result.tool_call_id.clone()),
                        channel: &self.on_event,
                    })
                    .await;
                } else {
                    let _ = emit_action_only(ActionEmitParams {
                        app: &self.app,
                        chat_id: &chat_id,
                        id: None,
                        kind: MessageKind::ToolResult,
                        content: result_content,
                        meta: action_meta,
                        channel: &self.on_event,
                    });
                }
            }

            // Track that we just received tool results so we can nudge if the model ignores them
            just_received_tool_results = had_success;

            // ── Inject nudge after every successful tool execution (fixes #24) ──
            // Use a single nudge slot that gets overwritten instead of accumulating
            if had_success && !had_error {
                // Remove ALL previous nudge messages (retain ensures no accumulation in edge cases)
                conversation.retain(|m| {
                    !(m.role == "system" && m.content.contains("Tool execution complete"))
                });

                // Build a brief hint of what data is now available
                let latest_data: String = conversation
                    .iter()
                    .rev()
                    .filter(|m| m.role == "tool")
                    .take(2)
                    .map(|m| m.content.chars().take(80).collect::<String>())
                    .collect::<Vec<_>>()
                    .join("; ");

                // Add fresh nudge at the end with explicit data-inclusion instruction
                conversation.push(ChatMessage {
                    role: "system".to_string(),
                    content: format!(
                        "Tool execution complete. You now have real data: [{}]. \
                         IMPORTANT: In your next response, you MUST include the specific data, numbers, and facts \
                         from the tool results above. Do NOT give a vague summary – provide the actual information. \
                         If you have enough information to answer the user, provide your final comprehensive answer now. \
                         If you need more data, call another tool.",
                        if latest_data.is_empty() { "see tool results above".to_string() } else { latest_data }
                    ),
                    reasoning_details: None,
                    images: None,
                    tool_calls: None,
                    tool_call_id: None,
                });
            }

            // ── Error tracking for self-correction ──
            if had_error {
                consecutive_errors += 1;
                if consecutive_errors >= 3 {
                    tracing::warn!("3 consecutive tool errors – injecting recovery hint");
                    // Remove ALL previous error nudges
                    conversation.retain(|m| {
                        !(m.role == "system"
                            && m.content.contains("Multiple tool calls have failed"))
                    });
                    conversation.push(ChatMessage {
                        role: "system".to_string(),
                        content: "Multiple tool calls have failed. Consider: \
                                  1) Using a different tool or approach. \
                                  2) Providing a partial answer based on data already gathered. \
                                  3) Explaining what you tried and what failed."
                            .to_string(),
                        reasoning_details: None,
                        images: None,
                        tool_calls: None,
                        tool_call_id: None,
                    });
                }
            } else {
                consecutive_errors = 0;
            }
        }
    }
}
