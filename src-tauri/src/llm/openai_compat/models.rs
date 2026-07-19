use super::ModelCapabilities;
use crate::db::models::ModelInfo;
use crate::error::{ZenError, ZenResult};
use crate::llm::openai_compat::context_window_discovery;
use crate::llm::openai_compat::types::*;
use crate::llm::openai_compat::OpenAiCompatProvider;
use std::collections::HashMap;
use std::sync::RwLock;
use tracing::{info, warn};

/// Infer context window from model ID when the provider API does not
/// return `context_length` (e.g. 9Router's `/v1/models`).
///
/// Pattern-based — covers the major model families. Returns `None` for
/// unrecognized IDs so the caller falls back to the compaction cap.
fn infer_context_window(model_id: &str) -> Option<u64> {
    let id = model_id.to_lowercase();

    // ── Claude (Opus 4.6+ / Sonnet 4.6+ / Sonnet 5 = 1M) ──────────
    if id.contains("claude") {
        if id.contains("opus-4-8")
            || id.contains("opus-4-7")
            || id.contains("opus-4-6")
            || id.contains("sonnet-4-6")
            || id.contains("sonnet-4-7")
            || id.contains("sonnet-5")
            || id.contains("fable")
            || id.contains("mythos")
        {
            return Some(1_000_000);
        }
        return Some(200_000);
    }

    // ── Gemini ──────────────────────────────────────────────────────
    if id.contains("gemini") {
        return Some(1_048_576);
    }

    // ── GPT ─────────────────────────────────────────────────────────
    if id.contains("gpt-5") {
        return Some(400_000);
    }
    if id.contains("gpt-4.1") {
        return Some(1_000_000);
    }
    if id.contains("gpt-4o") {
        return Some(128_000);
    }
    if id.contains("gpt-4-turbo") || id.contains("gpt-4-t") {
        return Some(128_000);
    }
    if id.contains("gpt-4") {
        return Some(128_000);
    }
    if id.contains("gpt-3.5") {
        return Some(16_384);
    }

    // ── OpenAI o-series ─────────────────────────────────────────────
    if id.starts_with("o1") || id.starts_with("o3") || id.starts_with("o4") {
        return Some(200_000);
    }

    // ── DeepSeek ────────────────────────────────────────────────────
    if id.contains("deepseek-v4") {
        return Some(1_000_000);
    }
    if id.contains("deepseek") {
        return Some(128_000);
    }

    // ── Qwen ────────────────────────────────────────────────────────
    if id.contains("qwen") && (id.contains("max") || id.contains("plus") || id.contains("coder")) {
        return Some(1_000_000);
    }
    if id.contains("qwen") {
        return Some(262_144);
    }

    // ── Grok ────────────────────────────────────────────────────────
    if id.contains("grok") {
        return Some(131_072);
    }

    // ── Llama ───────────────────────────────────────────────────────
    if id.contains("llama-4") {
        return Some(1_000_000);
    }
    if id.contains("llama") {
        return Some(128_000);
    }

    // ── Mistral ─────────────────────────────────────────────────────
    if id.contains("mistral-large") || id.contains("codestral") {
        return Some(256_000);
    }
    if id.contains("mistral") {
        return Some(128_000);
    }

    // ── Kimi ────────────────────────────────────────────────────────
    if id.contains("kimi") {
        return Some(262_144);
    }

    // ── MiniMax ─────────────────────────────────────────────────────
    if id.contains("minimax-m3") {
        return Some(1_048_576);
    }
    if id.contains("minimax") {
        return Some(200_000);
    }

    // ── GLM / Z.ai ─────────────────────────────────────────────────
    if id.contains("glm") {
        return Some(200_000);
    }

    // ── MiMo ────────────────────────────────────────────────────────
    if id.contains("mimo") && (id.contains("v2.5") || id.contains("v2-pro")) {
        return Some(1_000_000);
    }
    if id.contains("mimo") {
        return Some(256_000);
    }

    // ── Perplexity / Sonar ──────────────────────────────────────────
    if id.contains("sonar") || id.contains("perplexity") || id.contains("pplx") {
        return Some(128_000);
    }

    // ── Cohere ──────────────────────────────────────────────────────
    if id.contains("command") {
        return Some(128_000);
    }

    None
}

impl OpenAiCompatProvider {
    fn provider_is_mixed_router(provider: &str) -> bool {
        // 9router is intentionally NOT listed here. Although it aggregates a
        // mixed catalog, ~90% of its models are tool-capable cloud models, so
        // it defaults to tool support (falling through to `fallback` in
        // `tools_metadata`) rather than the conservative `false`. Per-model
        // `supported_parameters` still overrides this when 9router reports it.
        matches!(provider, "openrouter" | "together" | "perplexity")
    }

