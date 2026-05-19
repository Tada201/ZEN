use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use sqlx::SqlitePool;
use crate::error::AppResult;

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
            let all = crate::db::queries::get_all_settings(pool).await?;
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

    pub async fn set(&self, key: String, value: String) -> AppResult<()> {
        // Always update the in-memory cache
        {
            let mut cache = self.cache.write().await;
            cache.insert(key.clone(), value.clone());
        }
        // Persist to SQLite if the pool is available
        let db = self.db_pool.read().await;
        if let Some(pool) = db.as_ref() {
            crate::db::queries::set_setting(pool, &key, &value).await?;
        }
        Ok(())
    }

    pub async fn get_all(&self) -> AppResult<HashMap<String, String>> {
        let cache = self.cache.read().await;
        Ok(cache.clone())
    }
}
