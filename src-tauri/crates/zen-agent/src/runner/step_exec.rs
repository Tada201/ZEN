//! Step-execution handlers extracted from the runner turn loop.
//!
//! Split out of the former single `loop.rs` during BIG_MIGRATION.md Phase
//! 11. Each handler is a private `Runner` method covering one contiguous
//! region of the old `run()` body — exit paths (cancellation,
//! max-iterations, token budget, no-tool-calls), the one-time skill preload,
//! tool-result persistence, and the post-tool nudges. Bodies were moved
//! verbatim; only borrow adaptation (`&mut` derefs, `to_string` for moved
//! `String`s) and the explicit `Nudge`/`Final` outcome enum differ.

use super::actions::{
    emit_action_only, persist_and_emit_action, ActionEmitParams, ActionPersistParams,
};
use super::helpers::{parse_file_changes, FileReadTracker};
use super::lifecycle::Runner;
use super::turn_persistence::{save_assistant_message, AssistantMessageSave};
use crate::event_bus::{AgentEvent, ChatChunkPayload, ChatDonePayload};
use crate::skills as skills_mod;
use crate::types::*;
use zen_db::models::{ChatMessage, ChatResponse};
use tokio_util::sync::CancellationToken;

/// Outcome of the no-tool-calls branch: a nudge message was injected (loop
/// again with the enriched conversation) or the run produced its final
/// response.
pub(super) enum NoToolCallsOutcome {
    Nudge,
    Final(AgentResponse),
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
        .filter(|m| {
            m.role == "tool"
                && m.tool_call_id
                    .as_deref()
                    .is_some_and(|id| current_run_ids.contains(id))
        })
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
    /// C6: preload skill bodies ONCE before the loop.
    ///
    /// The skill mention resolver needs to load SKILL.md bodies from
    /// disk. Doing this on every iteration is the dominant per-iter
    /// cost for chats that mention skills (it's a tokio::fs round
    /// trip + serde metadata lookup per mention per iter). The
    /// latest user message is stable across iterations in the common
    /// case, so we resolve mentions once and replay the fragments
    /// from a Vec. A Vec (insertion-ordered) is chosen over a
    /// HashMap so the prompt sees the SAME skill order across
    /// iterations of the same run — HashMap iteration order is
    /// unspecified and would otherwise flip the fragments between
    /// iterations of the same run, producing non-deterministic
    /// context the model sees. The skill name lives inside
    /// `SkillInstructionsFragment` already, so a tuple
    /// `(String, …)` would double-store it; dedupe is owned by `seen`.
    ///
    /// Returns the fragments plus the chat's canonical workspace root,
    /// which the middleware chain re-uses below.
    pub(super) async fn preload_skill_fragments(
        &self,
        chat_id: &str,
        conversation: &[ChatMessage],
    ) -> (
        Vec<crate::skills::SkillInstructionsFragment>,
        Option<std::path::PathBuf>,
    ) {
        let mut preloaded_skill_fragments: Vec<crate::skills::SkillInstructionsFragment> =
            Vec::new();
        // Skill discovery resolves against the chat's captured workspace
        // root, not the process cwd — the app's cwd is the install dir.
        let chat_workspace_root: Option<std::path::PathBuf> = match self.db_pool.as_ref() {
            Some(db) => zen_db::queries::get_chat(db, chat_id)
                .await
                .ok()
                .and_then(|chat| chat.workspace_root)
                .and_then(|root| {
                    crate::utils::canonicalize_workspace_root(std::path::Path::new(&root)).ok()
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
                    let mentions =
                        skills_mod::extract_skill_mentions(&latest.content, &outcome.skills);
                    for m in mentions {
                        if !seen.insert(m.name.clone()) {
                            continue;
                        }
                        if let Some(skill) = outcome.find_by_name(&m.name) {
                            if let Ok(body) = tokio::fs::read_to_string(&skill.path).await {
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
        (preloaded_skill_fragments, chat_workspace_root)
    }

    /// Cancellation exit: persist the partial assistant message, fire the
    /// background embedding refresh, and emit the event that unlocks the UI.
    #[allow(clippy::too_many_arguments)]
    pub(super) async fn handle_cancellation(
        &self,
        chat_id: &str,
        model: &str,
        conversation: &[ChatMessage],
        accumulated_commentary: &str,
        assistant_message_id: &mut Option<String>,
        total_tokens_in: i64,
        total_tokens_out: i64,
        message_persisted: &mut bool,
    ) -> AgentResponse {
        tracing::info!(chat_id = %chat_id, "Agent loop cancelled by client");

        // Save partial content to database if available
        if let Some(ref db) = self.db_pool {
            let partial_text = if !accumulated_commentary.is_empty() {
                accumulated_commentary.to_string()
            } else {
                conversation
                    .last()
                    .filter(|m| m.role == "assistant")
                    .map(|m| m.content.clone())
                    .unwrap_or_else(|| "Agent run cancelled.".to_string())
            };

            *message_persisted |= save_assistant_message(AssistantMessageSave {
                db,
                chat_id,
                model,
                message_id: assistant_message_id,
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

        self.trigger_background_embedding(chat_id);

        // Emit completion event to unlock the chat UI
        self.emit(AgentEvent::ChatDone(ChatDonePayload {
            chat_id: chat_id.to_string(),
            content: Some("Agent run cancelled.".to_string()),
            tokens_in: total_tokens_in,
            tokens_out: total_tokens_out,
            reason: "cancelled".to_string(),
            done: true,
            message_id: assistant_message_id.clone(),
        }));
        AgentResponse {
            content: Some("Agent run cancelled.".to_string()),
            final_answer: None,
            tool_calls: vec![],
            reasoning: None,
            handoff: None,
            tokens_in: Some(total_tokens_in),
            tokens_out: Some(total_tokens_out),
            message_persisted: *message_persisted,
        }
    }

    /// Max-iterations exit: cap the run, surface a summary chunk, persist
    /// the partial answer, and hand off to the voice display agent.
    #[allow(clippy::too_many_arguments)]
    pub(super) async fn handle_max_iterations(
        &self,
        chat_id: &str,
        model: &str,
        max_iterations: usize,
        summarization_enabled: bool,
        summarization_model: Option<String>,
        voice_user_request: &str,
        token: &CancellationToken,
        conversation: &[ChatMessage],
        current_run_gen_image_ids: &std::collections::HashSet<String>,
        accumulated_commentary: &mut String,
        assistant_message_id: &mut Option<String>,
        message_persisted: &mut bool,
        total_tokens_in: i64,
        total_tokens_out: i64,
    ) -> AgentResponse {
        tracing::warn!("Agent loop reached max iterations ({})", max_iterations);
        let final_msg = format!(
            "Completed {} steps. Here's what I found so far based on the tools I used.",
            max_iterations
        );

        // Emit chunk for UI awareness
        self.emit(AgentEvent::ChatChunk(ChatChunkPayload {
            chat_id: chat_id.to_string(),
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
        let generated_uris = extract_generated_image_uris(conversation, current_run_gen_image_ids);
        for uri in &generated_uris {
            if !accumulated_commentary.contains(uri) {
                accumulated_commentary.push_str(&format!("\n\n![Generated Image]({})\n\n", uri));
            }
        }

        // Save max iterations reached assistant response to SQLite database
        if let Some(ref db) = self.db_pool {
            *message_persisted |= save_assistant_message(AssistantMessageSave {
                db,
                chat_id,
                model,
                message_id: assistant_message_id,
                content: accumulated_commentary,
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
            chat_id,
            model,
            voice_user_request,
            accumulated_commentary,
            &voice_display_tool_evidence(conversation),
            token.child_token(),
        );

        // Emit completion event to unlock the chat UI
        self.emit(AgentEvent::ChatDone(ChatDonePayload {
            chat_id: chat_id.to_string(),
            content: Some(accumulated_commentary.clone()),
            tokens_in: total_tokens_in,
            tokens_out: total_tokens_out,
            reason: "max_iterations".to_string(),
            done: true,
            message_id: assistant_message_id.clone(),
        }));
        if summarization_enabled {
            self.trigger_background_compaction(chat_id, model, summarization_model.clone());
        }
        self.trigger_background_embedding(chat_id);
        AgentResponse {
            content: Some(accumulated_commentary.clone()),
            final_answer: None,
            tool_calls: vec![],
            reasoning: None,
            handoff: None,
            tokens_in: Some(total_tokens_in),
            tokens_out: Some(total_tokens_out),
            message_persisted: *message_persisted,
        }
    }

    /// Token-budget exit: stop with the information gathered so far.
    #[allow(clippy::too_many_arguments)]
    pub(super) async fn handle_token_budget_exceeded(
        &self,
        chat_id: &str,
        model: &str,
        budget: usize,
        total: i64,
        summarization_enabled: bool,
        summarization_model: Option<String>,
        accumulated_commentary: &mut String,
        assistant_message_id: &mut Option<String>,
        message_persisted: &mut bool,
        total_tokens_in: i64,
        total_tokens_out: i64,
    ) -> AgentResponse {
        tracing::warn!("Agent loop exceeded token budget ({} > {})", total, budget);
        let final_msg = format!(
                        "Token budget exceeded ({} tokens used > {} budget). Stopping with the information gathered so far.",
                        total, budget
                    );

        self.emit(AgentEvent::ChatChunk(ChatChunkPayload {
            chat_id: chat_id.to_string(),
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
            *message_persisted |= save_assistant_message(AssistantMessageSave {
                db,
                chat_id,
                model,
                message_id: assistant_message_id,
                content: accumulated_commentary,
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
            chat_id: chat_id.to_string(),
            content: Some(accumulated_commentary.clone()),
            tokens_in: total_tokens_in,
            tokens_out: total_tokens_out,
            reason: "token_budget_exceeded".to_string(),
            done: true,
            message_id: assistant_message_id.clone(),
        }));
        if summarization_enabled {
            self.trigger_background_compaction(chat_id, model, summarization_model.clone());
        }
        self.trigger_background_embedding(chat_id);
        AgentResponse {
            content: Some(accumulated_commentary.clone()),
            final_answer: None,
            tool_calls: vec![],
            reasoning: None,
            handoff: None,
            tokens_in: Some(total_tokens_in),
            tokens_out: Some(total_tokens_out),
            message_persisted: *message_persisted,
        }
    }
    /// No-tool-calls branch: nudge the model to use tool data it ignored,
    /// or finalize the run (persist, voice handoff, completion event,
    /// recall cache refresh).
    #[allow(clippy::too_many_arguments)]
    pub(super) async fn handle_no_tool_calls(
        &self,
        chat_id: &str,
        model: &str,
        summarization_enabled: bool,
        summarization_model: Option<String>,
        max_recalled_messages: usize,
        semantic_recall_enabled: bool,
        voice_user_request: &str,
        token: &CancellationToken,
        conversation: &mut Vec<ChatMessage>,
        current_run_gen_image_ids: &std::collections::HashSet<String>,
        response: &ChatResponse,
        visible_response_content: &str,
        just_received_tool_results: &mut bool,
        accumulated_commentary: &mut String,
        assistant_message_id: &mut Option<String>,
        message_persisted: &mut bool,
        total_tokens_in: i64,
        total_tokens_out: i64,
    ) -> NoToolCallsOutcome {
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
        if *just_received_tool_results && (response_seems_empty || response_is_non_answer) {
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
                content: visible_response_content.to_string(),
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
            *just_received_tool_results = false;
            return NoToolCallsOutcome::Nudge; // Re-run the LLM with the nudge
        }

        if !visible_response_content.trim().is_empty() {
            if !accumulated_commentary.is_empty() {
                accumulated_commentary.push('\n');
            }
            accumulated_commentary.push_str(visible_response_content);
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
        let generated_uris = extract_generated_image_uris(conversation, current_run_gen_image_ids);
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
            *message_persisted |= save_assistant_message(AssistantMessageSave {
                db,
                chat_id,
                model,
                message_id: assistant_message_id,
                content: accumulated_commentary,
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
            chat_id,
            model,
            voice_user_request,
            accumulated_commentary,
            &voice_display_tool_evidence(conversation),
            token.child_token(),
        );

        // Emit completion event to unlock the chat UI
        self.emit(AgentEvent::ChatDone(ChatDonePayload {
            chat_id: chat_id.to_string(),
            content: Some(accumulated_commentary.clone()),
            tokens_in: total_tokens_in,
            tokens_out: total_tokens_out,
            reason: "complete".to_string(),
            done: true,
            message_id: assistant_message_id.clone(),
        }));
        if summarization_enabled {
            self.trigger_background_compaction(chat_id, model, summarization_model.clone());
        }
        self.trigger_background_embedding(chat_id);
        // ── Fix #1: Refresh recall cache for the NEXT turn (background) ──
        self.trigger_background_recall_cache(
            chat_id,
            max_recalled_messages,
            semantic_recall_enabled,
        );

        NoToolCallsOutcome::Final(AgentResponse {
            content: Some(accumulated_commentary.clone()),
            final_answer,
            tool_calls: vec![],
            reasoning: None,
            handoff: None,
            tokens_in: Some(total_tokens_in),
            tokens_out: Some(total_tokens_out),
            message_persisted: *message_persisted,
        })
    }

    /// Persist each tool result into the conversation (through the IPI
    /// result envelope), the stale-read tracker, and the action timeline.
    #[allow(clippy::too_many_arguments)]
    pub(super) async fn process_tool_results(
        &self,
        tool_calls: &[ToolCall],
        results: &[ToolResult],
        conversation: &mut Vec<ChatMessage>,
        file_read_tracker: &mut FileReadTracker,
        chat_id: &str,
        iteration: usize,
        current_agent: &Agent,
    ) -> (bool, bool) {
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
            let safe_content =
                crate::prompt_safety::wrap_tool_result(&tool_call.name, &content_str);
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
                    events: self.ctx.events.as_ref(),
                    db_pool: db,
                    chat_id,
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
                    events: self.ctx.events.as_ref(),
                    chat_id,
                    id: None,
                    kind: MessageKind::ToolResult,
                    content: result_content,
                    meta: action_meta,
                });
            }
        }
        (had_error, had_success)
    }

    /// Post-tool turn updates: stale-read warnings, the tool-data nudge,
    /// and consecutive-error recovery hints.
    #[allow(clippy::too_many_arguments)]
    pub(super) async fn post_tool_turn_updates(
        &self,
        conversation: &mut Vec<ChatMessage>,
        chat_id: &str,
        file_read_tracker: &mut FileReadTracker,
        had_success: bool,
        had_error: bool,
        consecutive_errors: &mut usize,
        just_received_tool_results: &mut bool,
    ) {
        // ── Stale-read detection ──
        // A file the agent read earlier this run may have changed on disk
        // (external editor, terminal command, or a sibling sub-agent).
        // Warn the model so it re-reads before acting on stale content.
        // `edit_file` already fails safe (exact old_text match), so this
        // guards reasoning/summaries built on the outdated body. A single
        // overwritable slot avoids accumulation across iterations.
        let stale_files = file_read_tracker.detect_stale_reads().await;
        conversation
            .retain(|m| !(m.role == "system" && m.content.contains("[Stale file warning]")));
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
        *just_received_tool_results = had_success;

        // ── Inject nudge after every successful tool execution (fixes #24) ──
        // Use a single nudge slot that gets overwritten instead of accumulating
        if had_success && !had_error {
            // Remove ALL previous nudge messages (retain ensures no accumulation in edge cases)
            conversation
                .retain(|m| !(m.role == "system" && m.content.contains("Tool execution complete")));

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
            *consecutive_errors += 1;
            if *consecutive_errors >= 3 {
                tracing::warn!("3 consecutive tool errors – injecting recovery hint");
                // Remove ALL previous error nudges
                conversation.retain(|m| {
                    !(m.role == "system" && m.content.contains("Multiple tool calls have failed"))
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
            *consecutive_errors = 0;
        }
    }
}
