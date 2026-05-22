use crate::db::models::ModelInfo;
use crate::error::{ZenError, ZenResult};
use crate::llm::openai_compat::types::*;
use crate::llm::openai_compat::OpenAiCompatProvider;
use super::ModelCapabilities;
use std::collections::HashMap;
use std::sync::RwLock;
use tracing::{info, warn};

impl OpenAiCompatProvider {
    pub async fn do_list_models(&self) -> ZenResult<Vec<ModelInfo>> {
        let url = self.url("/models");
        info!(provider = %self.provider_name, url = %url, "Fetching model list");

        let resp = match self.send_with_retry(self.auth_get(&url)).await {
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
                    match alt_provider.send_with_retry(alt_provider.auth_get(&alt_url)).await {
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

        let mut models: Vec<ModelInfo> = body
            .data
            .into_iter()
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
                
                // Modern multimodal models usually support tools too.
                // We only disable tools if it's explicitly marked as a vision-only model.
                let supports_tools = !model_id_lower.contains("vision-only");

                // Populate capability cache for runtime lookups
                if let Ok(mut cache) = self.model_capabilities.write() {
                    cache.insert(
                        m.id.clone(),
                        ModelCapabilities { supports_tools },
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
                    max_context_length: m.context_length,
                    state: None,
                    supports_vision: Some(supports_vision),
                    supports_tools: Some(supports_tools),
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
