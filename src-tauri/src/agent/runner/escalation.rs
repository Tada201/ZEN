//! Auto-escalation from local to cloud models, and the LLM streaming callback wrapper.

use super::helpers::is_tool_capability_error;
use super::Runner;
use crate::agent::chat_status::ChatStatusPhase;
use crate::agent::event_bus::{
    AgentChunkPayload, AgentEvent, ChatChunkFirstPayload, ChatChunkPayload, ChatErrorPayload,
    ChatMessagePayload, ChatStatusPayload,
};
use crate::db::models::ChatMessage;
use crate::db::queries;
use anyhow::Result;
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{Mutex, Notify};
use tokio_util::sync::CancellationToken;
use tracing::error;

use crate::agent::types::{ToolCall, ToolResult};

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

impl Runner {
    /// Call LLM with auto-escalation from local to cloud models.
    /// If the local model fails, automatically retry with a cloud model.
    pub(super) async fn call_llm_with_escalation(
        &self,
        provider: &dyn crate::llm::LlmProvider,
        model: &str,
        messages: Vec<ChatMessage>,
        tools: Option<Vec<crate::tools::ToolInfo>>,
        config: crate::llm::ChatRequestConfig,
        token: CancellationToken,
        app: &AppHandle,
        chat_id: &str,
        assistant_message_id: &mut Option<String>,
        _stream_channel: Option<tauri::ipc::Channel<ChatChunkPayload>>,
        early_tools: Option<EarlyToolExecutionContext>,
        agent_stream: Option<(String, String)>,
    ) -> Result<crate::db::models::ChatResponse, anyhow::Error> {
        match self
            .call_llm_with_callback(
                provider,
                model,
                messages.clone(),
                tools.clone(),
                config.clone(),
                token.clone(),
                app,
                chat_id,
                assistant_message_id,
                early_tools.clone(),
                agent_stream.clone(),
            )
            .await
        {
            Ok(response) => {
                if response.content.trim().is_empty() {
                    tracing::warn!("Empty response from model {} - may need escalation", model);
                }
                Ok(response)
            }
            Err(e) => {
                let err_str = e.to_string();
                tracing::warn!("LLM call failed with model {}: {}", model, err_str);

                // Phase 3.5a: Tool-capability error → retry without tools
                if tools.is_some() && is_tool_capability_error(&err_str) {
                    tracing::info!(
                        "Tool-capability error detected for model {} — retrying without structured tools",
                        model
                    );
                    self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
                        chat_id: chat_id.to_string(),
                        message: "⚠️ Model doesn't support tools — retrying in text mode"
                            .to_string(),
                        iteration: Some(0),
                        phase: Some(ChatStatusPhase::TOOL_MODE_RETRY.to_string()),
                        metadata: Some(json!({
                            "model": model,
                            "toolsEnabled": false,
                        })),
                    }));

                    match self
                        .call_llm_with_callback(
                            provider,
                            model,
                            messages.clone(),
                            None,
                            config.clone(),
                            token.clone(),
                            app,
                            chat_id,
                            assistant_message_id,
                            None,
                            agent_stream.clone(),
                        )
                        .await
                    {
                        Ok(response) => {
                            tracing::info!("Text-mode retry succeeded for {}", model);
                            return Ok(response);
                        }
                        Err(text_err) => {
                            tracing::warn!(
                                "Text-mode retry also failed for {}: {} — proceeding to escalation",
                                model,
                                text_err
                            );
                        }
                    }
                }

                // Phase 3.5b: Auto-escalation to cloud
                let auto_escalate = if let Some(pool) = &self.db_pool {
                    queries::get_setting(pool, "auto_escalate")
                        .await
                        .ok()
                        .flatten()
                        .map(|v| v == "true")
                        .unwrap_or(true)
                } else {
                    true
                };

                let should_escalate = auto_escalate && self.should_escalate_to_cloud(model);

