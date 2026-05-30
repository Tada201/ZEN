//! Auto-escalation from local to cloud models, and the LLM streaming callback wrapper.

use super::helpers::is_tool_capability_error;
use super::Runner;
use crate::agent::event_bus::{
    AgentEvent, ChatChunkFirstPayload, ChatChunkPayload, ChatErrorPayload, ChatStatusPayload,
};
use crate::db::models::ChatMessage;
use crate::db::queries;
use anyhow::Result;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;
use tracing::error;

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
                        phase: Some("tool_mode_retry".to_string()),
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
                        phase: Some("model_escalating".to_string()),
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
                                phase: Some("provider_ready".to_string()),
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
                                        phase: Some("model_escalated".to_string()),
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
                                phase: Some("provider_missing".to_string()),
                                metadata: None,
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
                    let _ = app.emit(
                        "chat:error",
                        json!({
                            "chat_id": chat_id,
                            "error": e.to_string(),
                            "recoverable": false
                        }),
                    );
                    Err(e.into())
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
    ) -> Result<crate::db::models::ChatResponse, anyhow::Error> {
        let app_clone = app.clone();
        let on_event_clone = self.on_event.clone();
        let chat_id_clone = chat_id.to_string();

        // Allocate the assistant id synchronously, but do not block first token on
        // SQLite placeholder persistence.
        let mut placeholder_insert = None;
        let msg_id = match assistant_message_id {
            Some(id) => id.clone(),
            None => {
                let id = uuid::Uuid::new_v4().to_string();
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
                        )
                        .await;
                    }));
                }
                *assistant_message_id = Some(id.clone());
                id
            }
        };

        // IPC token batching: ~20ms windows
        let first_chunk_sent = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let first_chunk_sent_clone = first_chunk_sent.clone();
        let buffer = std::sync::Arc::new(std::sync::Mutex::new((
            String::new(),
            std::time::Instant::now(),
            "text",
        )));
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
                    };

                    if chunk_type == "text" && !chunk_text.is_empty() {
                        if let Ok(mut acc) = accumulated_text_clone.lock() {
                            acc.push_str(&chunk_text);
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
                        })
                        .emit_via(&app_clone, &on_event_clone);
                    }

                    let mut data = match buffer_clone.lock() {
                        Ok(guard) => guard,
                        Err(poisoned) => {
                            error!("[runner] buffer mutex poisoned, recovering");
                            poisoned.into_inner()
                        }
                    };

                    if data.2 != chunk_type && !data.0.is_empty() {
                        let old_text = std::mem::take(&mut data.0);
                        let old_type = data.2;
                        AgentEvent::ChatChunk(ChatChunkPayload {
                            chat_id: chat_id_clone.clone(),
                            delta: old_text,
                            r#type: old_type.to_string(),
                            done: false,
                        })
                        .emit_via(&app_clone, &on_event_clone);
                        data.1 = std::time::Instant::now();
                    }

                    data.0.push_str(&chunk_text);
                    data.2 = chunk_type;

                    if data.1.elapsed().as_millis() >= 20 || data.0.len() > 1024 {
                        let text = std::mem::take(&mut data.0);
                        let current_type = data.2;
                        data.1 = std::time::Instant::now();
                        drop(data);
                        AgentEvent::ChatChunk(ChatChunkPayload {
                            chat_id: chat_id_clone.clone(),
                            delta: text,
                            r#type: current_type.to_string(),
                            done: false,
                        })
                        .emit_via(&app_clone, &on_event_clone);
                    }
                }),
                token,
            )
            .await;

        // Final flush
        {
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
                AgentEvent::ChatChunk(ChatChunkPayload {
                    chat_id: chat_id.to_string(),
                    delta: text,
                    r#type: current_type.to_string(),
                    done: false,
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
