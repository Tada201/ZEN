//! The runner turn loop: pre-loop setup and the iteration driver.
//!
//! Split out of the former single `loop.rs` during BIG_MIGRATION.md Phase
//! 11. The step-level handlers (exit paths, skill preload, tool-result
//! persistence, post-tool nudges) live in `step_exec.rs` as sibling `Runner`
//! methods; this file keeps `run()` and the loop skeleton.
//!
use super::escalation::EscalationParams;
use super::helpers::{parse_text_tool_calls, strip_text_tool_call_blocks, FileReadTracker};
use super::lifecycle::Runner;
use super::memory_bootstrap::{
    cached_recall_context, load_initial_conversation, load_memory_run_settings,
};
use super::step_exec::NoToolCallsOutcome;
use super::streaming::{EarlyToolExecutionContext, EarlyToolExecutionState};
use super::turn_persistence::{persist_chat_failure, save_assistant_message, AssistantMessageSave};
use crate::agent::chat_status::ChatStatusPhase;
use crate::agent::event_bus::{AgentEvent, ChatErrorPayload, ChatStatusPayload};
use crate::agent::middleware::{EnrichmentContext, MiddlewareChain};
use crate::agent::types::*;
use crate::db::models::ChatMessage;
use crate::llm::LlmProvider;
use anyhow::{Context, Result};
use std::collections::HashMap;
use std::sync::Arc;

use tokio_util::sync::CancellationToken;

use crate::agent::context_breakdown::compute_context_breakdown;

/// Per-iteration `save_assistant_message` calls contend with the parent's
/// SQLite writer. Children only persist on final completion.
pub(super) fn should_persist_iteration_state(depth: u32) -> bool {
    depth == 0
}

