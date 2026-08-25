//! Auto-escalation from local to cloud models.

use super::helpers::is_tool_capability_error;
use super::streaming::{EarlyToolExecutionContext, LlmCallbackParams};
use super::turn_persistence::persist_chat_failure;
use super::Runner;
use crate::chat_status::ChatStatusPhase;
use crate::event_bus::{AgentEvent, ChatErrorPayload, ChatStatusPayload};
use zen_db::models::ChatMessage;
use zen_db::queries;
use zen_llm::openai_compat::context_window_discovery;
use anyhow::Result;
use serde_json::json;
use tokio_util::sync::CancellationToken;


/// Parameters for calling the LLM with auto-escalation from local to cloud.
pub(super) struct EscalationParams<'a> {
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
    /// Call LLM with auto-escalation from local to cloud models.
    /// If the local model fails, automatically retry with a cloud model.
    pub(super) async fn call_llm_with_escalation(
        &self,
        assistant_message_id: &mut Option<String>,
        params: EscalationParams<'_>,
    ) -> Result<zen_db::models::ChatResponse, anyhow::Error> {
        let EscalationParams {
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
        match self
            .call_llm_with_callback(
                assistant_message_id,
                LlmCallbackParams {
                    provider,
                    model,
                    messages: messages.clone(),
                    tools: tools.clone(),
                    config: config.clone(),
                    token: token.clone(),
                    chat_id,
                    early_tools: early_tools.clone(),
                    agent_stream: agent_stream.clone(),
                },
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
                            assistant_message_id,
                            LlmCallbackParams {
                                provider,
                                model,
                                messages: messages.clone(),
                                tools: None,
                                config: config.clone(),
                                token: token.clone(),
                                chat_id,
                                early_tools: None,
                                agent_stream: agent_stream.clone(),
                            },
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

                // Phase 3.5a+: Context-length overflow → record discovery
                if context_window_discovery::is_context_length_error(&err_str) {
                    if let Some(discovered) = context_window_discovery::record_discovery(model, &err_str) {
                        tracing::info!(
                            model = %model,
                            discovered_tokens = discovered,
                            "Context window discovered from overflow error — cached for future use"
                        );
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
                    self.ctx
                        .events
                        .emit("chat:stream-reset", &json!({ "chat_id": chat_id }));
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

                    match self.get_cloud_provider_config().await {
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
                                phase: Some(ChatStatusPhase::MODEL_ESCALATED.to_string()),
                                metadata: Some(json!({
                                    "provider": cloud_config.display_name,
                                })),
                            }));

                            let cloud_provider = zen_llm::make_provider(&cloud_config);
                            let fallback_model =
                                zen_llm::default_model_for_provider(&cloud_config.provider_type);
                            // There is intentionally no hardcoded default model, so
                            // this can be empty. Sending model:"" to the cloud
                            // provider would fail the same way the local model just
                            // did — surface an actionable message instead of
                            // burning another failed request.
                            if fallback_model.trim().is_empty() {
                                tracing::warn!(
                                    provider = %cloud_config.provider_type,
                                    "Cloud escalation has no configured model; cannot retry"
                                );
                                self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
                                    chat_id: chat_id.to_string(),
                                    message: format!(
                                        "⚠️ No model selected for {} — choose one in Settings > Models to enable cloud fallback",
                                        cloud_config.display_name
                                    ),
                                    iteration: Some(0),
                                    phase: Some(ChatStatusPhase::PROVIDER_MISSING.to_string()),
                                    metadata: None,
                                }));
                                let error_text = format!(
                                    "Local model failed and no model is configured for cloud provider '{}' to escalate to. Select a model in Settings > Models.",
                                    cloud_config.display_name
                                );
                                if let Some(ref db) = self.db_pool {
                                    persist_chat_failure(
                                        db,
                                        chat_id,
                                        model,
                                        assistant_message_id,
                                        "",
                                        &error_text,
                                        false,
                                    )
                                    .await;
                                }
                                self.emit_owned_chat_error(ChatErrorPayload {
                                    chat_id: chat_id.to_string(),
                                    error: error_text,
                                    recoverable: false,
                                });
                                return Err(e);
                            }
                            tracing::info!("Retrying with cloud model: {}", fallback_model);

                            match self
                                .call_llm_with_callback(
                                    assistant_message_id,
                                    LlmCallbackParams {
                                        provider: cloud_provider.as_ref(),
                                        model: &fallback_model,
                                        messages,
                                        tools,
                                        config,
                                        token,
                                        chat_id,
                                        early_tools,
                                        agent_stream,
                                    },
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
                                    let error_text = format!("Cloud provider failed: {cloud_err}");
                                    if let Some(ref db) = self.db_pool {
                                        persist_chat_failure(
                                            db,
                                            chat_id,
                                            model,
                                            assistant_message_id,
                                            "",
                                            &error_text,
                                            true,
                                        )
                                        .await;
                                    }
                                    self.emit_owned_chat_error(ChatErrorPayload {
                                        chat_id: chat_id.to_string(),
                                        error: error_text,
                                        recoverable: true,
                                    });
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
                            let error_text = "No cloud provider configured for escalation".to_string();
                            if let Some(ref db) = self.db_pool {
                                persist_chat_failure(
                                    db,
                                    chat_id,
                                    model,
                                    assistant_message_id,
                                    "",
                                    &error_text,
                                    false,
                                )
                                .await;
                            }
                            self.emit_owned_chat_error(ChatErrorPayload {
                                chat_id: chat_id.to_string(),
                                error: error_text,
                                recoverable: false,
                            });
                            Err(e)
                        }
                    }
                } else {
                    let error_text = e.to_string();
                    if let Some(ref db) = self.db_pool {
                        persist_chat_failure(
                            db,
                            chat_id,
                            model,
                            assistant_message_id,
                            "",
                            &error_text,
                            false,
                        )
                        .await;
                    }
                    self.emit_owned_chat_error(ChatErrorPayload {
                        chat_id: chat_id.to_string(),
                        error: error_text,
                        recoverable: false,
                    });
                    Err(e)
                }
            }
        }
    }


    /// Get cloud provider configuration from settings.
    async fn get_cloud_provider_config(&self) -> Option<zen_db::models::ProviderConfig> {
        // Phase 6 seam: settings/secrets flow through the async ports
        // (same underlying services the AppState fields wrapped).
        let ctx = &self.ctx;

        let provider_name = ctx
            .settings
            .get_setting("provider")
            .await
            .ok()
            .flatten()
            .unwrap_or_else(|| "ollama".to_string());

        if !self.is_local_provider(&provider_name) {
            let base_url = ctx
                .settings
                .get_setting(&format!("{provider_name}_base_url"))
                .await
                .ok()
                .flatten()
                .unwrap_or_else(|| zen_llm::default_base_url(&provider_name));
            let api_key = ctx
                .secrets
                .get_secret(&format!("{provider_name}_api_key"))
                .await
                .ok()
                .flatten()
                .unwrap_or_default();
            return Some(zen_db::models::ProviderConfig {
                provider_type: provider_name.clone(),
                base_url,
                api_key,
                display_name: provider_name.to_uppercase(),
                headers: None,
                api_format: None,
            });
        }

        for cloud_name in ["anthropic", "openai", "groq", "openrouter"] {
            if let Some(key) = ctx
                .secrets
                .get_secret(&format!("{cloud_name}_api_key"))
                .await
                .ok()
                .flatten()
            {
                if !key.is_empty() {
                    let base_url = ctx
                        .settings
                        .get_setting(&format!("{cloud_name}_base_url"))
                        .await
                        .ok()
                        .flatten()
                        .unwrap_or_else(|| zen_llm::default_base_url(cloud_name));
                    tracing::info!("Found configured cloud provider: {}", cloud_name);
                    return Some(zen_db::models::ProviderConfig {
                        provider_type: cloud_name.to_string(),
                        base_url,
                        api_key: key,
                        display_name: cloud_name.to_uppercase(),
                        headers: None,
                        api_format: None,
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
