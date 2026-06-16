use super::types::*;
use crate::db::models::ModelInfo;
use crate::error::{ZenError, ZenResult};
use crate::llm::openai_compat::types::*;
use tracing::{debug, info, warn};

impl super::LmStudioProvider {
    pub async fn do_list_models(&self) -> ZenResult<Vec<ModelInfo>> {
        // 1. Try v1 API first (LM Studio 0.4.0+)
        match self.list_models_v1().await {
            Ok(models) if !models.is_empty() => {
                info!(count = models.len(), "LM Studio models fetched via v1 API");
                return Ok(models);
            }
            Ok(_) => {
                debug!("LM Studio v1 API returned empty list, trying v0 fallback");
            }
            Err(e) => {
                debug!(error = %e, "LM Studio v1 API unavailable, trying v0 fallback");
            }
        }

        // 2. Try v0 API fallback
        let url = format!("{}/api/v0/models", self.base_url);
        info!(url = %url, "Fetching LM Studio models via native v0 API");

        let resp = self.client.get(&url).send().await;

        let mut models = match resp {
            Ok(r) if r.status().is_success() => {
                let body: LmStudioModelsResponse = r.json().await?;
                let results: Vec<ModelInfo> = body
                    .data
                    .into_iter()
                    .map(|m| {
                        let is_vlm = m.model_type.as_deref() == Some("vlm");
                        let has_native_tools = m
                            .arch
                            .as_deref()
                            .map(Self::arch_supports_tools)
                            .unwrap_or(false);

                        ModelInfo {
                            id: m.id.clone(),
                            name: m.id,
                            size: None,
                            modified_at: None,
                            display_name: None,
                            description: None,
                            provider: m.publisher,
                            model_type: m.model_type,
                            arch: m.arch,
                            quantization: m.quantization,
                            max_context_length: m.max_context_length,
                            state: m.state,
                            supports_vision: Some(is_vlm),
                            supports_tools: Some(has_native_tools),
                            supports_reasoning: None,
                            reasoning_config_type: None,
                        }
                    })
                    .collect();

                // Cache model → arch mapping for supports_tools() lookups
                for model in &results {
                    if let Some(arch) = &model.arch {
                        self.cache_model_arch(&model.name, arch);
                    }
                }

                results
            }
            Ok(r) => {
                warn!(status = %r.status(), "LM Studio v0 API unavailable, falling back to /v1/models");
                self.list_models_fallback().await?
            }
            Err(e) => {
                if self.base_url.contains("localhost") {
                    let alt_base = self.base_url.replace("localhost", "127.0.0.1");
                    warn!(error = %e, alt_base = %alt_base, "Failed to reach LM Studio on localhost, trying 127.0.0.1");
                    let alt_provider = Self::new(&alt_base);
                    alt_provider.list_models_fallback().await?
                } else {
                    warn!(error = %e, "Failed to reach LM Studio v0 API, trying /v1/models");
                    self.list_models_fallback().await?
                }
            }
        };

        // Sort loaded models first, then alphabetically
        models.sort_by(|a, b| {
            let a_loaded = a.state.as_deref() == Some("loaded");
            let b_loaded = b.state.as_deref() == Some("loaded");
            b_loaded.cmp(&a_loaded).then(a.name.cmp(&b.name))
        });

        info!(count = models.len(), "LM Studio models fetched");
        Ok(models)
    }

    pub async fn list_models_v1(&self) -> ZenResult<Vec<ModelInfo>> {
        let url = format!("{}/api/v1/models", self.base_url);
        let resp = self.client.get(&url).send().await?;

        if !resp.status().is_success() {
            return Err(ZenError::Custom(format!(
                "LM Studio v1 API returned {}",
                resp.status()
            )));
        }

        let body: LmStudioV1ModelsResponse = resp.json().await?;
        let results: Vec<ModelInfo> = body
            .data
            .into_iter()
            .map(|m| {
                let is_loaded = !m.loaded_instances.is_empty();
                let state = if is_loaded {
                    Some("loaded".to_string())
                } else {
                    None
                };
                let max_context = m.loaded_instances.first().and_then(|i| i.context_length);

                // In v1, arch is often part of the key or publisher.
                // We'll try to infer it for supports_tools() if not explicitly provided.
                let arch = m.key.split('/').next().map(|s| s.to_string());

                if let Some(a) = &arch {
                    self.cache_model_arch(&m.key, a);
                }

                ModelInfo {
                    id: m.key.clone(),
                    name: m.key,
                    size: m.quantization.as_ref().and_then(|q| q.size_bytes),
                    modified_at: None,
                    display_name: m.display_name,
                    description: None,
                    provider: m.publisher,
                    model_type: Some(m.model_type),
                    arch,
                    quantization: m.quantization.and_then(|q| q.name),
                    max_context_length: max_context,
                    state,
                    supports_vision: None, // Pattern based detection in frontend/runner
                    supports_tools: None,  // Inferred via arch in supports_tools()
                    supports_reasoning: None,
                    reasoning_config_type: None,
                }
            })
            .collect();

        Ok(results)
    }

    pub async fn list_models_fallback(&self) -> ZenResult<Vec<ModelInfo>> {
        let url = format!("{}/v1/models", self.base_url);
        let resp = self.client.get(&url).send().await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(ZenError::Custom(format!(
                "LM Studio returned {}: {}",
                status, body
            )));
        }

        let body: OpenAiModelsResponse = resp.json().await?;
        Ok(body
            .data
            .into_iter()
            .map(|m| ModelInfo {
                id: m.id.clone(),
                name: m.id,
                size: None,
                modified_at: None,
                display_name: None,
                description: None,
                provider: Some("lmstudio".to_string()),
                model_type: None,
                arch: None,
                quantization: None,
                max_context_length: None,
                state: None,
                supports_vision: None,
                supports_tools: None,
                supports_reasoning: None,
                reasoning_config_type: None,
            })
            .collect())
    }
}
