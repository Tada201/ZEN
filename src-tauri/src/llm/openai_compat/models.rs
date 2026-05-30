use super::ModelCapabilities;
use crate::db::models::ModelInfo;
use crate::error::{ZenError, ZenResult};
use crate::llm::openai_compat::types::*;
use crate::llm::openai_compat::OpenAiCompatProvider;
use std::collections::HashMap;
use std::sync::RwLock;
use tracing::{info, warn};

impl OpenAiCompatProvider {
    fn provider_is_mixed_router(provider: &str) -> bool {
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

                // Populate capability cache for runtime lookups
                if let Ok(mut cache) = self.model_capabilities.write() {
                    cache.insert(m.id.clone(), ModelCapabilities { supports_tools });
                }
                let (supports_reasoning, reasoning_config_type) =
                    match Self::reasoning_metadata_from_parameters(supported_parameters) {
                        Some(metadata) => metadata,
                        None => reasoning_metadata(&m.id),
                    };

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
                    max_context_length: m.context_length,
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
