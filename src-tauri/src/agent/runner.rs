use crate::agent::event_bus::{
    AgentEvent, ChatChunkPayload, ChatStatusPayload, ChatErrorPayload, ChatDonePayload,
    ToolStartPayload, ToolCompletePayload, AgentHandoffPayload, AgentSpawnPayload, AgentCompletePayload,
};
use crate::db::queries;
use std::sync::Arc;
use anyhow::{Result, Context};
use serde_json::json;
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter, Manager};
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
use tracing::error;

/// Parse file change data from tool result (for write_file, edit_file)
fn parse_file_changes(result: &serde_json::Value) -> Option<Vec<FileChange>> {
    if let Some(obj) = result.as_object() {
        // Check if this looks like a file operation result
        let change_type = obj.get("change_type")?.as_str()?;
        let path = obj.get("file_path")?.as_str()?;

        let lines_added = obj.get("lines_added").and_then(|v| v.as_u64()).map(|n| n as usize);
        let lines_removed = obj.get("lines_removed").and_then(|v| v.as_u64()).map(|n| n as usize);
        let diff = obj.get("diff").and_then(|v| v.as_str()).map(String::from);

        Some(vec![FileChange {
            path: path.to_string(),
            change_type: change_type.to_string(),
            lines_added,
            lines_removed,
            diff,
        }])
    } else {
        None
    }
}

/// Detect whether an error is caused by the model lacking tool-call support.
/// This is provider-specific but covers the most common patterns.
fn is_tool_capability_error(error: &str) -> bool {
    let lower = error.to_lowercase();
    lower.contains("no endpoints found that support tool use")
        || lower.contains("does not support tool use")
        || lower.contains("function calling") && lower.contains("not supported")
        || lower.contains("tools are not supported")
        || lower.contains("tool use is not supported")
        || lower.contains("this model does not support")
        || lower.contains("disable") && lower.contains("web_search")
}

/// Rough estimation: 1 token ≈ 4 chars in English text
fn estimate_tokens(text: &str) -> usize {
    text.len() / 4
}

/// Estimate total tokens in a conversation (simplified heuristic)
fn estimate_conversation_tokens(conversation: &[ChatMessage]) -> usize {
    conversation.iter().map(|m| {
        let content_tokens = estimate_tokens(&m.content);
        let tool_call_tokens = m.tool_calls.as_ref().map(|tc| {
            tc.iter().map(|t| estimate_tokens(&t.args.to_string())).sum::<usize>()
        }).unwrap_or(0);
        content_tokens + tool_call_tokens
    }).sum()
}

/// Configuration for the agent runner loop
pub struct RunConfig {
    /// Maximum number of LLM calls before stopping
    pub max_iterations: usize,
    /// Maximum times the same tool+args signature can repeat before flagging
    pub max_duplicate_calls: usize,
    /// Number of old tool results to compact (replace with summary) when context grows
    pub compaction_threshold: usize,
    /// Token-based compaction trigger (approximate tokens)
    pub compaction_token_threshold: usize,
    /// Maximum context window size (tokens) - proactive compaction before overflow
    pub max_context_tokens: usize,
    /// Whether to execute multiple tools in parallel (fan-out) or sequentially
    pub parallel_tools: bool,
    /// Whether tools are enabled for this run. When false, no tools are passed to the LLM.
    pub tools_enabled: bool,
}

impl Default for RunConfig {
    fn default() -> Self {
        Self {
            max_iterations: 30,
            max_duplicate_calls: 3,
            compaction_threshold: 40,
            compaction_token_threshold: 50000,  // Start compaction at ~50K tokens
            max_context_tokens: 100000,  // Hard limit at ~100K tokens (safe for 128K models)
            parallel_tools: true,
            tools_enabled: true,
        }
    }
}

/// Maximum recursion depth for sub-agent spawning (prevents infinite loops)
pub const MAX_SPAWN_DEPTH: u32 = 3;