/// Subagent `chat:status` events leak into the parent's active chat slot
/// in the frontend. Suppress them; status visibility for children is
/// already provided by the agents panel.
pub(super) fn should_emit_iteration_status(depth: u32) -> bool {
    depth == 0
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
        let persist_to_parent_chat = self.should_persist_to_parent_chat();
        let use_semantic_recall = semantic_recall_enabled && persist_to_parent_chat;

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
            cached_recall_context(&self.ctx, &chat_id, use_semantic_recall).await;

        // ── C4: mint a fresh per-run monotonic id from the shared counter ──
        // The same id is carried on every ContextBreakdownPayload emitted
        // during this run and on the cold-start cache entry, so the
        // frontend dedupes by (chat_id, run_id, iteration) instead of
        // iteration alone. Without this, a later, shorter run on the
        // same chat gets silently overwritten by a stale, longer
        // earlier run because dedupe only compared iteration numbers.
        let run_id: u64 = self
            .ctx
            .next_run_id
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);

        // Mint a per-run correlation id (UUID). Unlike `run_id`/`chat_id` —
        // which are stable across every turn on a chat — the trace_id is
        // unique to this single `run()` invocation, so every event stamped
        // with it (tool start/complete, authorization, chat done/error)
        // can be reassembled into one reasoning trace for debugging/replay.
        let trace_id = self.begin_trace();
        tracing::info!(chat_id = %chat_id, trace_id = %trace_id, run_id, depth = self.depth, "run: trace begin");

        let mut iteration: usize = 0;
        let current_agent = agent;
        let mut call_counts: HashMap<String, usize> = HashMap::new();
        let mut consecutive_errors = 0;
        let mut just_received_tool_results = false;
        let mut total_tokens_in: i64 = 0;
        let mut total_tokens_out: i64 = 0;
        // Provider-reported usage from the most recent completed LLM call.
        // The breakdown for iteration N is computed BEFORE that iteration's
        // call, so it carries the real usage of iteration N-1 (the latest
        // the provider has actually billed). None until the first call
        // returns.
        let mut last_actual_input: Option<usize> = None;
        let mut last_actual_output: Option<usize> = None;
        let mut message_persisted = false;
        let mut assistant_message_id: Option<String> = None;
        let mut accumulated_commentary = String::new();
        let mut current_run_gen_image_ids: std::collections::HashSet<String> =
            std::collections::HashSet::new();
        // Tracks the mtime of every file the agent read/wrote this run so the
        // loop can warn the model when a file it is reasoning about changes on
        // disk between iterations (stale-read detection).
        let mut file_read_tracker = FileReadTracker::new();
        let early_tool_state = Arc::new(EarlyToolExecutionState::new());

        // ── C6: preload skill bodies ONCE before the loop ──
        // (comment moved with the body into step_exec::preload_skill_fragments)
        let (preloaded_skill_fragments, chat_workspace_root) =
            self.preload_skill_fragments(&chat_id, &conversation).await;

        // ── P1: Check if provider supports structured tool calling ──
        let tools_supported = provider.supports_tools(&model);

        loop {
            // Yield to the executor to prevent thread starvation during tight loops
            tokio::task::yield_now().await;

            // Cooperative pause: wait before the next model/tool boundary.
            // Stop still wins while paused and follows the normal partial-trace
            // cancellation path below.
            let _ = self.ctx.wait_for_chat_resume(&chat_id, &token).await;

            if token.is_cancelled() {
                tracing::info!(chat_id = %chat_id, "Agent loop cancelled by client");
                return Ok(self
                    .handle_cancellation(
                        &chat_id,
                        &model,
                        &conversation,
                        &accumulated_commentary,
                        &mut assistant_message_id,
                        total_tokens_in,
                        total_tokens_out,
                        &mut message_persisted,
                    )
                    .await);
            }
            iteration += 1;
            // Snapshot the sequence at iteration start, before the LLM stream can
            // fire early tools that consume sequences. Commentary tagged with this
            // value sorts before every tool this iteration emits (early or not),
            // so the Agents panel interleaves think→call in true order.
            let iteration_start_sequence = self.peek_event_sequence();

            // ── Drain any parent→child injected messages into the conversation ──
            // A parent agent/orchestrator can push messages into this runner's
            // inbox while it is running; they are merged here so the next LLM
            // call sees them as part of the conversation.
            if let Some(inbox) = &self.message_inbox {
                let mut queued = inbox.lock().await;
                while let Some(msg) = queued.pop_front() {
                    conversation.push(msg);
                }
            }

            if iteration > run_config.max_iterations {
                tracing::warn!(
                    "Agent loop reached max iterations ({})",
                    run_config.max_iterations
                );
                return Ok(self
                    .handle_max_iterations(
                        &chat_id,
                        &model,
                        run_config.max_iterations,
                        summarization_enabled,
                        run_config.summarization_model.clone(),
                        &voice_user_request,
                        &token,
                        &conversation,
                        &current_run_gen_image_ids,
                        &mut accumulated_commentary,
                        &mut assistant_message_id,
                        &mut message_persisted,
                        total_tokens_in,
                        total_tokens_out,
                    )
                    .await);
            }
            // ── Emit status ──
            if should_emit_iteration_status(self.depth) {
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
            } else if self.depth > 0 {
                // Sub-agent progress: emit a lightweight agent:chunk so the
                // parent and UI can observe mid-execution progress without
                // mixing it into the main chat stream.
                self.emit(AgentEvent::AgentChunk(
                    crate::agent::event_bus::AgentChunkPayload {
                        chat_id: chat_id.clone(),
                        spawn_id: self.trace_id(),
                        agent_id: current_agent.id.clone(),
                        agent_name: current_agent.name.clone(),
                        delta: format!("step {}", iteration),
                        r#type: "progress".to_string(),
                    },
                ));
            }

            // ── Build authorized tools for current agent ──
            let (authorized_tool_ids, meta_tools) = self
                .authorized_tools_for_agent(&current_agent, run_config.tools_enabled)
                .await;

            // ── Build system prompt via middleware chain (D3.2) ──
            //
            // Compaction + summary injection now live inside the chain
            // (see `CompactionMiddleware` priority 30 and
            // `SummaryMiddleware` priority 20). The middleware mutates
            // `enrich_ctx.conversation` in place and pushes summary
            // blocks into `enrich_ctx.extra_system_messages`. After the
            // chain runs we MUST re-sync the outer `conversation` back
            // from the enriched copy, or compaction is lost across
            // iterations and the context grows unbounded.
            let app_inner = self.app.clone();

            // ── C6: hot-path buffer reuse via mem::take ──
            // The previous code did `conversation.clone()` into
            // enrich_ctx, then `conversation = enrich_ctx.conversation.clone()`
            // back. Each clone is a full deep copy of the conversation
            // (every ChatMessage has heap-owned String/Option/Vec).
            // mem::take swaps the buffer OUT of conversation into
            // enrich_ctx, the chain mutates in place, and we take the
            // (possibly compacted) buffer back. No allocations, no deep
            // copies; the canonical buffer stays in `conversation`.
            let mut enrich_ctx = EnrichmentContext {
                system_content: current_agent.instructions.clone(),
                conversation: std::mem::take(&mut conversation),
                extra_system_messages: Vec::new(),
                chat_id: chat_id.clone(),
                workspace_root: chat_workspace_root.clone(),
                recall_block: cached_recall_context.clone(),
                authorized_tool_ids: authorized_tool_ids.clone(),
                delegation_allowed: self.delegation_allowed,
                tools_supported,
                tools_enabled: run_config.tools_enabled,
                iteration,
                summarization_enabled,
                compaction_token_threshold: run_config.compaction_token_threshold,
                compaction_threshold: run_config.compaction_threshold,
                max_messages_in_memory: run_config.max_messages_in_memory,
                section_log: Vec::new(),
                compaction_event: None,
                run_id,
            };

            let chain = MiddlewareChain::default_chain(
                app_inner.clone(),
                self.ctx.clone(),
                self.db_pool.clone(),
                true,
                Some(self.config.max_context_tokens as i64),
            );
            chain.enrich_all(&mut enrich_ctx).await?;

            // B1 fix: persist in-place compaction across iterations.
            // `enrich_ctx.conversation` may have been pruned,
            // stale-read-elided, or message-count-capped by
            // `CompactionMiddleware`. Pipeline the buffer back via
            // mem::take so the chain's compacted result becomes the
            // owner and the loop keeps the canonical buffer without
            // re-cloning.
            conversation = std::mem::take(&mut enrich_ctx.conversation);

            // Emit the per-iteration context breakdown so the frontend
            // visualiser can render the Codex-style sections + gauge.
            // We only emit on the final iteration of each turn (when the
            // runner is about to either exit the loop or recurse into
            // tool execution) so we don't flood the event bus on busy
            // multi-step runs.
            if should_emit_iteration_status(self.depth) {
                // The truth comes from `CompactionMiddleware` via
                // `EnrichmentContext::compaction_event`. The middleware
                // is the only place that knows which branch fired and
                // whether the conversation actually shrank; the loop
                // no longer infers `CompactionKind` from a brittle
                // token-threshold heuristic.
                let compaction_event = enrich_ctx.compaction_event.clone();

                let breakdown = compute_context_breakdown(
                    &enrich_ctx,
                    &run_config,
                    compaction_event,
                    &meta_tools,
                    run_config.model_context_window,
                );
                // Overlay the real provider usage from the previous
                // completed call so the badge can show actual-vs-estimate.
                let mut breakdown = breakdown;
                breakdown.actual_input_tokens = last_actual_input;
                breakdown.actual_output_tokens = last_actual_output;
                // Mirror the latest per-chat breakdown into the
                // shared cache so `get_context_breakdown` /
                // `get_context_snapshot` can hydrate the right-panel
                // on cold start. The cache write is best-effort and
                // cannot fail: the context shares the same Arc the
                // AppState owns.
                {
                    let mut cache = self.ctx.context_breakdown_cache.write().await;
                    cache.insert(breakdown.chat_id.clone(), breakdown.clone());
                }
                self.emit(crate::agent::event_bus::AgentEvent::ContextBreakdown(
                    breakdown,
                ));
            }

            let system_content = enrich_ctx.system_content;

            let mut full_context = vec![ChatMessage {
                role: "system".to_string(),
                content: system_content.clone(),
                reasoning_details: None,
                images: None,
                tool_calls: None,
                tool_call_id: None,
            }];

            // Inject extra system messages from middleware (summaries).
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

            full_context.extend(conversation.clone());

            // ── Skill mention injection (cache-only) ──
            // Bodies were preloaded once before the loop (see the
            // C6 block above), so this no longer hits the filesystem
            // per iteration. We emit the fragments in name-insertion
            // order matching the original resolver's deterministic
            // path. The cache hit cost is O(N) over the small set of
            // mentioned skills instead of O(mentions × disk I/O).
            use crate::agent::skills::ContextualFragment;
            for frag in &preloaded_skill_fragments {
                full_context.push(ChatMessage {
                    role: "user".to_string(),
                    content: frag.body(),
                    reasoning_details: None,
                    images: None,
                    tool_calls: None,
                    tool_call_id: None,
                });
            }

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
                        chat_id: &chat_id_inner,
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
                    tracing::error!(model = %model, "LLM chat_stream failed: {}", e);

                    let error_text = e.to_string();
                    if let Some(ref db) = self.db_pool {
                        persist_chat_failure(
                            db,
                            &chat_id,
                            &model,
                            &mut assistant_message_id,
                            &accumulated_commentary,
                            &error_text,
                            false,
                        )
                        .await;
                    }

                    // A sub-agent shares the parent's chat id, so a raw
                    // ChatError here would mark the parent's assistant message
                    // failed and tear down its stream over a child's failure.
                    // The spawn tool already reports child failures through its
                    // own terminal subagent-step and agent:complete events.
                    self.emit_owned_chat_error(ChatErrorPayload {
                        chat_id: chat_id.clone(),
                        error: error_text,
                        recoverable: false,
                    });

                    // Name the model in the context: the most common cause of a
                    // hard stream failure is a model the provider does not
                    // accept, and the generic wording sent past debugging
                    // sessions looking for transient network faults.
                    return Err(e).context(format!("LLM stream failed for model '{}'", model));
                }
            };

            // Accumulate token counts (fixes #21)
            total_tokens_in += response.tokens_in.unwrap_or(0) as i64;
            total_tokens_out += response.tokens_out.unwrap_or(0) as i64;
            // Remember this call's real usage so the NEXT iteration's
            // breakdown reports the provider-billed size. Only overwrite
            // when the provider actually reported a value.
            if let Some(t) = response.tokens_in {
                last_actual_input = Some(t.max(0) as usize);
            }
            if let Some(t) = response.tokens_out {
                last_actual_output = Some(t.max(0) as usize);
            }
            // Re-stamp the cached breakdown for this iteration with the
            // real usage the call just reported and re-emit, so the badge
            // shows actual-vs-estimate even on a single-turn run that exits
            // before the next pre-call breakdown would fire.
            if should_emit_iteration_status(self.depth)
                && (last_actual_input.is_some() || last_actual_output.is_some())
            {
                {
                    let updated = {
                        let mut cache = self.ctx.context_breakdown_cache.write().await;
                        // Guard on run_id: a stop-and-resend can leave a
                        // newer run's breakdown in the cache under this
                        // chat_id. Only re-stamp when the cached entry
                        // belongs to THIS run, or we'd paint this run's
                        // usage onto the newer run's row.
                        cache
                            .get_mut(&chat_id)
                            .filter(|bd| bd.run_id == run_id)
                            .map(|bd| {
                                bd.actual_input_tokens = last_actual_input;
                                bd.actual_output_tokens = last_actual_output;
                                bd.clone()
                            })
                    };
                    if let Some(bd) = updated {
                        self.emit(crate::agent::event_bus::AgentEvent::ContextBreakdown(bd));
                    }
                }
            }

            // ── Token budget enforcement (#5) ──
            if let Some(budget) = run_config.token_budget {
                let total = total_tokens_in + total_tokens_out;
                if total > budget as i64 {
                    return Ok(self
                        .handle_token_budget_exceeded(
                            &chat_id,
                            &model,
                            budget,
                            total,
                            summarization_enabled,
                            run_config.summarization_model.clone(),
                            &mut accumulated_commentary,
                            &mut assistant_message_id,
                            &mut message_persisted,
                            total_tokens_in,
                            total_tokens_out,
                        )
                        .await);
                }
            }
            // ── Parse tool calls ──
            let mut tool_calls = Vec::new();
            let mut visible_response_content = response.content.clone();

            // Collect structured tool calls from the provider
            let mut raw_calls: Vec<crate::db::models::ToolCall> = Vec::new();
            if let Some(tc_list) = response.tool_calls.clone() {
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

                // Track generate_image tool-call IDs for the current run
                if tc.name == "generate_image" {
                    current_run_gen_image_ids.insert(tc.id.clone());
                }

                tool_calls.push(ToolCall {
                    id: tc.id.clone(),
                    name: tc.name.clone(),
                    args: tc.args.clone(),
                });
            }

            // ── No tool calls → check if we should exit or nudge ──
            if tool_calls.is_empty() {
                match self
                    .handle_no_tool_calls(
                        &chat_id,
                        &model,
                        summarization_enabled,
                        run_config.summarization_model.clone(),
                        max_recalled_messages,
                        semantic_recall_enabled,
                        &voice_user_request,
                        &token,
                        &mut conversation,
                        &current_run_gen_image_ids,
                        &response,
                        &visible_response_content,
                        &mut just_received_tool_results,
                        &mut accumulated_commentary,
                        &mut assistant_message_id,
                        &mut message_persisted,
                        total_tokens_in,
                        total_tokens_out,
                    )
                    .await
                {
                    NoToolCallsOutcome::Nudge => continue,
                    NoToolCallsOutcome::Final(resp) => return Ok(resp),
                }
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
                // A child runner suppresses live text, so its commentary between
                // tool calls would otherwise be lost. Tag it with the sequence
                // captured at iteration start so it sorts before every tool this
                // iteration emits (including early tools already streamed), and
                // emit it live so the Agents panel fills in as the child works.
                self.record_and_emit_intermediate_commentary(
                    iteration_start_sequence,
                    &visible_response_content,
                    &chat_id,
                    &current_agent.id,
                    &current_agent.name,
                )
                .await;
            }

            let serialized_tool_calls = if !models_tool_calls.is_empty() {
                Some(serde_json::to_string(&models_tool_calls).unwrap_or_default())
            } else {
                None
            };

            // Save intermediate commentary & tool calls to DB (fixes #22)
            if should_persist_iteration_state(self.depth) {
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
                        metadata: None,
                        error_context: "Failed to save intermediate assistant message to SQLite",
                    })
                    .await;
                }
            }

            conversation.push(ChatMessage {
                role: "assistant".to_string(),
                content: visible_response_content,
                reasoning_details: response.reasoning_details.clone(),
                images: None,
                tool_calls: Some(models_tool_calls),
                tool_call_id: None,
            });

            if should_emit_iteration_status(self.depth) {
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
            }

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
                    assistant_message_id.clone(),
                )
                .await
            };

            for (index, result) in remaining_indexes.into_iter().zip(remaining_results) {
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

            let (had_error, had_success) = self
                .process_tool_results(
                    &tool_calls,
                    &results,
                    &mut conversation,
                    &mut file_read_tracker,
                    &chat_id,
                    iteration,
                    &current_agent,
                )
                .await;

            self.post_tool_turn_updates(
                &mut conversation,
                &chat_id,
                &mut file_read_tracker,
                had_success,
                had_error,
                &mut consecutive_errors,
                &mut just_received_tool_results,
            )
            .await;
        }
    }
}
