//! Port-adapter impls: `zen-core` store seams implemented by the app's
//! concrete services (BIG_MIGRATION.md Phase 7).
//!
//! `ProviderRegistry` (now in zen-llm) consumes the async `SecretStore` /
//! `SettingsStore` traits; these blanket impls let the app hand its existing
//! `Arc<SecretService>` / `Arc<SettingsService>` straight to
//! `ProviderRegistry::new` with zero call-site churn. The agent-core port
//! wrappers in `agent_context.rs` delegate to the same services.

use async_trait::async_trait;
use zen_core::{SecretStore, SettingsStore, ZenResult};

use crate::services::{SecretService, SettingsService};

#[async_trait]
impl SecretStore for SecretService {
    async fn get_secret(&self, key: &str) -> ZenResult<Option<String>> {
        self.get_secret(key).await
    }

    async fn set_secret(&self, key: String, value: String) -> ZenResult<()> {
        self.set_secret(key, value).await
    }

    async fn delete_secret(&self, key: &str) -> ZenResult<()> {
        self.delete_secret(key).await
    }
}

#[async_trait]
impl SettingsStore for SettingsService {
    async fn get_setting(&self, key: &str) -> ZenResult<Option<String>> {
        Ok(self.get(key).await?)
    }

    async fn set_setting(&self, key: String, value: String) -> ZenResult<()> {
        Ok(self.set(key, value).await?)
    }
}
