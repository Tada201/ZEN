//! The LLM streaming callback wrapper: depth gates, early tool execution,
//! tool-argument redaction, and chunk emission with 20ms IPC batching.

use super::Runner;
use crate::chat_status::ChatStatusPhase;
use crate::event_bus::{
    AgentChunkPayload, AgentEvent, ChatChunkFirstPayload, ChatChunkPayload, ChatMessagePayload,
    ChatStatusPayload,
};
use crate::types::{ToolCall, ToolResult};
use zen_db::models::ChatMessage;
use zen_db::queries;
use anyhow::Result;
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::{Mutex, Notify};
use tokio_util::sync::CancellationToken;
use tracing::error;

// ─── Depth-gate helpers ─────────────────────────────────────────────────
//
// Subagent (depth > 0) events must NOT flood the live UI stream.
// The subagent's final response is delivered as a tool result,
// not as token deltas. These gates prevent subagent token floods
// from competing with the parent's streaming pipe.

/// Which category of live-stream event we are about to emit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum LiveEventKind {
    AgentChunk,
    ChatStatus,
    /// The very first `chat:chunk:first` for a response.
    ChatChunkFirst,
    ChatChunk,
}

/// Decide whether a child runner (depth > 0) should still emit the
/// given event category to the live UI stream.
pub(super) fn should_emit_live_stream_event(depth: u32, kind: LiveEventKind) -> bool {
    if depth == 0 {
        return true;
    }
    match kind {
        LiveEventKind::ChatChunkFirst | LiveEventKind::ChatChunk | LiveEventKind::AgentChunk | LiveEventKind::ChatStatus => false,
    }
}

/// The 500ms `accumulated_text` saver task contends with the parent's
/// SQLite write path. Skip it for child runners; they only persist on
/// final completion.
pub(super) fn should_run_partial_saver(depth: u32) -> bool {
    depth == 0
}

#[derive(Clone)]
pub(super) struct EarlyToolExecutionContext {
    pub chat_id: String,
    pub iteration: usize,
    pub agent_id: String,
    pub agent_name: String,
    pub authorized_tool_ids: Vec<String>,
    pub state: Arc<EarlyToolExecutionState>,
}

pub(super) struct EarlyToolExecutionState {
    started: Mutex<HashSet<String>>,
    results: Mutex<HashMap<String, ToolResult>>,
    notify: Notify,
}

impl EarlyToolExecutionState {
    pub fn new() -> Self {
        Self {
            started: Mutex::new(HashSet::new()),
            results: Mutex::new(HashMap::new()),
            notify: Notify::new(),
        }
    }

    pub fn key_for(
        name: &str,
        args: &serde_json::Value,
        id: Option<&str>,
        index: Option<usize>,
    ) -> String {
        if let Some(id) = id.filter(|value| !value.is_empty()) {
            format!("id:{id}")
        } else {
            use sha2::{Digest, Sha256};
            let index = index
                .map(|value| value.to_string())
                .unwrap_or_else(|| "unknown".to_string());
            format!("sig:{index}:{name}:{:x}", Sha256::digest(args.to_string()))
        }
    }

    pub async fn mark_started(&self, key: &str) -> bool {
        self.started.lock().await.insert(key.to_string())
    }

    pub async fn insert_result(&self, key: String, result: ToolResult) {
        self.results.lock().await.insert(key, result);
        self.notify.notify_waiters();
    }

    pub async fn take_result(&self, key: &str) -> Option<ToolResult> {
        let result = self.results.lock().await.remove(key);
        if result.is_some() {
            self.started.lock().await.remove(key);
        }
        result
    }

    pub async fn was_started(&self, key: &str) -> bool {
        self.started.lock().await.contains(key)
    }

    pub async fn clear_pending(&self) {
        self.started.lock().await.clear();
        self.results.lock().await.clear();
        self.notify.notify_waiters();
    }

    pub async fn wait_for_result(&self, key: &str, token: CancellationToken) -> Option<ToolResult> {
        loop {
            if let Some(result) = self.take_result(key).await {
                return Some(result);
            }
            if !self.was_started(key).await {
                return None;
            }
            tokio::select! {
                _ = self.notify.notified() => {}
                _ = token.cancelled() => return None,
            }
        }
    }
}

