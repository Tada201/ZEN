//! Capability surface of OpenAiCompatProvider: embeddings, health checks,
//! tool support and reasoning metadata. Moved out of stream.rs during the
//! Phase 7 crate extraction.

use std::collections::HashMap;
use std::sync::RwLock;

use tracing::debug;

use super::types::{OpenAiEmbedRequest, OpenAiEmbedResponse};
use super::OpenAiCompatProvider;
use zen_core::{ZenError, ZenResult};

impl OpenAiCompatProvider {
    pub async fn do_embed(&self, model: &str, text: &str) -> ZenResult<Vec<f32>> {
        let url = self.url("/embeddings");
        let request = OpenAiEmbedRequest {
            model: model.to_string(),
            input: text.to_string(),
        };

        let resp = self
            .auth_post(&url)
            .json(&request)
            .timeout(std::time::Duration::from_secs(60))
            .send()
            .await.map_err(crate::util::http_err)?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(ZenError::Custom(format!(
                "Embedding failed ({status}): {body}"
            )));
        }

        let body: OpenAiEmbedResponse = resp.json().await.map_err(crate::util::http_err)?;
        body.data
            .into_iter()
            .next()
            .map(|d| d.embedding)
            .ok_or_else(|| ZenError::Custom("No embedding returned".into()))
    }

    pub async fn do_health_check(&self) -> bool {
        let url = self.url("/models");
        match self
            .auth_get(&url)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
        {
            Ok(resp) => resp.status().is_success(),
            Err(_) => {
                let base_str = match self.base_url.read() {
                    Ok(guard) => guard.clone(),
                    Err(poisoned) => poisoned.into_inner().clone(),
                };
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
                    debug!(url = %alt_url, "Trying 127.0.0.1 fallback for health check");
                    if let Ok(resp) = alt_provider
                        .auth_get(&alt_url)
                        .timeout(std::time::Duration::from_secs(10))
                        .send()
                        .await
                    {
                        if resp.status().is_success() {
                            self.update_base_url(&base_str, &alt_base);
                            return true;
                        }
                    }
                }
                false
            }
        }
    }

    pub fn do_supports_tools(&self, model: &str) -> bool {
        // 1. Check capability cache from list_models()
        if let Ok(cache) = self.model_capabilities.read() {
            if let Some(caps) = cache.get(model) {
                return caps.supports_tools;
            }
        }

        // 2. Provider-level policy for unknown models
        self.provider_tool_policy()
    }

    /// Resolve reasoning capability at request time. Prefer the cache populated
    /// by `list_models()`; if the model is cold, fall back to the resolver with
    /// no metadata (registry/heuristics keyed by provider+id).
    pub fn do_reasoning_capability(&self, model: &str) -> crate::ReasoningCapability {
        if let Ok(cache) = self.model_capabilities.read() {
            if let Some(caps) = cache.get(model) {
                return caps.reasoning.clone();
            }
        }
        crate::reasoning::resolver::resolve(
            &self.provider_name.to_lowercase(),
            model,
            &crate::reasoning::resolver::RawReasoningMetadata::default(),
        )
    }
}

impl OpenAiCompatProvider {
    /// Provider-level default policy for tool support.
    /// Used as a fallback when the model is not in the capability cache.
    pub(crate) fn provider_tool_policy(&self) -> bool {
        let p = self.provider_name.to_lowercase();
        match p.as_str() {
            // Curated / official catalogs — all models support tools.
            // 9router is included: its catalog is mostly tool-capable cloud
            // models, so it defaults to tools on even when the per-model
            // capability cache is cold (e.g. after the 60s provider TTL).
            "openai" | "groq" | "mistral" | "gemini" | "google" | "deepseek" | "qwen" | "xai"
            | "kilocode" | "opencode" | "opencode_free" | "nvidia" | "nine_router"
            | "nine-router" | "n9router" | "9router" => true,

            // Mixed catalogs — many models lack tool support
            "openrouter" | "together" | "perplexity" => false,

            // Default: conservative (don't assume tools work)
            _ => false,
        }
    }
}