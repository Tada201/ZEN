//! Lazy-initialized service wrapper shared between zen-agent and the app.
//!
//! Moved from the app crate's `commands` module in BIG_MIGRATION.md
//! Phase 11 so `AgentContext` can hold `Arc<InitState<T>>` without naming an
//! app-crate type. The app re-exports it from `crate::commands`
//! (relocation doctrine §4.6).

use tokio::sync::RwLock;

use zen_core::error::{ZenError, ZenResult};

/// Wrapper for lazy-initialized services with validation
pub struct InitState<T> {
    inner: RwLock<Option<T>>,
}

impl<T> InitState<T> {
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(None),
        }
    }

    pub async fn get(&self) -> ZenResult<T>
    where
        T: Clone,
    {
        let guard = self.inner.read().await;
        guard.as_ref().cloned().ok_or_else(|| {
            ZenError::Internal(
                "Service not initialized. Ensure initialization completed before use.".into(),
            )
        })
    }

    pub async fn set(&self, value: T) {
        let mut guard = self.inner.write().await;
        *guard = Some(value);
    }

    pub async fn is_initialized(&self) -> bool {
        self.inner.read().await.is_some()
    }
}

impl<T> Default for InitState<T> {
    fn default() -> Self {
        Self::new()
    }
}