pub struct Runner {
    app: AppHandle,
    tool_registry: Arc<tokio::sync::RwLock<ToolRegistry>>,
    agent_registry: Arc<AgentRegistry>,
    hook_registry: Arc<HookRegistry>,
    permissions: GlobalToolRegistry,
    tool_manager: Arc<ToolManager>,
    config: RunConfig,
    db_pool: Option<SqlitePool>,
    pub depth: u32,
    cache: Arc<tokio::sync::Mutex<ToolCache>>,
    allowed_tools: Arc<tokio::sync::Mutex<HashSet<String>>>,
    on_event: Option<tauri::ipc::Channel<serde_json::Value>>,
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
    /// Emit an event via direct channel or fallback to global app emit
    fn emit(&self, event: AgentEvent) {
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
                ..RunConfig::default()
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
        let mut conversation = messages;
        let mut iteration = 0;
        let mut current_agent = agent;
        let mut call_counts: HashMap<String, usize> = HashMap::new();
        let mut consecutive_errors = 0;
        let mut just_received_tool_results = false;
        let mut total_tokens_in: i64 = 0;
        let mut total_tokens_out: i64 = 0;
        let mut message_persisted = false;

        // ── P1: Check if provider supports structured tool calling ──
        let tools_supported = provider.supports_tools(&model);

        loop {
            // Yield to the executor to prevent thread starvation during tight loops
            tokio::task::yield_now().await;

            if token.is_cancelled() {
                tracing::info!(chat_id = %chat_id, "Agent loop cancelled by client");
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
            if iteration > self.config.max_iterations {
                tracing::warn!("Agent loop reached max iterations ({})", self.config.max_iterations);
                let final_msg = format!("Completed {} steps. Here's what I found so far based on the tools I used.", self.config.max_iterations);
                
                // Emit chunk for UI awareness
                self.emit(AgentEvent::ChatChunk(ChatChunkPayload {
                    chat_id: chat_id.clone(),
                    delta: final_msg.clone(),
                    r#type: "text".to_string(),
                    done: false,
                }));

                // Save max iterations reached assistant response to SQLite database
                if let Some(ref db) = self.db_pool {
                    if let Err(e) = queries::add_message(
                        db,
                        &chat_id,
                        None,
                        "assistant",
                        &final_msg,
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
                    ).await {
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
                message: format!("{} — Step {}", current_agent.name, iteration),
                chat_id: chat_id.clone(),
                iteration: Some(iteration),
            }));

            // ── Context compaction (token-aware, fixes #23) ──
            let current_tokens = estimate_conversation_tokens(&conversation);
            if current_tokens > self.config.max_context_tokens {
                // Aggressive compaction when approaching hard limit
                tracing::warn!("Context at {} tokens — aggressive compaction", current_tokens);
                compact_conversation_token_aware(&mut conversation, 8, self.config.max_context_tokens / 2);
            } else if current_tokens > self.config.compaction_token_threshold || conversation.len() > self.config.compaction_threshold {
                // Gentle compaction
                compact_conversation(&mut conversation, 10);
            }

            // ── Build authorized tools for current agent ──
            // If tools are globally disabled, present an empty tool list so the LLM
            // receives no tool definitions and cannot call any tools.
            // With the meta-tool pattern, we inject only 3 meta-tools (tool_list,
            // tool_info, tool_exec) instead of all individual tool schemas.
            // The LLM discovers tools dynamically via tool_list / tool_info.
            let authorized_tool_ids: Vec<String> = if self.config.tools_enabled {
                self.tool_registry.read().await.list()
                    .into_iter()
                    .filter(|t| current_agent.tool_ids.contains(&t.id().to_string()))
                    .map(|t| t.id().to_string())
                    .collect()
            } else {
                Vec::new()
            };

            let meta_tools: Vec<crate::tools::ToolInfo> = if self.config.tools_enabled {
                crate::tools::manager::meta_tool_definitions()
            } else {
                Vec::new()
            };

            // ── Build system prompt (P1: inject tool text when unsupported) ──
            let mut system_content = current_agent.instructions.clone();

            // Inject current time directly so LLM doesn't need to call get_current_time tool
            let now = chrono::Local::now();
            let time_block = format!(
                "\n\n## Current Date & Time\n{}\nTimezone: {:?}\nUnix timestamp: {}",
                now.format("%Y-%m-%d %H:%M:%S %z"),
                now.timezone(),
                now.timestamp()
            );
            system_content.push_str(&time_block);

            // Inject UI Rendering & Formatting Rules
            system_content.push_str("\n\n## UI Rendering & Formatting Rules\n");
            system_content.push_str("1. When generating SVGs or visual assets, ALWAYS wrap the raw `<svg>` code inside a markdown code block with the `svg` language identifier (e.g. ```svg\n<svg>...</svg>\n```). Do NOT output raw SVG tags directly in the text body.\n");
            system_content.push_str("2. Structure your responses with clear markdown headings and bullet points.\n");
            // Inject canvas context if draw tool is available
            if authorized_tool_ids.iter().any(|t| t == "draw") {
                system_content.push_str("\n\n## Drawing Canvas\n");
                system_content.push_str("You have access to a drawing canvas (800x600 pixels).\n");
                system_content.push_str("Use the 'draw' tool to create diagrams, flowcharts, or visual content.\n");
                system_content.push_str("IMPORTANT: Before drawing complex scenes, ask for the current canvas state to avoid overlaps.\n");
                system_content.push_str("Canvas context is automatically provided with each iteration if there are existing objects.\n");
            }

            // Inject graph_session context if available
            if authorized_tool_ids.iter().any(|t| t == "graph_session") {
                system_content.push_str("\n\n## Interactive Math Graphs\n");
                system_content.push_str("You have access to an interactive graphing engine for mathematical expressions.\n");
                system_content.push_str("Use the 'graph_session' tool to:\n");
                system_content.push_str("- Add expressions: {\"action\": \"add_expression\", \"expr\": \"sin(x)\", \"color\": \"#00FF9F\"}\n");
                system_content.push_str("- Update expressions: {\"action\": \"update_expression\", \"id\": \"f1\", \"expr\": \"a * sin(x)\"}\n");
                system_content.push_str("- Set variables: {\"action\": \"set_variable\", \"name\": \"a\", \"value\": 2.5}\n");
                system_content.push_str("- Adjust viewport: {\"action\": \"set_viewport\", \"x_min\": -5, \"x_max\": 5, \"y_min\": -3, \"y_max\": 3}\n");
                system_content.push_str("- Delete expressions: {\"action\": \"delete_expression\", \"id\": \"f1\"}\n");
                system_content.push_str("When you use this tool, the UI automatically switches to math plot mode.\n");
                system_content.push_str("Iteratively refine expressions based on validation feedback (undefined variables, parse errors, etc.).\n");
                system_content.push_str("Supported: sin, cos, tan, sqrt, abs, ln, log10, exp, floor, ceil, and named variables.\n");
                
                // Inject current session state if available
                use crate::commands::AppState;
                let session_id = format!("chat_{}", chat_id);
                if let Some(state) = self.app.try_state::<AppState>() {
                    let sessions = state.graph_sessions.try_lock();
                    if let Ok(sessions_guard) = sessions {
                        if let Some(session) = sessions_guard.get(&session_id) {
                            system_content.push_str(&format!(
                                "\n\n### Current Graph State (Session: {})\n\
                                 Expressions: {}\n\
                                 Variables: {:?}\n\
                                 Viewport: [{},{}] x [{},{}]\n\
                                 Issues: {}\n\
                                 Version: {}\n\n",
                                session_id,
                                session.expressions.len(),
                                session.variables,
                                session.viewport.x_min, session.viewport.x_max,
                                session.viewport.y_min, session.viewport.y_max,
                                session.issues.len(),
                                session.current_version
                            ));
                            
                            // Add expression details
                            if !session.expressions.is_empty() {
                                system_content.push_str("### Expressions:\n");
                                for expr in &session.expressions {
                                    let status = if expr.visible { "VISIBLE" } else { "HIDDEN" };
                                    let error = expr.error.as_deref().unwrap_or("OK");
                                    system_content.push_str(&format!(
                                        "- {} [{}]: {} (error: {})\n",
                                        expr.id, status, expr.expr, error
                                    ));
                                }
                            }
                        }
                    }
                }
            }

            if !tools_supported && !meta_tools.is_empty() {
                system_content.push_str("\n\n## Tool System (Deferred Discovery)\n");
                system_content.push_str("You have access to a library of tools. Instead of loading all schemas upfront, you use 3 meta-tools to discover and invoke them dynamically:\n\n");
                system_content.push_str("1. **tool_list** - Lists all available tools with 1-line descriptions. Call this first to discover what you can do.\n");
                system_content.push_str("2. **tool_info** - Gets the full JSON schema, parameters, and usage details for a specific tool.\n");
                system_content.push_str("3. **tool_exec** - Executes a tool by name with the given arguments.\n\n");
                system_content.push_str("### Workflow\n");
                system_content.push_str("1. Call `tool_list({})` to see available tools.\n");
                system_content.push_str("2. Call `tool_info({\"tool_id\": \"tool_name\"})` to learn a tool's parameters.\n");
                system_content.push_str("3. Call `tool_exec({\"tool_id\": \"tool_name\", \"arguments\": {\"param\": \"value\"}})` to execute it.\n\n");
                system_content.push_str("### Rules\n");
                system_content.push_str("- Output EXACTLY one JSON block per tool call: ```json\n{\"tool\": \"TOOL_NAME\", \"args\": {\"...\"}}\n```\n");
                system_content.push_str("- After receiving a tool result, incorporate the data into your response.\n");
                system_content.push_str("- Do NOT ask the user which tool to use - you have full autonomy.\n");
            }

            let mut full_context = vec![ChatMessage {
                role: "system".to_string(),
                content: system_content,
                images: None,
                tool_calls: None,
                tool_call_id: None,
            }];
            full_context.extend(conversation.clone());

            // ── Call LLM with auto-escalation (Phase 3.5) ──
            let chat_id_inner = chat_id.clone();
            let app_inner = self.app.clone();

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
                        "Tool '{}' called {} times with same args — skipping to prevent loop",
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
                //   - It's very short (<100 chars) — likely just "Sure" or "Let me check"
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
                    tracing::info!("Model gave non-substantive response after tool results ({} chars) — nudging to use data", response.content.trim().len());

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
                             Do NOT say 'I found information' — instead, write out what that information actually IS. \
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

                // Emit intermediate text if present before completing
                // [DELETED redundant chat:chunk - already streamed via callback]

                // Save final completed assistant response to SQLite database
                if let Some(ref db) = self.db_pool {
                    if let Err(e) = queries::add_message(
                        db,
                        &chat_id,
                        None,
                        "assistant",
                        &response.content,
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
                    ).await {
                        tracing::error!("Failed to save final assistant message to SQLite: {:?}", e);
                    } else {
                        message_persisted = true;
                    }
                }

                // Emit completion event to unlock the chat UI
                self.emit(AgentEvent::ChatDone(ChatDonePayload {
                    chat_id: chat_id.clone(),
                    content: Some(response.content.clone()),
                    tokens_in: total_tokens_in,
                    tokens_out: total_tokens_out,
                    reason: "complete".to_string(),
                    done: true,
                }));
                return Ok(AgentResponse {
                    content: Some(response.content),
                    tool_calls: vec![],
                    reasoning: None,
                    handoff: None,
                    tokens_in: Some(total_tokens_in),
                    tokens_out: Some(total_tokens_out),
                    message_persisted,
                });
            }

            // ── Emit intermediate commentary to the user ──
            // If the LLM produced text alongside tool calls, it was already streamed via callback.
            // We just need to ensure it's saved correctly if DB is enabled.
            if !response.content.trim().is_empty() {
                tracing::info!("Recording intermediate commentary: {}...", &response.content[..response.content.len().min(80)]);
                // [DELETED redundant chat:chunk - already streamed via callback]

                // Save intermediate commentary to DB (fixes #22)
                if let Some(ref db) = self.db_pool {
                    // Use is_complete = false for intermediate turn commentary
                    if queries::add_message(
                        db,
                        &chat_id,
                        None,
                        "assistant",
                        &response.content,
                        Some(&model),
                        false, // is_complete = false
                        None,
                        None,
                        None,
                        None,
                        None,
                        None,
                        None,  // kind
                        None,  // metadata
                    ).await.is_ok() {
                        message_persisted = true;
                    }
                }
            }

            // ── Record assistant message with tool calls ──
            let models_tool_calls: Vec<crate::db::models::ToolCall> = tool_calls.iter().map(|tc| {
                crate::db::models::ToolCall {
                    id: tc.id.clone(),
                    name: tc.name.clone(),
                    args: tc.args.clone(),
                }
            }).collect();

            conversation.push(ChatMessage {
                role: "assistant".to_string(),
                content: response.content.clone(),
                images: None,
                tool_calls: Some(models_tool_calls),
                tool_call_id: None,
            });

            // ── Execute tool calls with lifecycle hooks (P3) ──
            let tool_exec_start = std::time::Instant::now();

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
            let tool_exec_elapsed_ms = tool_exec_start.elapsed().as_millis() as u64;

            // Emit tool:complete event for UI tracking
            for (tool_call, result) in tool_calls.iter().zip(results.iter()) {
                self.emit(AgentEvent::ToolComplete(ToolCompletePayload {
                    tool_name: tool_call.name.clone(),
                    tool_call_id: tool_call.id.clone(),
                    agent_id: current_agent.id.clone(),
                    agent_name: current_agent.name.clone(),
                    chat_id: chat_id.clone(),
                    duration_ms: tool_exec_elapsed_ms,
                    status: if result.is_error { "error".to_string() } else { "success".to_string() },
                    iteration,
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
                    duration_ms: tool_exec_elapsed_ms,
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
                         from the tool results above. Do NOT give a vague summary — provide the actual information. \
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
                    tracing::warn!("3 consecutive tool errors — injecting recovery hint");
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

    /// Execute tool calls with P3 lifecycle hooks (pre/post).
    /// For high-risk tools like `run_command`, emits an authorization request
    /// and waits for user approval before executing.
    async fn execute_tools_with_hooks(
        &self,
        tool_calls: &[ToolCall],
        chat_id: &str,
        iteration: usize,
        agent_id: &str,
        agent_name: &str,
        authorized_tool_ids: &[String],
        token: CancellationToken,
    ) -> Vec<ToolResult> {
        // Preprocess tool calls for meta-tool dispatch
        // Meta-tools (tool_list, tool_info) are handled inline.
        // tool_exec is transformed to use the real tool name and arguments.
        let processed_calls: Vec<(ToolCall, Option<ToolResult>)> = tool_calls.iter().map(|tc| {
            match tc.name.as_str() {
                "tool_list" => {
                    let descriptors = self.tool_manager.list_allowed(authorized_tool_ids);
                    let result = ToolResult {
                        tool_call_id: tc.id.clone(),
                        content: serde_json::to_value(&descriptors).unwrap_or_default(),
                        is_error: false,
                    };
                    (tc.clone(), Some(result))
                }
                "tool_info" => {
                    let tool_id = tc.args.get("tool_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let schema = self.tool_manager.get_info(tool_id);
                    let result = match schema {
                        Some(s) => ToolResult {
                            tool_call_id: tc.id.clone(),
                            content: serde_json::to_value(&s).unwrap_or_default(),
                            is_error: false,
                        },
                        None => ToolResult {
                            tool_call_id: tc.id.clone(),
                            content: serde_json::json!({
                                "error": format!("Tool \'{} \' not found. Use tool_list to see available tools.", tool_id),
                                "hint": "Check the tool_id spelling or call tool_list first to see all available tools."
                            }),
                            is_error: true,
                        },
                    };
                    (tc.clone(), Some(result))
                }
                "tool_exec" => {
                    // Transform tool_exec into the real tool call
                    if let Some((real_id, real_args)) = self.tool_manager.resolve_tool_exec(&tc.args) {
                        let real_tc = ToolCall {
                            id: tc.id.clone(),
                            name: real_id,
                            args: real_args,
                        };
                        (real_tc, None)
                    } else {
                        let result = ToolResult {
                            tool_call_id: tc.id.clone(),
                            content: serde_json::json!({
                                "error": "Tool not found or invalid arguments. Use tool_list and tool_info to discover valid tools.",
                                "hint": "Call tool_list() to see available tools, then tool_info({\"tool_id\": \"name\"}) for the schema."
                            }),
                            is_error: true,
                        };
                        (tc.clone(), Some(result))
                    }
                }
                _ => {
                    // Normal tool call — pass through unchanged
                    (tc.clone(), None)
                }
            }
        }).collect();

        // Separate inline results from calls that need the full pipeline
        let mut results: Vec<ToolResult> = Vec::new();
        let mut pipeline_calls: Vec<ToolCall> = Vec::new();
        for (tc, inline_result) in processed_calls {
            match inline_result {
                Some(r) => results.push(r),
                None => pipeline_calls.push(tc),
            }
        }

        // Process pipeline calls (non-meta-tools and transformed tool_exec)
        let mut handles = Vec::new();

        for tool_call in tool_calls {
            let _ = self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
                message: format!("Executing: {}", tool_call.name),
                chat_id: chat_id.to_string(),
                iteration: Some(iteration),
            }));

            // Emit structured tool_call action (Phase 1.4)
            let tool_call_meta = ToolCallMeta {
                tool_name: tool_call.name.clone(),
                args: tool_call.args.clone(),
                status: "running".to_string(),
            };

            let action_meta = ActionMeta {
                agent_id: agent_id.to_string(),
                agent_name: agent_name.to_string(),
                iteration,
                depth: self.depth,
                progress_percent: None,
                tool_call: Some(tool_call_meta),
                tool_result: None,
                handoff: None,
                spawn: None,
                approval_request: None,
                ..Default::default()
            };

            let call_content = format!("{} calling {}...", agent_name, tool_call.name);
            if let Some(ref db) = self.db_pool {
                let _ = persist_and_emit_action(
                    &self.app,
                    db,
                    chat_id,
                    None,
                    MessageKind::ToolCall,
                    call_content,
                    action_meta,
                    None,
                    None,
                    &self.on_event,
                ).await;
            } else {
                let _ = emit_action_only(
                    &self.app,
                    chat_id,
                    None,
                    MessageKind::ToolCall,
                    call_content,
                    action_meta,
                    &self.on_event,
                );
            }

            // ── Phase 3.2: Tool Cache Lookup ──
            let cache_key = ToolCache::generate_key(&tool_call.name, &tool_call.args);
            let tc_id = tool_call.id.clone();
            
            // Check cache with proper lifetime handling
            let cached_result = self.cache.lock().await.get(&cache_key).cloned();
            if let Some(cached_result) = cached_result {
                tracing::info!("Cache HIT for tool '{}'", tool_call.name);

                // Emit tool_result action for cached result
                let files = parse_file_changes(&cached_result);

                let tool_result_meta = ToolResultMeta {
                    tool_name: tool_call.name.clone(),
                    status: "ok".to_string(),
                    duration_ms: 0,
                    content_summary: cached_result.to_string().chars().take(200).collect(),
                    args: tool_call.args.clone(), // P1: Populate args for cached results
                    files,
                    raw_result: Some(cached_result.clone()),
                };
                
                let result_action_meta = ActionMeta {
                    agent_id: agent_id.to_string(),
                    agent_name: agent_name.to_string(),
                    iteration,
                    depth: self.depth,
                    progress_percent: None,
                    tool_call: Some(ToolCallMeta { // P1: Populate tool_call for correlation even in cache
                        tool_name: tool_call.name.clone(),
                        args: tool_call.args.clone(),
                        status: "completed".to_string(),
                    }),
                    tool_result: Some(tool_result_meta),
                    handoff: None,
                    spawn: None,
                    approval_request: None,
                    ..Default::default()
                };
                
                let result_content = format!("{}: Success (cached)", tool_call.name);
                if let Some(ref db) = self.db_pool {
                    let _ = persist_and_emit_action(
                        &self.app,
                        db,
                        chat_id,
                        None,
                        MessageKind::ToolResult,
                        result_content,
                        result_action_meta,
                        Some("tool"),
                        Some(tc_id.clone()),
                        &self.on_event,
                    ).await;
                } else {
                    let _ = emit_action_only(
                        &self.app,
                        chat_id,
                        None,
                        MessageKind::ToolResult,
                        result_content,
                        result_action_meta,
                        &self.on_event,
                    );
                }
                
                let tc_id_inner = tc_id.clone();
                handles.push((tc_id_inner, tokio::spawn(async move {
                    ToolResult {
                        tool_call_id: tc_id,
                        content: cached_result,
                        is_error: false,
                    }
                })));
                continue;
            }

            // ── P3: PreToolUse hook ──
            let hook_decision = self.hook_registry.pre_tool_use(tool_call);
            let tc_id = tool_call.id.clone();
            let tc_name = tool_call.name.clone();
            let tc_args = tool_call.args.clone();

            match hook_decision {
                HookDecision::Deny { reason } => {
                    tracing::info!("Hook DENIED tool '{}': {}", tc_name, reason);
                    let hook_reg = self.hook_registry.clone();
                    let tc_id_for_handle = tc_id.clone();
                    let handle = tokio::spawn(async move {
                        let result = ToolResult {
                            tool_call_id: tc_id.clone(),
                            content: json!({
                                "error": format!("Tool call denied by safety hook: {}", reason),
                                "tool": tc_name,
                                "hint": "This tool call was blocked. Try a different approach."
                            }),
                            is_error: true,
                        };
                        hook_reg.post_tool_use(&ToolCall { id: tc_id, name: tc_name, args: tc_args }, &result);
                        result
                    });
                    handles.push((tc_id_for_handle, handle));
                    continue;
                }
                HookDecision::Modify { new_args } => {
                    let tool = self.tool_registry.read().await.get(&tc_name);
                    let app = self.app.clone();
                    let hook_reg = self.hook_registry.clone();

                    let chat_id_inner = chat_id.to_string();
                    let tc_id_inner = tc_id.clone();
                    let token_inner = token.clone();
                    let agent_id_str = agent_id.to_string();
                    let agent_name_str = agent_name.to_string();
                    let depth = self.depth;

                    let allowed_tools = self.allowed_tools.clone();
                    let handle = tokio::spawn(async move {
                        let result = execute_single_tool(
                            tool, app, chat_id_inner, tc_id.clone(), tc_name.clone(), new_args.clone(), token_inner,
                            agent_id_str, agent_name_str, depth, Some(allowed_tools)
                        ).await;
                        hook_reg.post_tool_use(&ToolCall { id: tc_id, name: tc_name, args: new_args }, &result);
                        result
                    });
                    handles.push((tc_id_inner, handle));
                }
                HookDecision::Allow => {
                    // ── Unified Permission Check (YOLO mode, overrides, etc.) ──
                    let registry = self.permissions.clone();
                    let v2_tool_call = crate::tools::ToolCall {
                        id: tc_id.clone(),
                        name: tc_name.clone(),
                        arguments: tc_args.clone(),
                    };

                    let permission_result = {
                        let reg = registry.read().await;
                        reg.check_permission(&v2_tool_call, None)
                    };

                    match permission_result {
                        Ok(PermissionDecision::Allow) => {
                            // Proceed to execution
                        }
                        Ok(PermissionDecision::Confirm { context }) => {
                            // Check inherited/tree permissions first (Comment 12)
                            let is_inherited = self.allowed_tools.lock().await.contains(&tc_name);

                            // Phase 3.3: Check session-scoped permission memory first
                            let cache_key = format!("{}:{:x}", tc_name, Sha256::digest(&tc_args.to_string()));
                            let state = self.app.state::<crate::commands::AppState>();
                            let session_perms = state.session_permissions.lock().await;
                            let always_allow = session_perms
                                .get(chat_id)
                                .and_then(|chat_perms| chat_perms.get(&cache_key))
                                .copied()
                                .unwrap_or(false);
                            drop(session_perms);

                            if is_inherited || always_allow {
                                // Proceed without asking
                                if is_inherited {
                                    tracing::info!("Inheriting permission for tool '{}' (approved earlier in this session tree)", tc_name);
                                } else {
                                    tracing::info!("Session memory: ALWAYS ALLOW tool '{}'", tc_name);
                                }
                            } else {
                                // User confirmation required
                                let approved = self.request_user_confirmation(
                                    &tc_id, &tc_name, &tc_args, chat_id, context,
                                    agent_id, agent_name, iteration
                                ).await;

                                if !approved {
                                    tracing::info!("User DENIED tool '{}' (id: {})", tc_name, tc_id);
                                    let hook_reg = self.hook_registry.clone();
                                    let tc_id_for_handle = tc_id.clone();
                                    let handle = tokio::spawn(async move {
                                        let result = ToolResult {
                                            tool_call_id: tc_id.clone(),
                                            content: json!({
                                                "error": "Tool execution denied by user.",
                                                "tool": tc_name,
                                                "hint": "The user chose not to allow this command. Try a different approach or ask the user for guidance."
                                            }),
                                            is_error: true,
                                        };
                                        hook_reg.post_tool_use(&ToolCall { id: tc_id, name: tc_name, args: tc_args }, &result);
                                        result
                                    });
                                    handles.push((tc_id_for_handle, handle));
                                    continue;
                                }
                                tracing::info!("User APPROVED tool '{}' (id: {})", tc_name, tc_id);
                                // Capture approval for inheritance (Comment 12)
                                self.allowed_tools.lock().await.insert(tc_name.clone());
                            }
                        }
                        Ok(PermissionDecision::Deny { reason }) => {
                            tracing::info!("Permission DENIED tool '{}': {}", tc_name, reason);
                            let hook_reg = self.hook_registry.clone();
                            let tc_id_for_handle = tc_id.clone();
                            let handle = tokio::spawn(async move {
                                let result = ToolResult {
                                    tool_call_id: tc_id.clone(),
                                    content: json!({
                                        "error": format!("Tool call denied by security policy: {}", reason),
                                        "tool": tc_name,
                                        "hint": "This tool call was blocked for safety. Try a different approach."
                                    }),
                                    is_error: true,
                                };
                                hook_reg.post_tool_use(&ToolCall { id: tc_id, name: tc_name, args: tc_args }, &result);
                                result
                            });
                            handles.push((tc_id_for_handle, handle));
                            continue;
                        }
                        Err(e) => {
                            tracing::error!("Permission check failed for tool '{}': {}", tc_name, e);
                            // Fallback to safe denial if permission check itself errors out
                            let hook_reg = self.hook_registry.clone();
                            let tc_id_for_handle = tc_id.clone();
                            let handle = tokio::spawn(async move {
                                let result = ToolResult {
                                    tool_call_id: tc_id.clone(),
                                    content: json!({
                                        "error": format!("Internal security check failed: {}", e),
                                        "tool": tc_name
                                    }),
                                    is_error: true,
                                };
                                hook_reg.post_tool_use(&ToolCall { id: tc_id, name: tc_name, args: tc_args }, &result);
                                result
                            });
                            handles.push((tc_id_for_handle, handle));
                            continue;
                        }
                    }

                    let tool = self.tool_registry.read().await.get(&tc_name);
                    let app = self.app.clone();
                    let hook_reg = self.hook_registry.clone();
                    let cache = self.cache.clone();
                    let cache_key_clone = cache_key.clone();

                    let chat_id_inner = chat_id.to_string();
                    let token_inner = token.clone();
                    let tc_args_inner = tc_args.clone();
                    let tc_id_inner = tc_id.clone();
                    let agent_id_str = agent_id.to_string();
                    let agent_name_str = agent_name.to_string();
                    let depth = self.depth;

                    let allowed_tools = self.allowed_tools.clone();
                    let handle = tokio::spawn(async move {
                        let result = execute_single_tool(
                            tool, app, chat_id_inner, tc_id.clone(), tc_name.clone(), tc_args_inner, token_inner,
                            agent_id_str, agent_name_str, depth, Some(allowed_tools)
                        ).await;
                        
                        // Cache successful results (not errors)
                        if !result.is_error {
                            cache.lock().await.set(cache_key_clone, result.content.clone());
                        }
                        
                        hook_reg.post_tool_use(&ToolCall { id: tc_id, name: tc_name, args: tc_args }, &result);
                        result
                    });
                    handles.push((tc_id_inner, handle));
                }
            }
        }

        // Collect pipeline results into the existing results vec (which already has inline meta-tool results)
        for (tc_id, handle) in handles {
            match handle.await {
                Ok(result) => results.push(result),
                Err(e) => {
                    tracing::error!("Tool task panicked for {}: {}", tc_id, e);
                    results.push(ToolResult {
                        tool_call_id: tc_id,
                        content: json!({ 
                            "error": format!("Internal execution panic: {}", e),
                            "hint": "The tool thread crashed unexpectedly. Please report this if it persists."
                        }),
                        is_error: true,
                    })
                }
            }
        }
        results
    }

    /// Emit a `tool:authorization_request` event and wait for user response.
    /// Returns `true` if approved, `false` if denied or timed out.
    async fn request_user_confirmation(
        &self,
        tool_call_id: &str,
        tool_name: &str,
        args: &serde_json::Value,
        chat_id: &str,
        context: crate::tools::permission::PermissionContext,
        _agent_id: &str,
        _agent_name: &str,
        iteration: usize,
    ) -> bool {
        use tauri::Manager;

        // Create oneshot channel for the response
        let (tx, rx) = tokio::sync::oneshot::channel::<bool>();

        // Store the sender in AppState
        {
            let state = self.app.state::<crate::commands::AppState>();
            let mut approvals = state.pending_tool_approvals.lock().await;
            approvals.insert(tool_call_id.to_string(), tx);
        }

        // Update status to show we're waiting
        let _ = self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
            message: format!("⚠ Awaiting approval: {}", tool_name),
            chat_id: chat_id.to_string(),
            iteration: Some(iteration),
        }));

        // Emit authorization request to frontend (direct app.emit for legacy behavior)
        let _ = self.app.emit("tool:authorization_request", json!({
            "chat_id": chat_id,
            "tool_call_id": tool_call_id,
            "tool_name": tool_name,
            "arguments": args,
            "model": "default",
            "context": context
        }));

        // Emit structured chat:message for inline approval card (direct app.emit)
        let _ = self.app.emit("chat:message", json!({
            "chat_id": chat_id,
            "id": uuid::Uuid::new_v4().to_string(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "role": "assistant",
            "content": "",
            "kind": "approval_request",
            "metadata": {
                "kind": "approval_request",
                "approval_request": {
                    "tool_call_id": tool_call_id,
                    "tool_name": tool_name,
                    "arguments": args,
                    "chat_id": chat_id,
                    "context": context
                }
            }
        }));

        // Wait for user response with 120s timeout
        match tokio::time::timeout(
            tokio::time::Duration::from_secs(120),
            rx,
        ).await {
            Ok(Ok(approved)) => approved,
            Ok(Err(_)) => {
                tracing::warn!("Tool approval channel closed for '{}'", tool_call_id);
                false
            }
            Err(_) => {
                tracing::warn!("Tool approval timed out for '{}'", tool_call_id);
                // Clean up the pending entry
                let state = self.app.state::<crate::commands::AppState>();
                let mut approvals = state.pending_tool_approvals.lock().await;
                approvals.remove(tool_call_id);
                false
            }
        }
    }
}

/// Execute a single tool call (shared by Allow and Modify paths).
async fn execute_single_tool(
    tool: Option<Arc<dyn crate::agent::tools::AgentTool>>,
    app: AppHandle,
    chat_id: String,
    tc_id: String,
    tc_name: String,
    args: serde_json::Value,
    token: CancellationToken,
    _agent_id: String,
    _agent_name: String,
    depth: u32,
    allowed_tools: Option<Arc<tokio::sync::Mutex<HashSet<String>>>>,
) -> ToolResult {
    if let Some(tool) = tool {
        // Wrap tool execution in timeout and cancellation check
        let tool_run_future = tool.run(app.clone(), chat_id, args, depth, allowed_tools, token.clone());
        
        let result_outcome = tokio::select! {
            res = tokio::time::timeout(std::time::Duration::from_secs(tool.timeout_seconds()), tool_run_future) => {
                match res {
                    Ok(Ok(mut val)) => {
                        // Phase 5: Result Truncation (200KB limit)
                        let s = val.to_string();
                        if s.len() > 200 * 1024 {
                            tracing::warn!("Tool output too large ({} bytes), truncating to 200KB", s.len());
                            let truncated: String = s.chars().take(50000).collect(); // Approx 50k chars
                            val = json!(format!("{}... [TRUNCATED DUE TO SIZE ({} bytes)]", truncated, s.len()));
                        }
                        Ok(val)
                    },
                    Ok(Err(e)) => Err(format!("Tool error: {}", e)),
                    Err(_) => Err(format!("Tool execution timed out after {}s", tool.timeout_seconds())),
                }
            },
            _ = token.cancelled() => {
                Err("Tool execution cancelled by user".to_string())
            }
        };

        let result = match result_outcome {
            Ok(val) => ToolResult { tool_call_id: tc_id.clone(), content: val, is_error: false },
            Err(e) => ToolResult {
                tool_call_id: tc_id.clone(),
                content: json!({
                    "error": e,
                    "tool": tc_name,
                    "hint": "This tool call failed or was interrupted. You may retry with different arguments or approach."
                }),
                is_error: true,
            },
        };

        result
    } else {
        let result = ToolResult {
            tool_call_id: tc_id.clone(),
            content: json!({
                "error": format!("Tool '{}' not found", tc_name),
                "available_tools": "Use handoff_to_agent if you need a specialized expert."
            }),
            is_error: true,
        };

        result
    }
}

/// Parse text-mode tool calls from LLM response content.
/// Only looks inside fenced code blocks marked ```json or ```tool.
/// NEVER scans bare JSON in prose — this prevents phantom tool calls
/// when the model outputs example JSON in its explanation.
fn parse_text_tool_calls(content: &str) -> Option<Vec<crate::db::models::ToolCall>> {
    let mut calls = Vec::new();

    // Only extract JSON from explicitly fenced code blocks.
    // We deliberately do NOT scan bare JSON objects in the text,
    // because models often output example tool-call JSON in their
    // prose explanations (e.g. "You would call {"tool":"web_search"…}"),
    // which must NOT be treated as an actual tool invocation.
    let mut search = content;
    while let Some(start) = search.find("```") {
        let after_fence = &search[start + 3..];
        // Detect language tag: json, tool, or nothing
        let tag_end = after_fence.find('\n').unwrap_or(after_fence.len());
        let tag = after_fence[..tag_end].trim().to_lowercase();
        let json_start = if after_fence.starts_with('\n') {
            1
        } else {
            tag_end + 1
        };

        let block_content = &after_fence[json_start..];
        if let Some(end) = block_content.find("```") {
            let json_str = block_content[..end].trim();
            // Only parse blocks explicitly tagged as json or tool
            if tag.is_empty() || tag == "json" || tag == "tool" {
                if let Some(tc) = try_parse_tool_json(json_str) {
                    calls.push(tc);
                }
            }
            search = &block_content[end + 3..];
        } else {
            break;
        }
    }

    if calls.is_empty() { None } else { Some(calls) }
}

/// Try to parse a JSON string as a tool call with "tool" and "args" keys.
fn try_parse_tool_json(json_str: &str) -> Option<crate::db::models::ToolCall> {
    let val: serde_json::Value = serde_json::from_str(json_str).ok()?;
    let obj = val.as_object()?;
    let name = obj.get("tool").and_then(|v| v.as_str())?;
    let args = obj.get("args").cloned().unwrap_or(serde_json::json!({}));
    Some(crate::db::models::ToolCall {
        id: format!("call_{}", uuid::Uuid::new_v4()),
        name: name.to_string(),
        args,
    })
}


/// Compact old tool results in conversation to reduce context size.
fn compact_conversation(conversation: &mut Vec<ChatMessage>, keep_recent: usize) {
    if conversation.len() <= keep_recent {
        return;
    }
    let split_point = conversation.len().saturating_sub(keep_recent);
    for msg in conversation[..split_point].iter_mut() {
        if msg.role == "tool" && msg.content.len() > 500 {
            let truncated = format!("{}... [truncated, {} bytes total]", &msg.content[..500], msg.content.len());
            msg.content = truncated;
        }
    }
}

// ─── Action Timeline Helpers ───

/// Persist an action message to DB and emit to frontend
pub async fn persist_and_emit_action(
    app: &AppHandle,
    db_pool: &SqlitePool,
    chat_id: &str,
    id: Option<String>,
    kind: MessageKind,
    content: String,
    meta: ActionMeta,
    role: Option<&str>,
    tool_call_id: Option<String>,
    channel: &Option<tauri::ipc::Channel<serde_json::Value>>,
) -> Result<String> {
    let metadata_json = serde_json::to_string(&meta)?;
    let role = role.unwrap_or("assistant");
    
    // Save to DB
    let msg = match queries::add_message(
        db_pool,
        chat_id,
        id.as_deref(),
        role,
        &content,
        None,                    // model (5th)
        true,                    // is_complete (6th)
        None,                    // tool_calls (7th)
        tool_call_id.as_deref(), // tool_call_id (8th)
        None,                    // images
        None,                    // attachments
        None,                    // tokens_in
        None,                    // tokens_out
        Some(&kind.to_string()),
        Some(&metadata_json),
    ).await {
        Ok(m) => m,
        Err(e) => {
            tracing::warn!("Failed to persist action to DB (chat_id: {}): {}", chat_id, e);
            // Fallback: emit with stable ID if provided, otherwise fresh UUID
            let msg_id = id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let msg_ts = chrono::Utc::now().to_rfc3339();
            use crate::agent::event_bus::{AgentEvent, ChatMessagePayload};
            AgentEvent::ChatMessage(ChatMessagePayload {
                chat_id: chat_id.to_string(),
                id: msg_id.clone(),
                timestamp: msg_ts,
                role: role.to_string(),
                kind: Some(kind.to_string()),
                content,
                metadata: Some(serde_json::to_value(meta)?),
            }).emit_via(app, channel);
            return Err(e.into());
        }
    };
    
    // Emit to frontend using the DB-generated ID and timestamp
    let msg_id = msg.id.clone();
    let msg_ts = msg.created_at;

    use crate::agent::event_bus::{AgentEvent, ChatMessagePayload};
    AgentEvent::ChatMessage(ChatMessagePayload {
        chat_id: chat_id.to_string(),
        id: msg_id.clone(),
        timestamp: msg_ts.clone(),
        role: role.to_string(),
        kind: Some(kind.to_string()),
        content: content.clone(),
        metadata: Some(serde_json::to_value(meta.clone())?),
    }).emit_via(app, channel);

    // Bridge to AgentEvent for specific lifecycle kinds to keep Task Board / Graph in sync
    match kind {
        MessageKind::AgentSpawn => {
            if let Some(ref spawn) = meta.spawn {
                AgentEvent::AgentSpawn(AgentSpawnPayload {
                    spawn_id: msg_id.clone(),
                    parent_agent: spawn.parent_agent.clone(),
                    child_agent_id: meta.agent_id.clone(),
                    child_agent_name: meta.agent_name.clone(),
                    task: spawn.task.clone(),
                    chat_id: chat_id.to_string(),
                    timestamp: msg_ts.clone(),
                }).emit_via(app, channel);
            }
        }
        MessageKind::AgentComplete => {
            if let Some(ref spawn) = meta.spawn {
                let status = spawn.status.clone();
                let target_spawn_id = spawn.spawn_id.clone().unwrap_or_else(|| msg_id.clone());
                
                AgentEvent::AgentComplete(AgentCompletePayload {
                    spawn_id: Some(target_spawn_id),
                    agent_id: meta.agent_id.clone(),
                    chat_id: chat_id.to_string(),
                    status: status.clone(),
                    result: if status == "completed" { Some(serde_json::Value::String(content.clone())) } else { None },
                    error: if status == "failed" { Some(content) } else { None },
                    duration_ms: spawn.duration_ms.unwrap_or(0),
                    timestamp: msg_ts.clone(),
                }).emit_via(app, channel);
            }
        }
        MessageKind::AgentHandoff => {
            if let Some(ref handoff) = meta.handoff {
                AgentEvent::AgentHandoff(AgentHandoffPayload {
                    from_agent: handoff.from_agent.clone(),
                    to_agent: handoff.to_agent.clone(),
                    reason: handoff.reason.clone(),
                    chat_id: chat_id.to_string(),
                    timestamp: msg_ts.clone(),
                }).emit_via(app, channel);
            }
        }
        _ => {}
    }
    
    Ok(msg_id)
}

impl std::fmt::Display for MessageKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MessageKind::Text => write!(f, "text"),
            MessageKind::ToolCall => write!(f, "tool_call"),
            MessageKind::ToolResult => write!(f, "tool_result"),
            MessageKind::AgentHandoff => write!(f, "agent_handoff"),
            MessageKind::AgentSpawn => write!(f, "agent_spawn"),
            MessageKind::AgentComplete => write!(f, "agent_complete"),
            MessageKind::ApprovalRequest => write!(f, "approval_request"),
            MessageKind::ClarificationRequest => write!(f, "clarification_request"),
        }
    }
}

