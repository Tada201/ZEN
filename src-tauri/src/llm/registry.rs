use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;

use crate::db::models::ProviderConfig;
use crate::error::{ZenError, ZenResult};
use crate::llm::{default_base_url, make_provider, LlmProvider};
use crate::services::{SecretService, SettingsService};

/// Cached provider instance with TTL.
struct CacheEntry {
    provider: Arc<dyn LlmProvider>,
    created: Instant,
}

/// Registry that creates [`LlmProvider`] instances from settings backed
/// by an in-memory [`SettingsService`] cache.
///
/// Consolidates the per-provider `get_setting` calls that were previously
/// duplicated inside `create_provider()`.  Adding a new provider now only
/// requires following the `{provider}_base_url` / `{provider}_api_key`
/// setting-key convention (or listing an exception in the key helpers).
pub struct ProviderRegistry {
    settings: Arc<SettingsService>,
    secrets: Arc<SecretService>,
    cache: Mutex<HashMap<String, CacheEntry>>,
}

impl ProviderRegistry {
    pub fn new(settings: Arc<SettingsService>, secrets: Arc<SecretService>) -> Self {
        Self {
            settings,
            secrets,
            cache: Mutex::new(HashMap::new()),
        }
    }

    /// Return the settings key used for the provider's API base URL.
    fn base_url_key(provider: &str) -> String {
        format!("{}_base_url", provider)
    }

    /// Return the settings key used for the provider's API key.
    fn api_key_key(provider: &str) -> String {
        let lower = provider.to_lowercase();
        crate::llm::provider_meta::PROVIDER_CATALOG
            .iter()
            .find(|p| p.name == lower)
            .and_then(|p| p.api_key_key)
            .map(|k| k.to_string())
            .unwrap_or_else(|| format!("{}_api_key", lower))
    }

    /// Build a [`ProviderConfig`] from the in-memory settings cache.
    async fn build_config(&self, provider_name: &str) -> ZenResult<ProviderConfig> {
        let p_type = provider_name.to_lowercase();
        let base_url_key = Self::base_url_key(&p_type);
        let api_key_key = Self::api_key_key(&p_type);

        let base_url = self
            .settings
            .get(&base_url_key)
            .await?
            .unwrap_or_else(|| default_base_url(&p_type));

        if base_url.is_empty()
            || (!base_url.starts_with("http://") && !base_url.starts_with("https://"))
        {
            return Err(ZenError::Custom(
                format!("Unknown provider '{}': no base URL configured. Configure '{base_url_key}' in Settings → Providers, or check the provider name.", provider_name)
            ));
        }

        let api_key = self
            .secrets
            .get_secret(&api_key_key)
            .await?
            .unwrap_or_default();
        let headers = self
            .settings
            .get(&format!("{}_headers", p_type))
            .await?
            .and_then(|value| serde_json::from_str::<HashMap<String, String>>(&value).ok());

        Ok(ProviderConfig {
            provider_type: p_type,
            base_url,
            api_key,
            display_name: provider_name.to_string(),
            headers,
        })
    }

    /// Create (or retrieve from the cache) an [`LlmProvider`] for the
    /// given provider name.  Entries expire after 60 seconds.
    pub async fn create(&self, provider_name: &str) -> ZenResult<Arc<dyn LlmProvider>> {
        {
            let cache = self.cache.lock().await;
            if let Some(entry) = cache.get(provider_name) {
                if entry.created.elapsed().as_secs() < 60 {
                    return Ok(entry.provider.clone());
                }
            }
        }

        let config = self.build_config(provider_name).await?;
        let provider = make_provider(&config);

        {
            let mut cache = self.cache.lock().await;
            cache.insert(
                provider_name.to_string(),
                CacheEntry {
                    provider: provider.clone(),
                    created: Instant::now(),
                },
            );
        }

        Ok(provider)
    }

    /// Remove a single provider from the cache.
    pub async fn invalidate(&self, provider_name: &str) {
        let mut cache = self.cache.lock().await;
        cache.remove(provider_name);
    }

    /// Clear the entire provider cache.
    pub async fn invalidate_all(&self) {
        let mut cache = self.cache.lock().await;
        cache.clear();
    }
}