                if should_escalate {
                    tracing::info!("Auto-escalating to cloud model...");
                    let _ = app.emit("chat:stream-reset", json!({ "chat_id": chat_id }));
                    self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
                        chat_id: chat_id.to_string(),
                        message: "⚡ Local model unavailable - escalating to cloud model"
                            .to_string(),
                        iteration: Some(0),
                        phase: Some(ChatStatusPhase::MODEL_ESCALATING.to_string()),
                        metadata: Some(json!({
                            "model": model,
                        })),
                    }));

                    match self.get_cloud_provider_config(app).await {
                        Some(cloud_config) => {
                            tracing::info!(
                                "Cloud provider configured: {}",
                                cloud_config.display_name
                            );
                            self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
                                chat_id: chat_id.to_string(),
                                message: format!(
                                    "☁️ Using {} for reliable response",
                                    cloud_config.display_name
                                ),
                                iteration: Some(0),
                                phase: Some(ChatStatusPhase::PROVIDER_READY.to_string()),
                                metadata: Some(json!({
                                    "provider": cloud_config.display_name,
                                })),
                            }));

                            let cloud_provider = crate::llm::make_provider(&cloud_config);
                            let fallback_model =
                                crate::llm::default_model_for_provider(&cloud_config.provider_type);
                            tracing::info!("Retrying with cloud model: {}", fallback_model);

                            match self
                                .call_llm_with_callback(
                                    cloud_provider.as_ref(),
                                    &fallback_model,
                                    messages,
                                    tools,
                                    config,
                                    token,
                                    app,
                                    chat_id,
                                    assistant_message_id,
                                    early_tools,
                                    agent_stream,
                                )
                                .await
                            {
                                Ok(response) => {
                                    tracing::info!(
                                        "Cloud escalation succeeded with {}",
                                        fallback_model
                                    );
                                    self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
                                        chat_id: chat_id.to_string(),
                                        message: "✅ Cloud provider succeeded".to_string(),
                                        iteration: Some(0),
                                        phase: Some(ChatStatusPhase::MODEL_ESCALATED.to_string()),
                                        metadata: Some(json!({
                                            "model": fallback_model,
                                        })),
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
                                    Err(e)
                                }
                            }
                        }
                        None => {
                            tracing::warn!("No cloud provider configured - cannot escalate");
                            self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
                                chat_id: chat_id.to_string(),
                                message: "⚠️ No cloud provider configured - add API key in Settings > Providers".to_string(),
                                iteration: Some(0),
                                phase: Some(ChatStatusPhase::PROVIDER_MISSING.to_string()),
                                metadata: None,
                            }));
                            self.emit(AgentEvent::ChatError(ChatErrorPayload {
                                chat_id: chat_id.to_string(),
                                error: "No cloud provider configured for escalation".to_string(),
                                recoverable: false,
                            }));
                            Err(e)
                        }
                    }
                } else {
                    let _ = app.emit(
                        "chat:error",
                        json!({
                            "chat_id": chat_id,
                            "error": e.to_string(),
                            "recoverable": false
                        }),
                    );
                    Err(e)
                }
            }
        }
    }

    /// Helper to call LLM with standard chunk emission callback and 20ms IPC batching.
    pub(super) async fn call_llm_with_callback(
        &self,
        provider: &dyn crate::llm::LlmProvider,
        model: &str,
        messages: Vec<ChatMessage>,
        tools: Option<Vec<crate::tools::ToolInfo>>,
        config: crate::llm::ChatRequestConfig,
        token: CancellationToken,
        app: &AppHandle,
        chat_id: &str,
        assistant_message_id: &mut Option<String>,
        early_tools: Option<EarlyToolExecutionContext>,
        agent_stream: Option<(String, String)>,
    ) -> Result<crate::db::models::ChatResponse, anyhow::Error> {
        let app_clone = app.clone();
        let on_event_clone = self.on_event.clone();
        let chat_id_clone = chat_id.to_string();
        let agent_stream_clone = agent_stream.clone();
        let early_runner = self.clone();
        let early_tools_clone = early_tools.clone();
        let early_token = token.child_token();
        let early_token_for_callback = early_token.clone();

        // Allocate the assistant id synchronously, but do not block first token on
        // SQLite placeholder persistence.
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
                .emit_via(&app_clone, &on_event_clone);
                if let Some(db) = self.db_pool.clone() {
                    let chat_id = chat_id.to_string();
                    let model = model.to_string();
                    let id_for_insert = id.clone();
                    placeholder_insert = Some(tokio::spawn(async move {
                        let _ = queries::add_message(
                            &db,
                            &chat_id,
                            Some(&id_for_insert),
                            "assistant",
                            "",
                            Some(&model),
                            false,
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                        )
                        .await;
                    }));
                }
                *assistant_message_id = Some(id.clone());
                id
            }
        };

        let first_chunk_sent = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let first_chunk_sent_clone = first_chunk_sent.clone();
        // Text buffer: accumulates delta text and emits on every chunk (frontend rAF batches).
        let buffer = std::sync::Arc::new(std::sync::Mutex::new((String::new(), "text")));
        let buffer_clone = buffer.clone();

        // Shared accumulated text for periodic checkpoint saves
        let accumulated_text = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
        let accumulated_text_clone = accumulated_text.clone();

        // Artifact detector for <nexus_artifact> tag lifecycle events
        let detector = std::sync::Arc::new(std::sync::Mutex::new(
            crate::agent::event_bus::StreamingArtifactDetector::new({
                let app = app_clone.clone();
                let on_event = on_event_clone.clone();
                move |ev| {
                    ev.emit_via(&app, &on_event);
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
                    use crate::llm::LlmChunk;
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
                            .emit_via(&app_clone, &on_event_clone);
                            return;
                        }
                        LlmChunk::ToolCallReady {
                            index,
                            id,
                            name,
                            arguments,
                        } => {
                            let safe_arguments = redact_tool_preview_args(&arguments);
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
                                        "argumentsPreview": safe_arguments,
                                        "ready": true,
                                    }
                                })),
                            })
                            .emit_via(&app_clone, &on_event_clone);
                            if let Some(ctx) = early_tools_clone.clone() {
                                let key = EarlyToolExecutionState::key_for(
                                    &name,
                                    &arguments,
                                    id.as_deref(),
                                    Some(index),
                                );
                                let runner = early_runner.clone();
                                let token = early_token_for_callback.clone();
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
                    if !chunk_text.is_empty() {
                        if let Some((agent_id, agent_name)) = agent_stream_clone.as_ref() {
                            AgentEvent::AgentChunk(AgentChunkPayload {
                                chat_id: chat_id_clone.clone(),
                                agent_id: agent_id.clone(),
                                agent_name: agent_name.clone(),
                                delta: chunk_text.clone(),
                                r#type: chunk_type.to_string(),
                            })
                            .emit_via(&app_clone, &on_event_clone);
                        }
                    }
                    if chunk_type == "text" && !chunk_text.is_empty() {
                        if let Ok(mut det) = detector_clone.lock() {
                            det.feed(&chunk_text, &chat_id_clone);
                        }
                    }

                    if !chunk_text.is_empty()
                        && !first_chunk_sent_clone.swap(true, std::sync::atomic::Ordering::SeqCst)
                    {
                        AgentEvent::ChatChunkFirst(ChatChunkFirstPayload {
                            chat_id: chat_id_clone.clone(),
                            delta: chunk_text.clone(),
                            r#type: chunk_type.to_string(),
                            message_id: Some(msg_id_for_chunks.clone()),
                        })
                        .emit_via(&app_clone, &on_event_clone);
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

                    // If type changed, flush the old type immediately
                    if data.1 != chunk_type && !data.0.is_empty() {
                        let old_text = std::mem::take(&mut data.0);
                        let old_type = data.1;
                        AgentEvent::ChatChunk(ChatChunkPayload {
                            chat_id: chat_id_clone.clone(),
                            delta: old_text,
                            r#type: old_type.to_string(),
                            done: false,
                            message_id: Some(msg_id_for_chunks.clone()),
                        })
                        .emit_via(&app_clone, &on_event_clone);
                    }

                    data.0.push_str(&chunk_text);
                    data.1 = chunk_type;

                    // Emit immediately — frontend rAF handles batching
                    let text = std::mem::take(&mut data.0);
                    let current_type = data.1;
                    drop(data);
                    AgentEvent::ChatChunk(ChatChunkPayload {
                        chat_id: chat_id_clone.clone(),
                        delta: text,
                        r#type: current_type.to_string(),
                        done: false,
                        message_id: Some(msg_id_for_chunks.clone()),
                    })
                    .emit_via(&app_clone, &on_event_clone);
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
                    message_id: Some(msg_id.to_string()),
                })
                .emit_via(app, &self.on_event);
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

    /// Get cloud provider configuration from settings.
    async fn get_cloud_provider_config(
        &self,
        app: &AppHandle,
    ) -> Option<crate::db::models::ProviderConfig> {
        let state = app.state::<crate::commands::AppState>();

        let provider_name = state
            .settings_manager
            .get("provider")
            .await
            .ok()
            .flatten()
            .unwrap_or_else(|| "ollama".to_string());

        if !self.is_local_provider(&provider_name) {
            let base_url = state
                .settings_manager
                .get(&format!("{}_base_url", provider_name))
                .await
                .ok()
                .flatten()
                .unwrap_or_else(|| crate::llm::default_base_url(&provider_name));
            let api_key = state
                .secret_manager
                .get_secret(&format!("{}_api_key", provider_name))
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

        for cloud_name in ["anthropic", "openai", "groq", "openrouter"] {
            if let Some(key) = state
                .secret_manager
                .get_secret(&format!("{}_api_key", cloud_name))
                .await
                .ok()
                .flatten()
            {
                if !key.is_empty() {
                    let base_url = state
                        .settings_manager
                        .get(&format!("{}_base_url", cloud_name))
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

        None
    }

    /// Determine if we should escalate from local to cloud model.
    fn should_escalate_to_cloud(&self, current_model: &str) -> bool {
        let model_lower = current_model.to_lowercase();
        let is_local = model_lower.contains("ollama")
            || model_lower.contains("lmstudio")
            || model_lower.contains("llama")
            || model_lower.contains("mistral")
            || model_lower.contains("gemma")
            || model_lower.contains("phi");
        let is_unstable_free = model_lower.contains(":free")
            || model_lower.contains("/free")
            || model_lower.contains("free-");
        is_local || is_unstable_free
    }

    /// Check if a provider name refers to a local provider.
    fn is_local_provider(&self, provider_name: &str) -> bool {
        let name = provider_name.to_lowercase();
        name == "ollama" || name == "lmstudio" || name.contains("local")
    }
}