/// Emit action event to frontend without persisting to DB (fallback when no db_pool)
pub fn emit_action_only(
    app: &AppHandle,
    chat_id: &str,
    id: Option<String>,
    kind: MessageKind,
    content: String,
    meta: ActionMeta,
    channel: &Option<tauri::ipc::Channel<serde_json::Value>>,
) -> Result<String> {
    let msg_id = id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let msg_ts = chrono::Utc::now().to_rfc3339();

    use crate::agent::event_bus::{AgentEvent, ChatMessagePayload};
    AgentEvent::ChatMessage(ChatMessagePayload {
        chat_id: chat_id.to_string(),
        id: msg_id.clone(),
        timestamp: msg_ts.clone(),
        role: "assistant".to_string(),
        kind: Some(kind.to_string()),
        content: content.clone(),
        metadata: Some(serde_json::to_value(meta.clone())?),
    }).emit_via(app, channel);

    // Bridge to AgentEvent for specific lifecycle kinds (fallback path)
    match kind {
        MessageKind::AgentSpawn => {
            if let Some(ref spawn) = meta.spawn {
                AgentEvent::AgentSpawn(AgentSpawnPayload {
                    spawn_id: msg_id.clone(),
                    parent_agent: spawn.parent_agent.clone(),
                    child_agent_id: meta.agent_id.clone(),
                    child_agent_name: meta.agent_name.clone(),
                    task: spawn.task.clone(),
                    chat_id: chat_id.to_string(),
                    timestamp: msg_ts.clone(),
                }).emit_via(app, channel);
            }
        }
        MessageKind::AgentComplete => {
            if let Some(ref spawn) = meta.spawn {
                let status = spawn.status.clone();
                let target_spawn_id = spawn.spawn_id.clone().unwrap_or_else(|| msg_id.clone());
                
                AgentEvent::AgentComplete(AgentCompletePayload {
                    spawn_id: Some(target_spawn_id),
                    agent_id: meta.agent_id.clone(),
                    chat_id: chat_id.to_string(),
                    status: status.clone(),
                    result: if status == "completed" { Some(serde_json::Value::String(content.clone())) } else { None },
                    error: if status == "failed" { Some(content) } else { None },
                    duration_ms: spawn.duration_ms.unwrap_or(0),
                    timestamp: msg_ts.clone(),
                }).emit_via(app, channel);
            }
        }
        MessageKind::AgentHandoff => {
            if let Some(ref handoff) = meta.handoff {
                AgentEvent::AgentHandoff(AgentHandoffPayload {
                    from_agent: handoff.from_agent.clone(),
                    to_agent: handoff.to_agent.clone(),
                    reason: handoff.reason.clone(),
                    chat_id: chat_id.to_string(),
                    timestamp: msg_ts.clone(),
                }).emit_via(app, channel);
            }
        }
        _ => {}
    }

    Ok(msg_id)
}

