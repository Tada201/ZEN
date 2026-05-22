use crate::agent::event_bus::{
    AgentEvent, ChatChunkPayload, ChatStatusPayload, ChatErrorPayload, ChatDonePayload,
    ToolStartPayload, ToolCompletePayload, AgentHandoffPayload, AgentSpawnPayload, AgentCompletePayload,
};
use crate::db::queries;
use std::sync::Arc;
use anyhow::{Result, Context};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};
use crate::llm::LlmProvider;
use crate::agent::types::*;
use crate::agent::tools::ToolRegistry;
use crate::agent::hooks::{HookRegistry, HookDecision};
use crate::tools::permission::PermissionDecision;
use crate::tools::GlobalToolRegistry;
use crate::tools::manager::ToolManager;
use crate::db::models::ChatMessage;
use crate::agent::cache::ToolCache;
use std::collections::{HashMap, HashSet};
use tokio_util::sync::CancellationToken;
use sha2::{Sha256, Digest};
use super::config::{RunConfig, ContextTracker};
use super::helpers::{
    estimate_tokens, estimate_conversation_tokens,
    parse_file_changes, is_tool_capability_error,
    compact_conversation, compact_conversation_token_aware,
    generate_handoff_summary, execute_single_tool,
    parse_text_tool_calls, try_parse_tool_json,
};
use super::actions::{persist_and_emit_action, emit_action_only};
use crate::agent::middleware::{EnrichmentContext, MiddlewareChain};

/// Maximum recursion depth for sub-agent spawning (prevents infinite loops)
pub const MAX_SPAWN_DEPTH: u32 = 3;

pub struct Runner {
    pub(super) app: AppHandle,
    pub(super) tool_registry: Arc<tokio::sync::RwLock<ToolRegistry>>,
    pub(super) agent_registry: Arc<AgentRegistry>,
    pub(super) hook_registry: Arc<HookRegistry>,
    pub(super) permissions: GlobalToolRegistry,
    pub(super) tool_manager: Arc<ToolManager>,
    pub(super) config: RunConfig,
    pub(super) db_pool: Option<SqlitePool>,
    pub depth: u32,
    pub(super) cache: Arc<tokio::sync::Mutex<ToolCache>>,
    pub(super) allowed_tools: Arc<tokio::sync::Mutex<HashSet<String>>>,
    pub(super) on_event: Option<tauri::ipc::Channel<serde_json::Value>>,
}

impl Runner {
    pub fn new(
        app: AppHandle,
        tool_registry: Arc<tokio::sync::RwLock<ToolRegistry>>,
        agent_registry: Arc<AgentRegistry>,
        hook_registry: Arc<HookRegistry>,
        permissions: GlobalToolRegistry,
        tool_manager: Arc<ToolManager>,
    ) -> Self {
        Self {
            app,
            tool_registry,
            agent_registry,
            hook_registry,
            permissions,
            tool_manager,
            config: RunConfig::default(),
            db_pool: None,
            depth: 0,
            cache: Arc::new(tokio::sync::Mutex::new(ToolCache::new(300))), // 5 min default TTL
            allowed_tools: Arc::new(tokio::sync::Mutex::new(HashSet::new())),
            on_event: None,
        }
    }

    /// Set a direct IPC channel for high-performance event streaming
    pub fn with_channel(mut self, channel: tauri::ipc::Channel<serde_json::Value>) -> Self {
        self.on_event = Some(channel);
        self
    }

    pub fn with_db_pool(mut self, db_pool: SqlitePool) -> Self {
        self.db_pool = Some(db_pool);
        self
    }

    pub fn with_parallel_tools(mut self, parallel: bool) -> Self {
        self.config.parallel_tools = parallel;
        self
    }

    pub fn with_tools_enabled(mut self, enabled: bool) -> Self {
        self.config.tools_enabled = enabled;
        self
    }