fn redact_tool_preview_string(value: &str) -> String {
    const MAX_PREVIEW_CHARS: usize = 500;
    let mut redacted = value.to_string();
    for marker in [
        "api_key",
        "apikey",
        "authorization",
        "bearer",
        "credential",
        "password",
        "secret",
        "token",
    ] {
        let lower = redacted.to_lowercase();
        if lower.contains(marker) {
            return "[redacted sensitive tool arguments]".to_string();
        }
    }
    if redacted.chars().count() > MAX_PREVIEW_CHARS {
        redacted = redacted.chars().take(MAX_PREVIEW_CHARS).collect::<String>();
        redacted.push_str("...");
    }
    redacted
}

fn redact_tool_preview_value(value: serde_json::Value) -> serde_json::Value {
    const MAX_ITEMS: usize = 24;
    const MAX_DEPTH: usize = 6;

    fn inner(value: serde_json::Value, depth: usize) -> serde_json::Value {
        if depth > MAX_DEPTH {
            return json!("[truncated]");
        }
        match value {
            serde_json::Value::String(s) => {
                serde_json::Value::String(redact_tool_preview_string(&s))
            }
            serde_json::Value::Array(items) => serde_json::Value::Array(
                items
                    .into_iter()
                    .take(MAX_ITEMS)
                    .map(|item| inner(item, depth + 1))
                    .collect(),
            ),
            serde_json::Value::Object(map) => {
                let mut next = serde_json::Map::new();
                for (key, item) in map.into_iter().take(MAX_ITEMS) {
                    let key_lower = key.to_lowercase();
                    let should_redact = [
                        "api_key",
                        "apikey",
                        "authorization",
                        "bearer",
                        "credential",
                        "password",
                        "secret",
                        "token",
                    ]
                    .iter()
                    .any(|marker| key_lower.contains(marker));
                    next.insert(
                        key,
                        if should_redact {
                            json!("[redacted]")
                        } else {
                            inner(item, depth + 1)
                        },
                    );
                }
                serde_json::Value::Object(next)
            }
            other => other,
        }
    }

    inner(value, 0)
}

fn redact_tool_preview_args(value: &serde_json::Value) -> serde_json::Value {
    redact_tool_preview_value(value.clone())
}

/// Parameters for the LLM streaming callback wrapper.
pub(super) struct LlmCallbackParams<'a> {
    pub provider: &'a dyn zen_llm::LlmProvider,
    pub model: &'a str,
    pub messages: Vec<ChatMessage>,
    pub tools: Option<Vec<zen_tools::ToolInfo>>,
    pub config: zen_llm::ChatRequestConfig,
    pub token: CancellationToken,
    pub chat_id: &'a str,
    pub early_tools: Option<EarlyToolExecutionContext>,
    pub agent_stream: Option<(String, String)>,
}