// ─── Conversation Compaction ───

/// Token-aware conversation compaction (fixes #23)
/// Removes oldest tool result pairs first until under target token limit
fn compact_conversation_token_aware(
    conversation: &mut Vec<ChatMessage>,
    min_keep: usize,
    target_tokens: usize,
) {
    // Always keep system prompt and first user message
    let removable_start = 2;
    let mut removable_end = conversation.len();
    
    while removable_end - removable_start > min_keep {
        let current_tokens = estimate_conversation_tokens(&conversation[removable_start..removable_end]);
        if current_tokens <= target_tokens {
            break;
        }
        
        // Find oldest tool result pair (assistant tool call + tool result)
        let mut removed_any = false;
        for i in removable_start..removable_end.saturating_sub(1) {
            if conversation[i].tool_calls.is_some() && conversation[i].role == "assistant" {
                if i + 1 < removable_end && conversation[i + 1].role == "tool" {
                    // Remove this pair
                    conversation.remove(i);
                    conversation.remove(i); // After first removal, indices shift
                    removable_end -= 2;
                    removed_any = true;
                    break;
                }
            }
        }
        
        if !removed_any {
            // No tool pairs found, truncate oldest messages
            if removable_end - removable_start > min_keep {
                conversation.remove(removable_start);
                removable_end -= 1;
            } else {
                break;
            }
        }
    }
}