    pub fn with_memory_scope(self, _scope: String) -> Self {
        // Memory scope - retained for future session memory features
        self
    }

    pub fn with_depth(mut self, depth: u32) -> Self {
        self.depth = depth;
        self
    }

    pub fn with_max_iterations(mut self, max_iterations: usize) -> Self {
        self.config.max_iterations = max_iterations;
        self
    }

    pub fn with_allowed_tools(mut self, allowed_tools: Arc<tokio::sync::Mutex<HashSet<String>>>) -> Self {
        self.allowed_tools = allowed_tools;
        self
    }

    /// Emit an event via direct channel or fallback to global app emit
    pub(super) fn emit(&self, event: AgentEvent) {
        event.emit_via(&self.app, &self.on_event);
    }

    /// Create a child runner with bounded iterations (for sub-agent spawning).
    pub fn child(&self, max_iterations: usize) -> Self {
        Self {
            app: self.app.clone(),
            tool_registry: self.tool_registry.clone(),
            agent_registry: self.agent_registry.clone(),
            hook_registry: self.hook_registry.clone(),
            permissions: self.permissions.clone(),
            tool_manager: self.tool_manager.clone(),
            config: RunConfig {
                max_iterations,
                ..self.config.clone()
            },
            db_pool: self.db_pool.clone(),
            depth: self.depth + 1,
            cache: self.cache.clone(), // Share cache across parent and child agents
            allowed_tools: self.allowed_tools.clone(), // Share allowed tools across tree
            on_event: self.on_event.clone(),
        }
    }

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
        let mut run_config = self.config.clone();
        let mut semantic_recall_enabled = true;
        let mut max_recalled_messages = 5;
        let mut drift_detection_enabled = true;
        let mut summarization_enabled = true;

        // ── Fix #2: Parallel memory settings load (was 6 sequential queries) ──
        if let Some(ref db) = self.db_pool {
            let (
                r_summ_enabled,
                r_summ_model,
                r_recall_enabled,
                r_recall_max,
                r_drift_enabled,
                r_drift_threshold,
            ) = tokio::join!(
                queries::get_setting(db, "memory.summarization_enabled"),
                queries::get_setting(db, "memory.summarization_model"),
                queries::get_setting(db, "memory.semantic_recall_enabled"),
                queries::get_setting(db, "memory.max_recalled_messages"),
                queries::get_setting(db, "memory.drift_detection_enabled"),
                queries::get_setting(db, "memory.drift_threshold"),
            );
            if let Ok(Some(val)) = r_summ_enabled    { summarization_enabled = val != "false"; }
            if let Ok(Some(val)) = r_summ_model       { run_config.summarization_model = if val.is_empty() { None } else { Some(val) }; }
            if let Ok(Some(val)) = r_recall_enabled   { semantic_recall_enabled = val != "false"; }
            if let Ok(Some(val)) = r_recall_max        { if let Ok(p) = val.parse::<usize>() { max_recalled_messages = p; } }
            if let Ok(Some(val)) = r_drift_enabled    { drift_detection_enabled = val != "false"; }
            if let Ok(Some(val)) = r_drift_threshold  { if let Ok(p) = val.parse::<f32>() { run_config.drift_threshold = p; } }
        }

        // ── Fix #3: Skip duplicate DB fetch – chat.rs already loaded fresh messages ──
        // The runner trusts the passed-in `messages` slice; only falls back to a DB
        // fetch when the slice is empty (e.g. orchestrator path) or no DB is available.
        let mut conversation = if messages.is_empty() {
            if let Some(ref db) = self.db_pool {
                match queries::get_active_messages(db, &chat_id).await {
                    Ok(db_msgs) if !db_msgs.is_empty() => {
                        db_msgs.into_iter().map(|m| ChatMessage {
                            role: m.role,
                            content: m.content,
                            images: None,
                            tool_calls: m.tool_calls.and_then(|tc_str| serde_json::from_str(&tc_str).ok()),
                            tool_call_id: m.tool_call_id,
                        }).collect()
                    }
                    _ => messages,
                }
            } else {
                messages
            }
        } else {
            messages
        };