impl Runner {
    /// Helper to call LLM with standard chunk emission callback and 20ms IPC batching.
    pub(super) async fn call_llm_with_callback(
        &self,
        assistant_message_id: &mut Option<String>,
        params: LlmCallbackParams<'_>,
    ) -> Result<zen_db::models::ChatResponse, anyhow::Error> {
        let LlmCallbackParams {
            provider,
            model,
            messages,
            tools,
            config,
            token,
            chat_id,
            early_tools,
            agent_stream,
        } = params;
        let events_clone = self.ctx.events.clone();
        let chat_id_clone = chat_id.to_string();
        let agent_stream_clone = agent_stream.clone();
        let spawn_id_clone = self.trace_id();
        let early_runner = self.clone();
        let early_tools_clone = early_tools.clone();
        // Depth-0 only the parent is allowed to emit to the live UI
        // stream. Children emit through the tool-result path instead.
        let runner_depth = self.depth;
        let early_token = token.child_token();
        let early_token_for_callback = early_token.clone();

        // Allocate the assistant id synchronously and make the placeholder durable
        // before streaming or tool execution begins. The frontend can receive tool
        // events immediately after this point, so deferring the insert until the
        // stream completes creates a reload window where the live timeline exists
        // only in memory and cannot be recovered from SQLite.
        let mut placeholder_insert = None;
        let msg_id = match assistant_message_id {
            Some(id) => id.clone(),
            None => {
                let id = uuid::Uuid::new_v4().to_string();
                // Emit bridge event so frontend can map its temp ID to server UUID
                AgentEvent::ChatMessage(ChatMessagePayload {
                    chat_id: chat_id.to_string(),
                    id: id.clone(),
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    role: "assistant".to_string(),
                    content: "".to_string(),
                    kind: None,
                    metadata: Some(serde_json::json!({
                        "model": model,
                        "isComplete": false,
                    })),
                })
                .emit_to(events_clone.as_ref());
                if let Some(db) = self.db_pool.clone() {
                    let chat_id = chat_id.to_string();
                    let model = model.to_string();
                    let id_for_insert = id.clone();
                    placeholder_insert = Some(tokio::spawn(async move {
                        queries::add_message(
                            &db,
                            &queries::NewMessage {
                                chat_id: &chat_id,
                                id: Some(&id_for_insert),
                                role: "assistant",
                                content: "",
                                model: Some(&model),
                                is_complete: false,
                                ..Default::default()
                            },
                        )
                        .await
                    }));
                }
                *assistant_message_id = Some(id.clone());
                id
            }
        };

        // Keep the real backend identity as the single persistence key. Awaiting
        // only the placeholder insert is bounded to one SQLite write and happens
        // before the provider callback can emit chunks or tool events.
        if let Some(handle) = placeholder_insert.take() {
            match handle.await {
                Ok(Ok(_)) => {}
                Ok(Err(error)) => {
                    tracing::warn!(%error, %msg_id, "Failed to persist assistant placeholder before streaming");
                }
                Err(error) => {
                    tracing::warn!(%error, %msg_id, "Assistant placeholder persistence task failed");
                }
            }
        }

        let first_chunk_sent = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let first_chunk_sent_clone = first_chunk_sent.clone();
        // Text buffer: accumulates delta text and emits on batch timer to prevent Tauri IPC drops.
        let buffer = std::sync::Arc::new(std::sync::Mutex::new((
            String::new(),
            "text",
            std::time::Instant::now(),
        )));
        let buffer_clone = buffer.clone();

        // Shared accumulated text for periodic checkpoint saves
        let accumulated_text = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
        let accumulated_text_clone = accumulated_text.clone();

        // Artifact detector for <nexus_artifact> tag lifecycle events
        let detector = std::sync::Arc::new(std::sync::Mutex::new(
            crate::event_bus::StreamingArtifactDetector::new({
                let events = events_clone.clone();
                move |ev| {
                    ev.emit_to(events.as_ref());
                }
            }),
        ));
        let detector_clone = detector.clone();

        // Background periodic checkpoint saver
        let db_pool = self.db_pool.clone();
        let chat_id_str = chat_id.to_string();
        let msg_id_str = msg_id.clone();
        let msg_id_for_chunks = msg_id.clone();
        let accumulated_text_task = accumulated_text.clone();
        let cancel_token = token.clone();

        tokio::spawn(async move {
            // Subagent partial-saver competes with the parent's DB write
            // path; children only persist on final completion.
            if !should_run_partial_saver(runner_depth) {
                return;
            }
            if let Some(pool) = db_pool {
                let mut last_saved_content = String::new();
                let mut interval = tokio::time::interval(std::time::Duration::from_millis(500));
                interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
                let start_time = std::time::Instant::now();
                let max_duration = std::time::Duration::from_secs(600); // 10 minutes timeout safety net
                loop {
                    if start_time.elapsed() > max_duration {
                        tracing::warn!(
                            "Accumulated text saver task reached max duration of 10m; terminating"
                        );
                        break;
                    }
                    tokio::select! {
                        _ = interval.tick() => {
                            let current_content = {
                                if let Ok(guard) = accumulated_text_task.lock() { guard.clone() }
                                else { continue; }
                            };
                            if current_content != last_saved_content && !current_content.is_empty() {
                                let est_tokens = current_content.len() / 4;
                                let _ = queries::update_message_partial(
                                    &pool, &msg_id_str, &chat_id_str, &current_content, est_tokens,
                                ).await;
                                last_saved_content = current_content;
                            }
                        }
                        _ = cancel_token.cancelled() => { break; }
                    }
                }
            }
        });

        let result = provider
            .chat_stream(
                model,
                messages,
                tools,
                config,
                Box::new(move |chunk| {
                    use zen_llm::LlmChunk;
                    let (chunk_text, chunk_type) = match chunk {
                        LlmChunk::Text(t) => (t, "text"),
                        LlmChunk::Thought(t) => (t, "thought"),
                        LlmChunk::ToolCallDelta {
                            index,
                            id,
                            name,
                            arguments_delta,
                            arguments_snapshot,
                        } => {
                            let safe_arguments_delta = redact_tool_preview_string(&arguments_delta);
                            let safe_arguments_snapshot =
                                redact_tool_preview_string(&arguments_snapshot);
                            let tool_label = name
                                .as_deref()
                                .filter(|value| !value.is_empty())
                                .unwrap_or("tool call");
                            if should_emit_live_stream_event(
                                runner_depth,
                                LiveEventKind::ChatStatus,
                            ) {
                                AgentEvent::ChatStatus(ChatStatusPayload {
                                    chat_id: chat_id_clone.clone(),
                                    message: format!("Preparing {}", tool_label),
                                    iteration: None,
                                    phase: Some(ChatStatusPhase::TOOL_CALL_STREAMING.to_string()),
                                    metadata: Some(serde_json::json!({
                                        "status": "running",
                                        "toolCall": {
                                            "toolName": tool_label,
                                            "toolCallId": id,
                                            "args": {},
                                            "status": "running"
                                        },
                                        "toolCallPreview": {
                                            "index": index,
                                            "toolCallId": id,
                                            "toolName": name,
                                            "argumentsDelta": safe_arguments_delta,
                                            "argumentsPreview": safe_arguments_snapshot,
                                        }
                                    })),
                                })
                                .emit_to(events_clone.as_ref());
                            }
                            return;
                        }
                        LlmChunk::ToolCallReady {
                            index,
                            id,
                            name,
                            arguments,
                        } => {
                            let safe_arguments = redact_tool_preview_args(&arguments);
                            if should_emit_live_stream_event(
                                runner_depth,
                                LiveEventKind::ChatStatus,
                            ) {
                                AgentEvent::ChatStatus(ChatStatusPayload {
                                    chat_id: chat_id_clone.clone(),
                                    message: format!("{} is ready", name),
                                    iteration: None,
                                    phase: Some(ChatStatusPhase::TOOL_CALL_READY.to_string()),
                                    metadata: Some(serde_json::json!({
                                        "status": "running",
                                        "toolCall": {
                                            "toolName": name,
                                            "toolCallId": id,
                                            "args": safe_arguments.clone(),
                                            "status": "running"
                                        },
                                        "toolCallPreview": {
                                            "index": index,
                                            "toolCallId": id,
                                            "toolName": name,
                                            "argumentsPreview": safe_arguments.clone(),
                                            "ready": true,
                                        }
                                    })),
                                })
                                .emit_to(events_clone.as_ref());
                            }
                            if let Some(ctx) = early_tools_clone.clone() {
                                let key = EarlyToolExecutionState::key_for(
                                    &name,
                                    &arguments,
                                    id.as_deref(),
                                    Some(index),
                                );
                                let runner = early_runner.clone();
                                let token = early_token_for_callback.clone();
                                let msg_id_for_early = msg_id_for_chunks.clone();
                                tokio::spawn(async move {
                                    if !ctx.state.mark_started(&key).await {
                                        return;
                                    }
                                    let call = ToolCall {
                                        id: id.unwrap_or_else(|| {
                                            format!("early_tool_{}_{}", index, uuid::Uuid::new_v4())
                                        }),
                                        name,
                                        args: arguments,
                                    };
                                    let mut results = runner
                                        .execute_tools_with_hooks(
                                            std::slice::from_ref(&call),
                                            &ctx.chat_id,
                                            ctx.iteration,
                                            &ctx.agent_id,
                                            &ctx.agent_name,
                                            &ctx.authorized_tool_ids,
                                            token,
                                            Some(msg_id_for_early),
                                        )
                                        .await;
                                    if let Some(result) = results.pop() {
                                        ctx.state.insert_result(key, result).await;
                                    }
                                });
                            }
                            return;
                        }
                    };

                    if chunk_type == "text" && !chunk_text.is_empty() {
                        if let Ok(mut acc) = accumulated_text_clone.lock() {
                            acc.push_str(&chunk_text);
                        }
                    }
                    if !chunk_text.is_empty()
                        && should_emit_live_stream_event(
                            runner_depth,
                            LiveEventKind::AgentChunk,
                        )
                    {
                        if let Some((agent_id, agent_name)) = agent_stream_clone.as_ref() {
                            AgentEvent::AgentChunk(AgentChunkPayload {
                                chat_id: chat_id_clone.clone(),
                                spawn_id: spawn_id_clone.clone(),
                                agent_id: agent_id.clone(),
                                agent_name: agent_name.clone(),
                                delta: chunk_text.clone(),
                                r#type: chunk_type.to_string(),
                            })
                            .emit_to(events_clone.as_ref());
                        }
                    }
                    if chunk_type == "text" && !chunk_text.is_empty() {
                        if let Ok(mut det) = detector_clone.lock() {
                            det.feed(&chunk_text, &chat_id_clone);
                        }
                    }

                    if !chunk_text.is_empty()
                        && should_emit_live_stream_event(
                            runner_depth,
                            LiveEventKind::ChatChunkFirst,
                        )
                        && !first_chunk_sent_clone.swap(true, std::sync::atomic::Ordering::SeqCst)
                    {
                        AgentEvent::ChatChunkFirst(ChatChunkFirstPayload {
                            chat_id: chat_id_clone.clone(),
                            delta: chunk_text.clone(),
                            r#type: chunk_type.to_string(),
                            message_id: Some(msg_id_for_chunks.clone()),
                            sequence: Some(early_runner.peek_event_sequence()),
                        })
                        .emit_to(events_clone.as_ref());
                    }

                    let mut data = match buffer_clone.lock() {
                        Ok(guard) => guard,
                        Err(poisoned) => {
                            error!("[runner] buffer mutex poisoned, discarding buffered data");
                            // Discard the guard entirely — do not use into_inner()
                            drop(poisoned);
                            return;
                        }
                    };

                    let now = std::time::Instant::now();

                    // If type changed, flush the old type immediately
                    if data.1 != chunk_type && !data.0.is_empty() {
                        let old_text = std::mem::take(&mut data.0);
                        let old_type = data.1;
                        if should_emit_live_stream_event(
                            runner_depth,
                            LiveEventKind::ChatChunk,
                        ) {
                            AgentEvent::ChatChunk(ChatChunkPayload {
                                chat_id: chat_id_clone.clone(),
                                delta: old_text,
                                r#type: old_type.to_string(),
                                done: false,
                                message_id: Some(msg_id_for_chunks.clone()),
                                sequence: Some(early_runner.peek_event_sequence()),
                            })
                            .emit_to(events_clone.as_ref());
                        }

                        data.0.push_str(&chunk_text);
                        data.1 = chunk_type;
                        data.2 = now;
                    } else {
                        data.0.push_str(&chunk_text);
                        data.1 = chunk_type;

                        // Batch emits to prevent Tauri IPC drops
                        if now.duration_since(data.2).as_millis() > 30 {
                            let text = std::mem::take(&mut data.0);
                            let current_type = data.1;
                            data.2 = now;
                            drop(data);

                            if should_emit_live_stream_event(
                                runner_depth,
                                LiveEventKind::ChatChunk,
                            ) {
                                AgentEvent::ChatChunk(ChatChunkPayload {
                                    chat_id: chat_id_clone.clone(),
                                    delta: text,
                                    r#type: current_type.to_string(),
                                    done: false,
                                    message_id: Some(msg_id_for_chunks.clone()),
                                    sequence: Some(early_runner.peek_event_sequence()),
                                })
                                .emit_to(events_clone.as_ref());
                            }
                        }
                    }
                }),
                token,
            )
            .await;

        // Final flush
        if let Ok(mut data) = buffer.lock() {
            if !data.0.is_empty() {
                let text = std::mem::take(&mut data.0);
                let current_type = data.1;
                AgentEvent::ChatChunk(ChatChunkPayload {
                    chat_id: chat_id.to_string(),
                    delta: text,
                    r#type: current_type.to_string(),
                    done: false,
                    message_id: Some(msg_id.clone()),
                    sequence: Some(self.peek_event_sequence()),
                })
                .emit_to(self.ctx.events.as_ref());
            }
        }

        if let Ok(mut det) = detector.lock() {
            det.flush();
        }

        if let Some(handle) = placeholder_insert.take() {
            let _ = handle.await;
        }

        if result.is_err() {
            early_token.cancel();
            if let Some(ctx) = &early_tools {
                ctx.state.clear_pending().await;
            }
        }

        result.map_err(|e| e.into())
    }
}