// ─── Phase 3.4: Handoff Summary Generation ───

/// Generate a concise summary of what the outgoing agent accomplished
/// This acts as context compression to prevent context-window bloat
fn generate_handoff_summary(
    conversation: &[ChatMessage],
    _agent_name: &str,
    _handoff_args: &serde_json::Value,
) -> String {
    // Extract last N tool calls and their results
    let mut tools_used = Vec::new();
    let mut last_content = String::new();
    
    // Look at last 10 messages for context
    for msg in conversation.iter().rev().take(10) {
        if msg.role == "assistant" {
            if let Some(ref tool_calls) = msg.tool_calls {
                for tc in tool_calls {
                    if !tools_used.contains(&tc.name) {
                        tools_used.push(tc.name.clone());
                    }
                }
            }
            if last_content.is_empty() && !msg.content.trim().is_empty() {
                last_content = msg.content.chars().take(100).collect();
            }
        }
    }
    
    // Build summary
    let mut summary_parts = Vec::new();
    
    if !tools_used.is_empty() {
        summary_parts.push(format!("Used: {}", tools_used.join(", ")));
    }
    
    if !last_content.is_empty() {
        summary_parts.push(format!("Found: {}", last_content));
    }
    
    if summary_parts.is_empty() {
        summary_parts.push("No actions taken".to_string());
    }
    
    summary_parts.join(" | ")
}