        // ── Fix #1: Pre-load cached recall from previous turn (zero-cost) ──
        // The heavy embedding work runs in a background task AFTER the LLM responds.
        // On the first message of a new chat the cache is empty – the recall block is simply absent.
        let mut cached_recall_context: Option<String> =
            if semantic_recall_enabled {
                if let Some(state) = self.app.try_state::<crate::commands::AppState>() {
                    let guard = state.recall_cache.lock().await;
                    // Reuse the previous-turn recall block regardless of the new user text;
                    // it will be refreshed in the background after this response.
                    guard.get(&chat_id).map(|(block, _)| block.clone())
                } else {
                    None
                }
            } else {
                None
            };
        // Suppress the old per-loop cache variables – recall is now injected once at iteration start
        let mut cached_recall_user_msg: Option<String> = None;
        // context_tracker still needs its first-msg vector for drift; but we no longer block on it.
        // We'll skip the blocker and just initialise to None (drift check is best-effort).
        let mut context_tracker: Option<ContextTracker> = None;
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

        // ── P1: Check if provider supports structured tool calling ──
        let tools_supported = provider.supports_tools(&model);

        loop {
            // Yield to the executor to prevent thread starvation during tight loops
            tokio::task::yield_now().await;

            if token.is_cancelled() {
                tracing::info!(chat_id = %chat_id, "Agent loop cancelled by client");

                // Save partial content to database if available
                if let Some(ref db) = self.db_pool {
                    // Try to find the most recent content from conversation or response
                    let partial_text = if !accumulated_commentary.is_empty() {
                        accumulated_commentary.clone()
                    } else {
                        conversation.last()
                            .filter(|m| m.role == "assistant")
                            .map(|m| m.content.clone())
                            .unwrap_or_else(|| "Agent run cancelled.".to_string())
                    };

                    let save_res = if let Some(ref msg_id) = assistant_message_id {
                        queries::update_message(
                            db,
                            msg_id,
                            &chat_id,
                            &partial_text,
                            false, // is_complete = false
                            Some(total_tokens_in),
                            Some(total_tokens_out),
                            None,
                        ).await
                    } else {
                        queries::add_message(
                            db,
                            &chat_id,
                            None,
                            "assistant",
                            &partial_text,
                            Some(&model),
                            false, // is_complete = false
                            None,
                            None,
                            None,
                            None,
                            Some(total_tokens_in),
                            Some(total_tokens_out),
                            None,
                            None,
                        ).await.map(|msg| {
                            assistant_message_id = Some(msg.id);
                        })
                    };

                    if let Err(e) = save_res {
                        tracing::error!("Failed to save partial assistant message to SQLite: {:?}", e);
                    } else {
                        message_persisted = true;
                    }
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
                tracing::warn!("Agent loop reached max iterations ({})", run_config.max_iterations);
                let final_msg = format!("Completed {} steps. Here's what I found so far based on the tools I used.", run_config.max_iterations);
                
                // Emit chunk for UI awareness
                self.emit(AgentEvent::ChatChunk(ChatChunkPayload {
                    chat_id: chat_id.clone(),
                    delta: final_msg.clone(),
                    r#type: "text".to_string(),
                    done: false,
                }));

                if !accumulated_commentary.is_empty() {
                    accumulated_commentary.push('\n');
                }
                accumulated_commentary.push_str(&final_msg);

                // Save max iterations reached assistant response to SQLite database
                if let Some(ref db) = self.db_pool {
                    let save_res = if let Some(ref msg_id) = assistant_message_id {
                        queries::update_message(
                            db,
                            msg_id,
                            &chat_id,
                            &accumulated_commentary,
                            true, // is_complete = true
                            Some(total_tokens_in),
                            Some(total_tokens_out),
                            None,
                        ).await
                    } else {
                        queries::add_message(
                            db,
                            &chat_id,
                            None,
                            "assistant",
                            &accumulated_commentary,
                            Some(&model),
                            true, // is_complete = true
                            None,
                            None,
                            None,
                            None,
                            Some(total_tokens_in),
                            Some(total_tokens_out),
                            None,
                            None,
                        ).await.map(|msg| {
                            assistant_message_id = Some(msg.id);
                        })
                    };

                    if let Err(e) = save_res {
                        tracing::error!("Failed to save max iterations assistant message to SQLite: {:?}", e);
                    } else {
                        message_persisted = true;
                    }
                }

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
                    self.trigger_background_compaction(&chat_id, &model, run_config.summarization_model.clone());
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
            }));

