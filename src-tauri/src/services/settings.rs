use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use crate::error::AppResult;

pub struct SettingsService {
    pub cache: Arc<RwLock<HashMap<String, String>>>,
}

impl SettingsService {
    pub fn new() -> Self {
        Self {
            cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn get(&self, key: &str) -> AppResult<Option<String>> {
        let cache = self.cache.read().await;
        Ok(cache.get(key).cloned())
    }

    pub async fn set(&self, key: String, value: String) -> AppResult<()> {
        let mut cache = self.cache.write().await;
        cache.insert(key, value);
        // In a real app, we would write to SQLite here
        Ok(())
    }

    pub async fn get_all(&self) -> AppResult<HashMap<String, String>> {
        let cache = self.cache.read().await;
        Ok(cache.clone())
    }
}
