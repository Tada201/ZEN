use super::actions::{
    emit_action_only, persist_and_emit_action, ActionEmitParams, ActionPersistParams,
};
use super::escalation::{EarlyToolExecutionContext, EarlyToolExecutionState, EscalationParams};
use super::helpers::{
    parse_file_changes, parse_text_tool_calls,
    strip_text_tool_call_blocks, FileReadTracker,
};
use super::lifecycle::Runner;
use super::memory_bootstrap::{
    cached_recall_context, load_initial_conversation, load_memory_run_settings,
};
use super::turn_persistence::{persist_chat_failure, save_assistant_message, AssistantMessageSave};
use crate::agent::chat_status::ChatStatusPhase;
use crate::agent::event_bus::{
    AgentEvent, ChatChunkPayload, ChatDonePayload, ChatErrorPayload, ChatStatusPayload,
};
use crate::agent::middleware::{EnrichmentContext, MiddlewareChain};
use crate::agent::skills as skills_mod;
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

/// Extracts image URIs from `generate_image` tool results in the conversation,
/// but **only** for tool-call IDs that belong to the current run.
/// This prevents old images from prior conversation history leaking into later replies.
fn extract_generated_image_uris(
    conversation: &[ChatMessage],
    current_run_ids: &std::collections::HashSet<String>,
) -> Vec<String> {
    if current_run_ids.is_empty() {
        return Vec::new();
    }

    // Find matching tool results and extract image_uri
    conversation
        .iter()
        .filter(|m| m.role == "tool" && m.tool_call_id.as_deref().is_some_and(|id| current_run_ids.contains(id)))
        .filter_map(|m| {
            serde_json::from_str::<serde_json::Value>(&m.content)
                .ok()
                .and_then(|v| {
                    v.get("image_uri")
                        .or_else(|| v.get("imageUri"))
                        .or_else(|| v.get("image_url"))
                        .and_then(|u| u.as_str())
                        .map(|s| s.to_string())
                })
        })
        .collect()
}

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
        // The skill mention resolver needs to load SKILL.md bodies from
        // disk. Doing this on every iteration is the dominant per-iter
        // cost for chats that mention skills (it's a tokio::fs round
        // trip + serde metadata lookup per mention per iter). The
        // latest user message is stable across iterations in the common
        // case, so we resolve mentions once and replay the fragments
        // from a Vec. A Vec (insertion-ordered) is chosen over a
        // HashMap so the prompt sees the SAME skill order across
        // iterations — HashMap iteration order is unspecified and
        // would otherwise flip the fragments between iterations of
        // the same run, producing non-deterministic context the model
        // sees. The skill name lives inside `SkillInstructionsFragment`
        // already, so a tuple `(String, …)` would double-store it;
        // dedupe is owned by `seen`.
        let mut preloaded_skill_fragments: Vec<
            crate::agent::skills::SkillInstructionsFragment,
        > = Vec::new();
        // Skill discovery resolves against the chat's captured workspace
        // root, not the process cwd — the app's cwd is the install dir.
        let chat_workspace_root: Option<std::path::PathBuf> = match self.db_pool.as_ref() {
            Some(db) => crate::db::queries::get_chat(db, &chat_id)
                .await
                .ok()
                .and_then(|chat| chat.workspace_root)
                .and_then(|root| {
                    crate::workspace::canonicalize_workspace_root(std::path::Path::new(&root))
                        .ok()
                }),
            None => None,
        };
        let skills_cwd = chat_workspace_root
            .clone()
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
        if let Some(latest) = conversation.iter().rev().find(|m| m.role == "user") {
            if !latest.content.is_empty() {
                {
                    let mgr = self.ctx.skills_manager.clone();
                    let outcome = mgr.enabled_skills_for_cwd(&skills_cwd).await;
                    let mut seen: std::collections::HashSet<String> =
                        std::collections::HashSet::new();
                    // A leading `/skill-name args` is a slash invocation: the
                    // body is expanded with $ARGUMENTS/$ARGUMENTS_SUFFIX and
                    // takes priority over any `$name` mentions of the same
                    // skill. The raw user text stays in the transcript.
                    if let skills_mod::SlashCommand::Skill { name, args } =
                        skills_mod::parse_slash_command(&latest.content, &outcome.skills)
                    {
                        if let Some(skill) = outcome.find_by_name(&name) {
                            if let Ok(body) = tokio::fs::read_to_string(&skill.path).await {
                                let suffix = if args.is_empty() {
                                    String::new()
                                } else {
                                    format!(": {}", args)
                                };
                                let expanded = body
                                    .replace("$ARGUMENTS_SUFFIX", &suffix)
                                    .replace("$ARGUMENTS", &args);
                                seen.insert(name);
                                preloaded_skill_fragments.push(
                                    skills_mod::SkillInstructionsFragment {
                                        name: skill.name.clone(),
                                        path: skill.path.display().to_string(),
                                        contents: expanded,
                                    },
                                );
                            }
                        }
                    }
                    let mentions = skills_mod::extract_skill_mentions(
                        &latest.content,
                        &outcome.skills,
                    );
                    for m in mentions {
                        if !seen.insert(m.name.clone()) {
                            continue;
                        }
                        if let Some(skill) = outcome.find_by_name(&m.name) {
                            if let Ok(body) =
                                tokio::fs::read_to_string(&skill.path).await
                            {
                                preloaded_skill_fragments.push(
                                    skills_mod::SkillInstructionsFragment {
                                        name: skill.name.clone(),
                                        path: skill.path.display().to_string(),
                                        contents: body,
                                    },
                                );
                            }
                        }
                    }
                }
            }
        }

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
                        metadata: None,
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
                    message_id: assistant_message_id.clone(),
                }));
                return Ok(AgentResponse {
                    content: Some("Agent run cancelled.".to_string()),
                    final_answer: None,
                    tool_calls: vec![],
                    reasoning: None,
                    handoff: None,
                    tokens_in: Some(total_tokens_in),
                    tokens_out: Some(total_tokens_out),
                    message_persisted,
                });
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
                    sequence: Some(self.peek_event_sequence()),
                }));

                if !accumulated_commentary.is_empty() {
                    accumulated_commentary.push('\n');
                }
                accumulated_commentary.push_str(&final_msg);

                // Auto-inject image markdown for generate_image tool results (current run only)
                let generated_uris = extract_generated_image_uris(&conversation, &current_run_gen_image_ids);
                for uri in &generated_uris {
                    if !accumulated_commentary.contains(uri) {
                        accumulated_commentary.push_str(&format!("\n\n![Generated Image]({})\n\n", uri));
                    }
                }

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
                        metadata: None,
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
                    content: Some(accumulated_commentary.clone()),
                    tokens_in: total_tokens_in,
                    tokens_out: total_tokens_out,
                    reason: "max_iterations".to_string(),
                    done: true,
                    message_id: assistant_message_id.clone(),
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
                    content: Some(accumulated_commentary),
                    final_answer: None,
                    tool_calls: vec![],
                    reasoning: None,
                    handoff: None,
                    tokens_in: Some(total_tokens_in),
                    tokens_out: Some(total_tokens_out),
                    message_persisted,
                });
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
                self.emit(AgentEvent::AgentChunk(crate::agent::event_bus::AgentChunkPayload {
                    chat_id: chat_id.clone(),
                    spawn_id: self.trace_id(),
                    agent_id: current_agent.id.clone(),
                    agent_name: current_agent.name.clone(),
                    delta: format!("step {}", iteration),
                    r#type: "progress".to_string(),
                }));
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
                self.emit(crate::agent::event_bus::AgentEvent::ContextBreakdown(breakdown));
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
                        app: &app_inner,
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
                    return Err(e).context(format!(
                        "LLM stream failed for model '{}'",
                        model
                    ));
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
                    tracing::warn!(
                        "Agent loop exceeded token budget ({} > {})",
                        total,
                        budget
                    );
                    let final_msg = format!(
                        "Token budget exceeded ({} tokens used > {} budget). Stopping with the information gathered so far.",
                        total, budget
                    );

                    self.emit(AgentEvent::ChatChunk(ChatChunkPayload {
                        chat_id: chat_id.clone(),
                        delta: final_msg.clone(),
                        r#type: "text".to_string(),
                        done: false,
                        message_id: None,
                        sequence: Some(self.peek_event_sequence()),
                    }));

                    if !accumulated_commentary.is_empty() {
                        accumulated_commentary.push('\n');
                    }
                    accumulated_commentary.push_str(&final_msg);

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
                            metadata: None,
                            error_context: "Failed to save token-budget assistant message to SQLite",
                        })
                        .await;
                    }

                    self.emit(AgentEvent::ChatDone(ChatDonePayload {
                        chat_id: chat_id.clone(),
                        content: Some(accumulated_commentary.clone()),
                        tokens_in: total_tokens_in,
                        tokens_out: total_tokens_out,
                        reason: "token_budget_exceeded".to_string(),
                        done: true,
                        message_id: assistant_message_id.clone(),
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
                        content: Some(accumulated_commentary),
                        final_answer: None,
                        tool_calls: vec![],
                        reasoning: None,
                        handoff: None,
                        tokens_in: Some(total_tokens_in),
                        tokens_out: Some(total_tokens_out),
                        message_persisted,
                    });
                }
            }

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
                // The child's real final answer is just this terminal turn's
                // text, not the accumulated per-iteration commentary. Capturing
                // it separately stops the Agents panel from repeating every
                // interleaved segment inside the final reply block.
                let final_answer = {
                    let trimmed = visible_response_content.trim();
                    (!trimmed.is_empty()).then(|| trimmed.to_string())
                };

                // Auto-inject image markdown for generate_image tool results (current run only)
                // so images render in the chat and are persisted in the DB.
                let generated_uris = extract_generated_image_uris(&conversation, &current_run_gen_image_ids);
                for uri in &generated_uris {
                    if !accumulated_commentary.contains(uri) {
                        accumulated_commentary.push_str(&format!("\n\n![Generated Image]({})\n\n", uri));
                    }
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
                        metadata: None,
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
                    message_id: assistant_message_id.clone(),
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
                    final_answer,
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

            let mut had_error = false;
            let mut had_success = false;
            for (tool_call, result) in tool_calls.iter().zip(results.iter()) {
                if result.is_error {
                    had_error = true;
                    tracing::warn!("Tool '{}' error: {}", tool_call.name, result.content);
                } else {
                    had_success = true;
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
                // P0 IPI defence: wrap every tool result in a bounded
                // `<tool_result source="...">` envelope with a system
                // reminder. The wrapper makes the provenance explicit
                // and caps the per-call payload so a hostile tool source
                // cannot flood the context. `content_str` is still used
                // below for the audit metadata summary.
                let safe_content = crate::agent::prompt_safety::wrap_tool_result(
                    &tool_call.name,
                    &content_str,
                );
                conversation.push(ChatMessage {
                    role: "tool".to_string(),
                    content: safe_content,
                    reasoning_details: None,
                    images: None,
                    tool_calls: None,
                    tool_call_id: Some(result.tool_call_id.clone()),
                });

                // Record file mtime for stale-read detection. Reads seed the
                // baseline; writes/edits refresh it so the agent's own
                // mutations never self-trigger a staleness warning next turn.
                if !result.is_error {
                    file_read_tracker.record_file_result(&result.content);
                }

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
                    });
                }
            }

            // ── Stale-read detection ──
            // A file the agent read earlier this run may have changed on disk
            // (external editor, terminal command, or a sibling sub-agent).
            // Warn the model so it re-reads before acting on stale content.
            // `edit_file` already fails safe (exact old_text match), so this
            // guards reasoning/summaries built on the outdated body. A single
            // overwritable slot avoids accumulation across iterations.
            let stale_files = file_read_tracker.detect_stale_reads().await;
            conversation.retain(|m| {
                !(m.role == "system" && m.content.contains("[Stale file warning]"))
            });
            if !stale_files.is_empty() {
                tracing::info!(
                    chat_id = %chat_id,
                    files = ?stale_files,
                    "Detected files changed on disk after being read; nudging re-read"
                );
                conversation.push(ChatMessage {
                    role: "system".to_string(),
                    content: format!(
                        "[Stale file warning] These files changed on disk after you last read them: {}. \
                         Any earlier content you have for them may be outdated. Re-read them with \
                         read_document_content before relying on, editing, or summarizing their contents.",
                        stale_files.join(", ")
                    ),
                    reasoning_details: None,
                    images: None,
                    tool_calls: None,
                    tool_call_id: None,
                });
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