            // ── Context compaction (token-aware, fixes #23) ──
            let current_tokens = estimate_conversation_tokens(&conversation);
            if current_tokens > run_config.max_context_tokens {
                // Aggressive compaction when approaching hard limit
                tracing::warn!("Context at {} tokens – aggressive compaction", current_tokens);
                compact_conversation_token_aware(&mut conversation, 8, run_config.max_context_tokens / 2);
            } else if summarization_enabled && (current_tokens > run_config.compaction_token_threshold || conversation.len() > run_config.compaction_threshold) {
                // Gentle compaction
                compact_conversation(&mut conversation, 10);
            }

            // ── Build authorized tools for current agent ──
            // If tools are globally disabled, present an empty tool list so the LLM
            // receives no tool definitions and cannot call any tools.
            // With the meta-tool pattern, we inject only 3 meta-tools (tool_list,
            // tool_info, tool_exec) instead of all individual tool schemas.
            // The LLM discovers tools dynamically via tool_list / tool_info.
            let authorized_tool_ids: Vec<String> = if run_config.tools_enabled {
                self.tool_registry.read().await.list()
                    .into_iter()
                    .filter(|t| current_agent.tool_ids.contains(&t.id().to_string()))
                    .map(|t| t.id().to_string())
                    .collect()
            } else {
                Vec::new()
            };

            let meta_tools: Vec<crate::tools::ToolInfo> = if run_config.tools_enabled {
                crate::tools::manager::meta_tool_definitions()
            } else {
                Vec::new()
            };

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

            let chain = MiddlewareChain::default_chain(
                app_inner.clone(),
                self.db_pool.clone(),
            );
            chain.enrich_all(&mut enrich_ctx).await?;

            let system_content = enrich_ctx.system_content;

            let mut full_context = vec![ChatMessage {
                role: "system".to_string(),
                content: system_content.clone(),
                images: None,
                tool_calls: None,
                tool_call_id: None,
            }];

            // Inject extra system messages from middleware (e.g. summaries)
            for msg in enrich_ctx.extra_system_messages {
                full_context.push(ChatMessage {
                    role: "system".to_string(),
                    content: msg,
                    images: None,
                    tool_calls: None,
                    tool_call_id: None,
                });
            }