// ─── Phase 3.5: Auto-Escalation Helper ───

impl Runner {
    /// Call LLM with auto-escalation from local to cloud models.
    /// If the local model fails, automatically retry with a cloud model.
    ///
    /// # Memory Optimization
    /// This function takes ownership of `messages`, `tools`, `config`, and `token`.
    /// On the initial call, these are cloned for the callback closure.
    /// If escalation occurs, the ORIGINAL values are used for retry (no additional clone).
    ///
    /// # Caller Responsibility
    /// If you want retry support, clone arguments before calling:
    /// ```rust
    /// call_llm_with_escalation(..., messages.clone(), tools.clone(), ...).await
    /// ```
    /// If you don't need retry (escalation disabled), pass by value to save memory.
    async fn call_llm_with_escalation(
        &self,
        provider: &dyn crate::llm::LlmProvider,
        model: &str,
        messages: Vec<ChatMessage>,
        tools: Option<Vec<crate::tools::ToolInfo>>,
        config: crate::llm::ChatRequestConfig,
        token: CancellationToken,
        app: &AppHandle,
        chat_id: &str,
    ) -> Result<crate::db::models::ChatResponse, anyhow::Error> {
        // Try with current provider first
        match self.call_llm_with_callback(
            provider,
            model,
            messages.clone(),
            tools.clone(),
            config.clone(),
            token.clone(),
            app,
            chat_id,
        ).await {
            Ok(response) => {
                // Success - check if response quality is acceptable
                if response.content.trim().is_empty() {
                    tracing::warn!("Empty response from model {} - may need escalation", model);
                    // Could add quality checks here
                }
                Ok(response)
            }
            Err(e) => {
                let err_str = e.to_string();
                tracing::warn!("LLM call failed with model {}: {}", model, err_str);

                // Phase 3.5a: Detect tool-capability errors and retry WITHOUT tools first.
                // This handles models that can follow JSON instructions but lack a formal
                // function-calling endpoint (e.g. OpenRouter free-tier models).
                if tools.is_some() && is_tool_capability_error(&err_str) {
                    tracing::info!(
                        "Tool-capability error detected for model {} — retrying without structured tools",
                        model
                    );

                    self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
                        chat_id: chat_id.to_string(),
                        message: "⚠️ Model doesn't support tools — retrying in text mode".to_string(),
                        iteration: Some(0),
                    }));

                    match self.call_llm_with_callback(
                        provider,
                        model,
                        messages.clone(),
                        None, // Strip tools
                        config.clone(),
                        token.clone(),
                        app,
                        chat_id,
                    ).await {
                        Ok(response) => {
                            tracing::info!("Text-mode retry succeeded for {}", model);
                            // Update capability cache so future requests skip tools
                            // Cache update happens implicitly via supports_tools
                            return Ok(response);
                        }
                        Err(text_err) => {
                            tracing::warn!(
                                "Text-mode retry also failed for {}: {} — proceeding to escalation",
                                model,
                                text_err
                            );
                            // Fall through to normal escalation
                        }
                    }
                }

