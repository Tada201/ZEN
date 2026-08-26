use zen_core::error::AppResult;
use zen_security::secrets::{is_secret_placeholder_write, redact_if_secret, SECRET_PRESENT_SENTINEL};
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct SettingsService {
    pub cache: Arc<RwLock<HashMap<String, String>>>,
    db_pool: Arc<RwLock<Option<SqlitePool>>>,
}

impl SettingsService {
    pub fn new() -> Self {
        Self {
            cache: Arc::new(RwLock::new(HashMap::new())),
            db_pool: Arc::new(RwLock::new(None)),
        }
    }

    /// Set the database pool after initialization so settings can be persisted.
    pub async fn set_db_pool(&self, pool: SqlitePool) {
        let mut db = self.db_pool.write().await;
        *db = Some(pool);
    }

    /// Load all settings from SQLite into the in-memory cache.
    /// Called once at startup after the DB pool is available.
    pub async fn load_all(&self) -> AppResult<()> {
        let db = self.db_pool.read().await;
        if let Some(pool) = db.as_ref() {
            let all = zen_db::queries::get_all_settings(pool).await?;
            let mut cache = self.cache.write().await;
            for (k, v) in all {
                cache.insert(k, v);
            }
        }
        Ok(())
    }

    pub async fn get(&self, key: &str) -> AppResult<Option<String>> {
        let cache = self.cache.read().await;
        Ok(cache.get(key).cloned())
    }

    pub async fn get_public(&self, key: &str) -> AppResult<Option<String>> {
        let cache = self.cache.read().await;
        Ok(cache.get(key).map(|value| redact_if_secret(key, value)))
    }

    pub async fn set(&self, key: String, value: String) -> AppResult<()> {
        if is_secret_placeholder_write(&key, &value) {
            return Ok(());
        }

        self.set_raw(key, value).await
    }

    pub async fn set_secret_presence_metadata(&self, key: String) -> AppResult<()> {
        self.set_raw(key, SECRET_PRESENT_SENTINEL.to_string()).await
    }

    async fn set_raw(&self, key: String, value: String) -> AppResult<()> {
        // Always update the in-memory cache
        {
            let mut cache = self.cache.write().await;
            cache.insert(key.clone(), value.clone());
        }
        // Persist to SQLite if the pool is available
        let db = self.db_pool.read().await;
        if let Some(pool) = db.as_ref() {
            zen_db::queries::set_setting(pool, &key, &value).await?;
        }
        Ok(())
    }

    pub async fn set_many(&self, settings: HashMap<String, String>) -> AppResult<()> {
        let settings: HashMap<String, String> = settings
            .into_iter()
            .filter(|(key, value)| !is_secret_placeholder_write(key, value))
            .collect();

        if settings.is_empty() {
            return Ok(());
        }

        {
            let mut cache = self.cache.write().await;
            for (key, value) in &settings {
                cache.insert(key.clone(), value.clone());
            }
        }

        let db = self.db_pool.read().await;
        if let Some(pool) = db.as_ref() {
            zen_db::queries::bulk_set_settings(pool, settings).await?;
        }
        Ok(())
    }

    pub async fn get_all(&self) -> AppResult<HashMap<String, String>> {
        let cache = self.cache.read().await;
        Ok(cache.clone())
    }

    pub async fn clear(&self) -> AppResult<()> {
        if let Some(pool) = self.db_pool.read().await.as_ref() {
            zen_db::queries::clear_settings(pool).await?;
        }
        self.cache.write().await.clear();
        Ok(())
    }

    pub async fn get_all_public(&self) -> AppResult<HashMap<String, String>> {
        let cache = self.cache.read().await;
        Ok(cache
            .iter()
            .map(|(key, value)| (key.clone(), redact_if_secret(key, value)))
            .collect())
    }
}

impl Default for SettingsService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn set_many_skips_secret_placeholder_writes() {
        let service = SettingsService::new();
        service
            .set("openai_api_key".to_string(), "sk-existing".to_string())
            .await
            .unwrap();

        service
            .set_many(HashMap::from([
                (
                    "openai_api_key".to_string(),
                    "__ZEN_SECRET_PRESENT__".to_string(),
                ),
                ("theme".to_string(), "dark".to_string()),
            ]))
            .await
            .unwrap();

        assert_eq!(
            service.get("openai_api_key").await.unwrap(),
            Some("sk-existing".to_string())
        );
        assert_eq!(
            service.get("theme").await.unwrap(),
            Some("dark".to_string())
        );
    }
}
