//! Shared in-crate test fakes for the zen-core store ports.

use zen_core::SecretStore;

/// In-memory fake of the `SecretStore` port (the real impl is the app's
/// OS-keyring service; tests must not touch host state).
pub struct MemSecrets(pub std::sync::Mutex<std::collections::HashMap<String, String>>);

impl MemSecrets {
    pub fn new() -> Self {
        Self(Default::default())
    }
}

impl Default for MemSecrets {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl SecretStore for MemSecrets {
    async fn get_secret(&self, key: &str) -> zen_core::ZenResult<Option<String>> {
        Ok(self.0.lock().unwrap().get(key).cloned())
    }
    async fn set_secret(&self, key: String, value: String) -> zen_core::ZenResult<()> {
        self.0.lock().unwrap().insert(key, value);
        Ok(())
    }
    async fn delete_secret(&self, key: &str) -> zen_core::ZenResult<()> {
        self.0.lock().unwrap().remove(key);
        Ok(())
    }
}