                // Phase 3.5b: Auto-escalation logic
                let auto_escalate = if let Some(pool) = &self.db_pool {
                    queries::get_setting(pool, "auto_escalate").await
                        .ok()
                        .flatten()
                        .map(|v| v == "true")
                        .unwrap_or(true) // Default to true if not found
                } else {
                    true
                };

                let should_escalate = auto_escalate && self.should_escalate_to_cloud(model);

                if should_escalate {
                    tracing::info!("Auto-escalating to cloud model...");

                    // Signal frontend to clear any partial stream content from the failed attempt
                    let _ = app.emit("chat:stream-reset", json!({
                        "chat_id": chat_id,
                    }));

                    // Emit escalation status to user
                    self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
                        chat_id: chat_id.to_string(),
                        message: "⚡ Local model unavailable - escalating to cloud model".to_string(),
                        iteration: Some(0),
                    }));

                    // Try to get cloud provider from settings and retry
                    match self.get_cloud_provider_config(app).await {
                        Some(cloud_config) => {
                            tracing::info!("Cloud provider configured: {}", cloud_config.display_name);

                            // Emit status about which cloud provider is being used
                            self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
                                chat_id: chat_id.to_string(),
                                message: format!("☁️ Using {} for reliable response", cloud_config.display_name),
                                iteration: Some(0),
                            }));

                            // Create cloud provider and retry
                            let cloud_provider = crate::llm::make_provider(&cloud_config);

                            // Retry with cloud provider using a reliable model
                            let fallback_model = crate::llm::default_model_for_provider(&cloud_config.provider_type);
                            tracing::info!("Retrying with cloud model: {}", fallback_model);

                            match self.call_llm_with_callback(
                                cloud_provider.as_ref(),
                                &fallback_model,
                                messages,
                                tools,
                                config,
                                token,
                                app,
                                chat_id,
                            ).await {
                                Ok(response) => {
                                    tracing::info!("Cloud escalation succeeded with {}", fallback_model);
                                    self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
                                        chat_id: chat_id.to_string(),
                                        message: "✅ Cloud provider succeeded".to_string(),
                                        iteration: Some(0),
                                    }));
                                    Ok(response)
                                }
                                Err(cloud_err) => {
                                    tracing::error!("Cloud provider also failed: {}", cloud_err);
                                    self.emit(AgentEvent::ChatError(ChatErrorPayload {
                                        chat_id: chat_id.to_string(),
                                        error: format!("Cloud provider failed: {}", cloud_err),
                                        recoverable: true,
                                    }));
                                    Err(e.into())
                                }
                            }
                        }
                        None => {
                            tracing::warn!("No cloud provider configured - cannot escalate");
                            self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
                                chat_id: chat_id.to_string(),
                                message: "⚠️ No cloud provider configured - add API key in Settings > Providers".to_string(),
                                iteration: Some(0),
                            }));
                            self.emit(AgentEvent::ChatError(ChatErrorPayload {
                                chat_id: chat_id.to_string(),
                                error: "No cloud provider configured for escalation".to_string(),
                                recoverable: false,
                            }));
                            Err(e.into())
                        }
                    }
                } else {
                    // Already using cloud model or escalation disabled
                    let _ = app.emit("chat:error", json!({
                        "chat_id": chat_id,
                        "error": e.to_string(),
                        "recoverable": false
                    }));
                    Err(e.into())
                }
            }
        }
    }

    /// Helper to call LLM with standard chunk emission callback
    async fn call_llm_with_callback(
        &self,
        provider: &dyn crate::llm::LlmProvider,
        model: &str,
        messages: Vec<ChatMessage>,
        tools: Option<Vec<crate::tools::ToolInfo>>,
        config: crate::llm::ChatRequestConfig,
        token: CancellationToken,
        app: &AppHandle,
        chat_id: &str,
    ) -> Result<crate::db::models::ChatResponse, anyhow::Error> {
        let app_clone = app.clone();
        let on_event_clone = self.on_event.clone();
        let chat_id_clone = chat_id.to_string();
        
        // Optimize IPC: Buffer tokens for ~40ms windows to reduce event frequency
        let buffer = std::sync::Arc::new(std::sync::Mutex::new((String::new(), std::time::Instant::now(), "text")));
        let buffer_clone = buffer.clone();

        // Streaming artifact detector: scans LLM output for <nexus_artifact> tag
        // boundaries and emits first-class artifact lifecycle events.
        let detector = std::sync::Arc::new(std::sync::Mutex::new(
            crate::agent::event_bus::StreamingArtifactDetector::new({
                let app = app_clone.clone();
                let on_event = on_event_clone.clone();
                move |ev| { ev.emit_via(&app, &on_event); }
            })
        ));
        let detector_clone = detector.clone();

        let result = provider.chat_stream(
            model,
            messages,
            tools,
            config,
            Box::new(move |chunk| {
                use crate::llm::LlmChunk;
                use crate::agent::event_bus::{AgentEvent, ChatChunkPayload};

                let (chunk_text, chunk_type) = match chunk {
                    LlmChunk::Text(t) => (t, "text"),
                    LlmChunk::Thought(t) => (t, "thought"),
                };

                // Feed text chunks to the artifact detector alongside chat emission.
                // Text-only chunks are scanned for <nexus_artifact> boundaries and
                // may produce artifact:start / artifact:delta / artifact:complete events.
                if chunk_type == "text" && !chunk_text.is_empty() {
                    if let Ok(mut det) = detector_clone.lock() {
                        det.feed(&chunk_text, &chat_id_clone);
                    }
                }

                let mut data = match buffer_clone.lock() {
                    Ok(guard) => guard,
                    Err(poisoned) => {
                        error!("[runner] buffer mutex poisoned, recovering");
                        poisoned.into_inner()
                    }
                };
                
                // If type changed, flush immediately
                if data.2 != chunk_type && !data.0.is_empty() {
                    let old_text = std::mem::take(&mut data.0);
                    let old_type = data.2;
                    
                    AgentEvent::ChatChunk(ChatChunkPayload {
                        chat_id: chat_id_clone.clone(),
                        delta: old_text,
                        r#type: old_type.to_string(),
                        done: false,
                    }).emit_via(&app_clone, &on_event_clone);
                    
                    data.1 = std::time::Instant::now();
                }

                data.0.push_str(&chunk_text);
                data.2 = chunk_type;
                
                // Optimize IPC: Flush every 20ms or if buffer gets large to maintain "liquid" feel
                if data.1.elapsed().as_millis() >= 20 || data.0.len() > 1024 {
                    let text = std::mem::take(&mut data.0);
                    let current_type = data.2;
                    data.1 = std::time::Instant::now();
                    drop(data); // Lock released before emission
                    
                    AgentEvent::ChatChunk(ChatChunkPayload {
                        chat_id: chat_id_clone.clone(),
                        delta: text,
                        r#type: current_type.to_string(),
                        done: false,
                    }).emit_via(&app_clone, &on_event_clone);
                }
            }),
            token,
        ).await;

        // Final flush: Send any remaining tokens in the buffer
        let mut data = match buffer.lock() {
            Ok(guard) => guard,
            Err(poisoned) => {
                error!("[runner] buffer mutex poisoned during final flush");
                poisoned.into_inner()
            }
        };
        if !data.0.is_empty() {
            let text = std::mem::take(&mut data.0);
            let current_type = data.2;
            
            use crate::agent::event_bus::{AgentEvent, ChatChunkPayload};
            AgentEvent::ChatChunk(ChatChunkPayload {
                chat_id: chat_id.to_string(),
                delta: text,
                r#type: current_type.to_string(),
                done: false,
            }).emit_via(app, &self.on_event);
        }

        // Flush the artifact detector to clean up partial state
        if let Ok(mut det) = detector.lock() {
            det.flush();
        }

        result.map_err(|e| e.into())
    }

    /// Get cloud provider configuration from settings
    /// Returns None if no cloud provider is configured
    async fn get_cloud_provider_config(&self, app: &AppHandle) -> Option<crate::db::models::ProviderConfig> {
        // Get the database pool from app state
        let db_pool = app.state::<crate::commands::AppState>().db().await.ok()?;

        // Get current provider name
        let provider_name = queries::get_setting(&db_pool, "provider")
            .await
            .ok()
            .flatten()
            .unwrap_or_else(|| "ollama".to_string());

        // If current provider is already a cloud provider, return it
        if !self.is_local_provider(&provider_name) {
            let base_url = queries::get_setting(&db_pool, &format!("{}_base_url", provider_name))
                .await
                .ok()
                .flatten()
                .unwrap_or_else(|| crate::llm::default_base_url(&provider_name));

            let api_key = queries::get_setting(&db_pool, &format!("{}_api_key", provider_name))
                .await
                .ok()
                .flatten()
                .unwrap_or_default();

            return Some(crate::db::models::ProviderConfig {
                provider_type: provider_name.clone(),
                base_url,
                api_key,
                display_name: provider_name.to_uppercase(),
                headers: None,
            });
        }

        // Current provider is local - check for configured cloud fallbacks in priority order
        let cloud_providers = vec!["anthropic", "openai", "groq", "openrouter"];

        for cloud_name in cloud_providers {
            let api_key = queries::get_setting(&db_pool, &format!("{}_api_key", cloud_name))
                .await
                .ok()
                .flatten();

            if let Some(key) = api_key {
                if !key.is_empty() {
                    let base_url = queries::get_setting(&db_pool, &format!("{}_base_url", cloud_name))
                        .await
                        .ok()
                        .flatten()
                        .unwrap_or_else(|| crate::llm::default_base_url(cloud_name));

                    tracing::info!("Found configured cloud provider: {}", cloud_name);
                    return Some(crate::db::models::ProviderConfig {
                        provider_type: cloud_name.to_string(),
                        base_url,
                        api_key: key,
                        display_name: cloud_name.to_uppercase(),
                        headers: None,
                    });
                }
            }
        }

        // No cloud provider configured
        None
    }

    /// Determine if we should escalate from local to cloud model
    fn should_escalate_to_cloud(&self, current_model: &str) -> bool {
        let model_lower = current_model.to_lowercase();
        
        // Check if current model is a local model
        let is_local = model_lower.contains("ollama")
            || model_lower.contains("lmstudio")
            || model_lower.contains("llama")
            || model_lower.contains("mistral")
            || model_lower.contains("gemma")
            || model_lower.contains("phi");

        // Also escalate from "free" cloud models as they are often unstable
        let is_unstable_free = model_lower.contains(":free") 
            || model_lower.contains("/free")
            || model_lower.contains("free-");

        // Only escalate from local or unstable free models
        is_local || is_unstable_free
    }

    /// Check if a provider name refers to a local provider
    fn is_local_provider(&self, provider_name: &str) -> bool {
        let name = provider_name.to_lowercase();
        name == "ollama" || name == "lmstudio" || name.contains("local")
    }
}