    fn parameter_supported(parameters: &[String], name: &str) -> bool {
        parameters
            .iter()
            .any(|parameter| parameter.eq_ignore_ascii_case(name))
    }

    fn tools_metadata(
        provider_lower: &str,
        supported_parameters: Option<&[String]>,
        fallback: bool,
    ) -> bool {
        if let Some(parameters) = supported_parameters {
            return Self::parameter_supported(parameters, "tools");
        }

        if Self::provider_is_mixed_router(provider_lower) {
            return false;
        }

        fallback
    }

    fn reasoning_metadata_from_parameters(
        supported_parameters: Option<&[String]>,
    ) -> Option<(Option<bool>, Option<String>)> {
        let parameters = supported_parameters?;
        if Self::parameter_supported(parameters, "reasoning_effort") {
            return Some((Some(true), Some("effort".to_string())));
        }
        if Self::parameter_supported(parameters, "reasoning") {
            return Some((Some(true), Some("budget".to_string())));
        }
        if Self::parameter_supported(parameters, "include_reasoning") {
            return Some((Some(true), Some("none".to_string())));
        }

        Some((Some(false), None))
    }

    pub async fn do_list_models(&self) -> ZenResult<Vec<ModelInfo>> {
        let provider_lower = self.provider_name.to_lowercase();

        if provider_lower == "mimo" || provider_lower == "mimo-free" {
            // Per-model context windows from MiMo official docs:
            //   mimo-v2.5-pro, mimo-v2.5, mimo-v2-pro: 1M tokens
            //   mimo-v2-omni, mimo-v2-flash: 256K tokens
            //   mimo-auto: 1M (auto-selects the best available model)
            let hardcoded_models: Vec<(&str, &str, u64)> = vec![
                ("mimo-auto", "MiMo Auto", 1_000_000),
                ("mimo-v2.5-pro", "MiMo V2.5 Pro", 1_000_000),
                ("mimo-v2.5", "MiMo V2.5", 1_000_000),
                ("mimo-v2-pro", "MiMo V2 Pro", 1_000_000),
                ("mimo-v2-omni", "MiMo V2 Omni", 256_000),
                ("mimo-v2-flash", "MiMo V2 Flash", 256_000),
            ];

            return Ok(hardcoded_models
                .into_iter()
                .map(|(id, name, ctx)| {
                    // Populate capability cache for runtime request gating
                    if let Ok(mut cache) = self.model_capabilities.write() {
                        cache.insert(
                            id.to_string(),
                            ModelCapabilities {
                                supports_tools: true,
                                supports_reasoning: true,
                            },
                        );
                    }

                    ModelInfo {
                        id: id.to_string(),
                        name: id.to_string(),
                        display_name: Some(name.to_string()),
                        description: None,
                        size: None,
                        modified_at: None,
                        provider: Some(self.provider_name.clone()),
                        model_type: None,
                        arch: None,
                        quantization: None,
                        max_context_length: Some(ctx),
                        state: None,
                        supports_vision: Some(false),
                        supports_tools: Some(true),
                        supports_reasoning: Some(true),
                        reasoning_config_type: Some("none".to_string()),
                    }
                })
                .collect());
        }

        let url = self.url("/models");
        info!(provider = %self.provider_name, url = %url, "Fetching model list");

        let resp = match self
            .send_with_retry(
                self.auth_get(&url)
                    .timeout(std::time::Duration::from_secs(30)),
            )
            .await
        {
            Ok(resp) => resp,
            Err(e) => {
                let base_str = self.base_url.read().unwrap().clone();
                if base_str.contains("localhost") {
                    let alt_base = base_str.replace("localhost", "127.0.0.1");
                    let alt_provider = Self {
                        client: self.client.clone(),
                        base_url: RwLock::new(alt_base.clone()),
                        api_key: self.api_key.clone(),
                        provider_name: self.provider_name.clone(),
                        extra_headers: self.extra_headers.clone(),
                        model_capabilities: RwLock::new(HashMap::new()),
                    };
                    let alt_url = alt_provider.url("/models");
                    warn!(error = %e, alt_url = %alt_url, "Failed to reach OpenAI-compat on localhost, trying 127.0.0.1");
                    match alt_provider
                        .send_with_retry(
                            alt_provider
                                .auth_get(&alt_url)
                                .timeout(std::time::Duration::from_secs(30)),
                        )
                        .await
                    {
                        Ok(resp) => {
                            self.update_base_url(&base_str, &alt_base);
                            resp
                        }
                        Err(_) => return Err(e),
                    }
                } else {
                    return Err(e);
                }
            }
        };

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            warn!(status = %status, body = %body, "Failed to list models");
            return Err(ZenError::Custom(format!(
                "{} returned {}: {}",
                self.provider_name, status, body
            )));
        }