            if let Some(ref db) = self.db_pool {
                // Cold: previous session summaries
                if let Ok(prev_summaries) = queries::get_previous_summaries(db, &chat_id).await {
                    for summary in prev_summaries {
                        full_context.push(ChatMessage {
                            role: "system".to_string(),
                            content: format!("[Previous conversation summary]: {}", summary.summary),
                            images: None,
                            tool_calls: None,
                            tool_call_id: None,
                        });
                    }
                }

                // Warm: current session summary (if compacted)
                if let Ok(Some(current_summary)) = queries::get_current_summary(db, &chat_id).await {
                    full_context.push(ChatMessage {
                        role: "system".to_string(),
                        content: format!("[Current conversation summary]: {}", current_summary.summary),
                        images: None,
                        tool_calls: None,
                        tool_call_id: None,
                    });
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

            // Auto-escalation: try current model, fallback to cloud if local fails
            let response = match self.call_llm_with_escalation(
                provider,
                &model,
                full_context.clone(),
                tools_arg.clone(),
                config.clone(),
                token.clone(),
                &app_inner,
                &chat_id_inner,
                &mut assistant_message_id,
                None,
            ).await {
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

            // Collect structured tool calls from the provider
            let mut raw_calls: Vec<crate::db::models::ToolCall> = Vec::new();
            if let Some(tc_list) = response.tool_calls {
                raw_calls.extend(tc_list);
            }

            // P1: If no structured calls, try to extract text-mode JSON tool blocks
            // from the response content (for models that don't support structured tools).
            if raw_calls.is_empty() && !tools_supported && !response.content.is_empty() {
                if let Some(parsed) = parse_text_tool_calls(&response.content) {
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
                        tc.name, count
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
                let response_seems_empty = response.content.trim().len() < 100;
                let response_is_non_answer = {
                    let lower = response.content.to_lowercase();
                    lower.contains("let me") || lower.contains("i'll check")
                    || lower.contains("i will") || lower.contains("searching")
                    || lower.contains("looking into") || lower.contains("i found some")
                    || (lower.contains("i don't") && lower.contains("information"))
                    || (lower.contains("i cannot") && lower.contains("find"))
                };
                if just_received_tool_results && (response_seems_empty || response_is_non_answer) {
                    tracing::info!("Model gave non-substantive response after tool results ({} chars) – nudging to use data", response.content.trim().len());

                    // Collect a brief summary of what tool data is available
                    let tool_data_hint: String = conversation.iter().rev()
                        .filter(|m| m.role == "tool")
                        .take(3)
                        .map(|m| m.content.chars().take(120).collect::<String>())
                        .collect::<Vec<_>>()
                        .join("; ");

                    conversation.push(ChatMessage {
                        role: "assistant".to_string(),
                        content: response.content.clone(),
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
                        images: None,
                        tool_calls: None,
                        tool_call_id: None,
                    });
                    just_received_tool_results = false;
                    continue; // Re-run the LLM with the nudge
                }

                if !response.content.trim().is_empty() {
                    if !accumulated_commentary.is_empty() {
                        accumulated_commentary.push('\n');
                    }
                    accumulated_commentary.push_str(&response.content);
                }

                // Save final completed assistant response to SQLite database
                if let Some(ref db) = self.db_pool {
                    let save_res = if let Some(ref msg_id) = assistant_message_id {
                        queries::update_message(
                            db,
                            msg_id,
                            &chat_id,
                            &accumulated_commentary,
                            true, // is_complete = true
                            Some(total_tokens_in),
                            Some(total_tokens_out),
                            None,
                        ).await
                    } else {
                        queries::add_message(
                            db,
                            &chat_id,
                            None,
                            "assistant",
                            &accumulated_commentary,
                            Some(&model),
                            true, // is_complete = true
                            None,
                            None,
                            None,
                            None,
                            Some(total_tokens_in),
                            Some(total_tokens_out),
                            None,
                            None,
                        ).await.map(|msg| {
                            assistant_message_id = Some(msg.id);
                        })
                    };
                    if let Err(e) = save_res {
                        tracing::error!("Failed to save final assistant message to SQLite: {:?}", e);
                    } else {
                        message_persisted = true;
                    }
                }

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
                    self.trigger_background_compaction(&chat_id, &model, run_config.summarization_model.clone());
                }
                self.trigger_background_embedding(&chat_id);
                // ── Fix #1: Refresh recall cache for the NEXT turn (background) ──
                self.trigger_background_recall_cache(&chat_id, max_recalled_messages, semantic_recall_enabled);

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
            let models_tool_calls: Vec<crate::db::models::ToolCall> = tool_calls.iter().map(|tc| {
                crate::db::models::ToolCall {
                    id: tc.id.clone(),
                    name: tc.name.clone(),
                    args: tc.args.clone(),
                }
            }).collect();

            // ── Emit intermediate commentary to the user ──
            // If the LLM produced text alongside tool calls, it was already streamed via callback.
            // We just need to ensure it's saved correctly if DB is enabled.
            if !response.content.trim().is_empty() {
                tracing::info!("Recording intermediate commentary: {}...", &response.content[..response.content.len().min(80)]);
                if !accumulated_commentary.is_empty() {
                    accumulated_commentary.push('\n');
                }
                accumulated_commentary.push_str(&response.content);
            }

            let serialized_tool_calls = if !models_tool_calls.is_empty() {
                Some(serde_json::to_string(&models_tool_calls).unwrap_or_default())
            } else {
                None
            };

            // Save intermediate commentary & tool calls to DB (fixes #22)
            if let Some(ref db) = self.db_pool {
                // Use is_complete = false for intermediate turn commentary
                let save_res = if let Some(ref msg_id) = assistant_message_id {
                    queries::update_message(
                        db,
                        msg_id,
                        &chat_id,
                        &accumulated_commentary,
                        false, // is_complete = false
                        None,
                        None,
                        serialized_tool_calls.as_deref(),
                    ).await
                } else {
                    queries::add_message(
                        db,
                        &chat_id,
                        None,
                        "assistant",
                        &accumulated_commentary,
                        Some(&model),
                        false, // is_complete = false
                        serialized_tool_calls.as_deref(),
                        None,
                        None,
                        None,
                        None,
                        None,
                        None,  // kind
                        None,  // metadata
                    ).await.map(|msg| {
                        assistant_message_id = Some(msg.id);
                    })
                };
                if save_res.is_ok() {
                    message_persisted = true;
                }
            }

            conversation.push(ChatMessage {
                role: "assistant".to_string(),
                content: response.content.clone(),
                images: None,
                tool_calls: Some(models_tool_calls),
                tool_call_id: None,
            });

            // Emit tool:start event for UI tracking
            for tool_call in &tool_calls {
                self.emit(AgentEvent::ToolStart(ToolStartPayload {
                    tool_name: tool_call.name.clone(),
                    tool_call_id: tool_call.id.clone(),
                    arguments: tool_call.args.clone(),
                    agent_id: current_agent.id.clone(),
                    agent_name: current_agent.name.clone(),
                    chat_id: chat_id.clone(),
                    iteration,
                }));
            }

            let results = self.execute_tools_with_hooks(
                &tool_calls,
                &chat_id,
                iteration,
                &current_agent.id,
                &current_agent.name,
                &authorized_tool_ids,
                token.clone(),
            ).await;

            // Emit tool:complete event for UI tracking
            for (tool_call, result) in tool_calls.iter().zip(results.iter()) {
                let content_str = match &result.content {
                    serde_json::Value::String(s) => s.clone(),
                    serde_json::Value::Object(obj) => {
                        if let Some(formatted_result) = obj.get("result") {
                            match formatted_result {
                                serde_json::Value::String(s) => s.clone(),
                                _ => formatted_result.to_string(),
                            }
                        } else if let Some(error) = obj.get("error") {
                            format!("Error: {}", error)
                        } else {
                            result.content.to_string()
                        }
                    }
                    _ => result.content.to_string(),
                };
                self.emit(AgentEvent::ToolComplete(ToolCompletePayload {
                    tool_name: tool_call.name.clone(),
                    tool_call_id: tool_call.id.clone(),
                    agent_id: current_agent.id.clone(),
                    agent_name: current_agent.name.clone(),
                    chat_id: chat_id.clone(),
                    duration_ms: result.duration_ms,
                    status: if result.is_error { "error".to_string() } else { "success".to_string() },
                    iteration,
                    output: Some(content_str),
                }));
            }

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
                    if let Some(target_id) = result.content.get("target_agent_id").and_then(|v| v.as_str()) {
                        if let Some(next_agent) = self.agent_registry.get(target_id) {
                            tracing::info!("HANDOFF: {} → {}", current_agent.id, next_agent.id);

                            // Emit chat:status for general status updates
                            let _ = self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
                                message: format!("Transferring to {}", next_agent.name),
                                chat_id: chat_id.clone(),
                                iteration: Some(iteration),
                            }));


                            // Phase 3.4: Generate handoff summary (context compression)
                            let handoff_summary = generate_handoff_summary(
                                &conversation,
                                &current_agent.name,
                                &tool_call.args,
                            );

                            // Emit structured handoff action with summary
                            let handoff_reason = tool_call.args.get("reason")
                                .and_then(|v| v.as_str())
                                .unwrap_or("Specialized expertise required")
                                .to_string();

                            let handoff_meta = HandoffMeta {
                                from_agent: current_agent.id.clone(),
                                to_agent: next_agent.id.clone(),
                                reason: format!("{} | Summary: {}", handoff_reason, handoff_summary),
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
                                let _ = persist_and_emit_action(
                                    &self.app,
                                    db,
                                    &chat_id,
                                    None,
                                    MessageKind::AgentHandoff,
                                    format!("{} handing off to {}", current_agent.name, next_agent.name),
                                    action_meta,
                                    None,
                                    None,
                                    &self.on_event,
                                ).await;
                            } else {
                                let _ = emit_action_only(
                                    &self.app,
                                    &chat_id,
                                    None,
                                    MessageKind::AgentHandoff,
                                    format!("{} handing off to {}", current_agent.name, next_agent.name),
                                    action_meta,
                                    &self.on_event,
                                );
                            }
                            
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
                    images: None,
                    tool_calls: None,
                    tool_call_id: Some(result.tool_call_id.clone()),
                });

                // Emit structured tool_result action (Phase 1.4)
                // Check if this is a file operation with diff data
                let files = parse_file_changes(&result.content);

                let tool_result_meta = ToolResultMeta {
                    tool_name: tool_call.name.clone(),
                    status: if result.is_error { "error".to_string() } else { "ok".to_string() },
                    duration_ms: result.duration_ms,
                    content_summary: content_str.chars().take(200).collect(),
                    args: tool_call.args.clone(), // P1: Added args for result preview
                    files,
                    raw_result: Some(result.content.clone()),
                };

                let action_meta = ActionMeta {
                    agent_id: current_agent.id.clone(),
                    agent_name: current_agent.name.clone(),
                    iteration,
                    depth: self.depth,
                    progress_percent: None,
                    tool_call: Some(ToolCallMeta { // P1: Populate tool_call for correlation
                        tool_name: tool_call.name.clone(),
                        args: tool_call.args.clone(),
                        status: if result.is_error { "failed".to_string() } else { "completed".to_string() },
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
                    let _ = persist_and_emit_action(
                        &self.app,
                        db,
                        &chat_id,
                        None,
                        MessageKind::ToolResult,
                        result_content,
                        action_meta,
                        Some("tool"),
                        Some(result.tool_call_id.clone()),
                        &self.on_event,
                    ).await;
                } else {
                    let _ = emit_action_only(
                        &self.app,
                        &chat_id,
                        None,
                        MessageKind::ToolResult,
                        result_content,
                        action_meta,
                        &self.on_event,
                    );
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
                let latest_data: String = conversation.iter().rev()
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
                        !(m.role == "system" && m.content.contains("Multiple tool calls have failed"))
                    });
                    conversation.push(ChatMessage {
                        role: "system".to_string(),
                        content: "Multiple tool calls have failed. Consider: \
                                  1) Using a different tool or approach. \
                                  2) Providing a partial answer based on data already gathered. \
                                  3) Explaining what you tried and what failed."
                            .to_string(),
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