        let body: OpenAiModelsResponse = resp.json().await?;

        let provider_lower = self.provider_name.to_lowercase();
        let opencode_free_model = |id: &str| {
            let id = id.to_lowercase();
            id.ends_with("-free") || id == "big-pickle" || id.contains("/big-pickle")
        };
        let reasoning_metadata = |id: &str| -> (Option<bool>, Option<String>) {
            let id = id.to_lowercase();
            match provider_lower.as_str() {
                "openai" => {
                    if id.starts_with("o1")
                        || id.starts_with("o3")
                        || id.starts_with("o4")
                        || id.starts_with("gpt-5")
                    {
                        (Some(true), Some("effort".to_string()))
                    } else {
                        (Some(false), None)
                    }
                }
                "google" | "gemini" => {
                    if id.contains("gemini-2.5") || id.contains("gemini-3") {
                        (Some(true), Some("budget".to_string()))
                    } else {
                        (Some(false), None)
                    }
                }
                "deepseek" => {
                    if id.contains("reasoner") || id.contains("r1") {
                        (Some(true), Some("none".to_string()))
                    } else {
                        (Some(false), None)
                    }
                }
                _ => (None, None),
            }
        };

        let mut models: Vec<ModelInfo> = body
            .data
            .into_iter()
            .filter(|m| {
                if provider_lower == "opencode" || provider_lower == "opencode_free" {
                    opencode_free_model(&m.id)
                } else {
                    true
                }
            })
            .map(|m| {
                let model_id_lower = m.id.to_lowercase();

                // If the API provided a human-readable name, fall back to id otherwise
                let display_name = match m.name {
                    Some(n) if !n.is_empty() => n,
                    _ => m.id.clone(),
                };

                let has_vision_keyword = model_id_lower.contains("vision")
                    || model_id_lower.contains("-vl")
                    || model_id_lower.contains("vl-")
                    || model_id_lower.contains("visual");
                let is_multimodal_family = model_id_lower.contains("claude-3")
                    || model_id_lower.contains("claude-sonnet")
                    || model_id_lower.contains("claude-opus")
                    || model_id_lower.contains("gpt-4")
                    || model_id_lower.contains("gemini")
                    || model_id_lower.contains("pixtral")
                    || model_id_lower.contains("llama-3.2-11b")
                    || model_id_lower.contains("llama-3.2-90b")
                    || model_id_lower.contains("qwen-vl")
                    || model_id_lower.contains("deepseek-vl");

                let supports_vision = has_vision_keyword || is_multimodal_family;

                let supported_parameters = m.supported_parameters.as_deref();

                // Modern direct-provider multimodal models usually support tools too.
                // Mixed routers expose heterogeneous catalogs, so require metadata there.
                let supports_tools = Self::tools_metadata(
                    &provider_lower,
                    supported_parameters,
                    !model_id_lower.contains("vision-only"),
                );

                let (supports_reasoning, reasoning_config_type) =
                    match Self::reasoning_metadata_from_parameters(supported_parameters) {
                        Some(metadata) => metadata,
                        None => reasoning_metadata(&m.id),
                    };

                // Populate capability cache for runtime request gating.
                if let Ok(mut cache) = self.model_capabilities.write() {
                    cache.insert(
                        m.id.clone(),
                        ModelCapabilities {
                            supports_tools,
                            supports_reasoning: supports_reasoning.unwrap_or(false),
                        },
                    );
                }

                ModelInfo {
                    id: m.id.clone(),
                    name: m.id.clone(),
                    display_name: Some(display_name),
                    description: m.description.clone(),
                    size: None,
                    modified_at: m.created.map(|c| c.to_string()),
                    provider: Some(self.provider_name.clone()),
                    model_type: None,
                    arch: None,
                    quantization: None,
                    max_context_length: m.context_length
                        .or_else(|| infer_context_window(&m.id))
                        .or_else(|| context_window_discovery::lookup_discovered(&m.id)),
                    state: None,
                    supports_vision: Some(supports_vision),
                    supports_tools: Some(supports_tools),
                    supports_reasoning,
                    reasoning_config_type,
                }
            })
            .collect();

        // Sort alphabetically for consistent display
        models.sort_by(|a, b| a.name.cmp(&b.name));

        info!(
            provider = %self.provider_name,
            count = models.len(),
            "Fetched models"
        );
        Ok(models)
    }
}
