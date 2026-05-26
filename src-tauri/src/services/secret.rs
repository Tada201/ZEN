use std::collections::HashMap;
use std::sync::Arc;

use crate::error::AppResult;
use crate::services::{
    AuditEvent, PermissionDecision, PrivilegedOperation, SecurityService, SettingsService,
};

pub const SECRET_PRESENT_SENTINEL: &str = "__ZEN_SECRET_PRESENT__";

/// Central boundary for credential-like values.
///
/// This is intentionally separate from `SettingsService` even while the
/// transitional storage backend is still the settings table. Callers that need
/// credentials must depend on this service, not normal settings reads.
pub struct SecretService {
    settings: Arc<SettingsService>,
    security: Arc<SecurityService>,
}

impl SecretService {
    pub fn new(settings: Arc<SettingsService>, security: Arc<SecurityService>) -> Self {
        Self { settings, security }
    }

    pub async fn get_secret(&self, key: &str) -> AppResult<Option<String>> {
        let result = self.settings.get(key).await;
        self.security
            .record_audit(AuditEvent {
                operation: PrivilegedOperation::SecretRead,
                decision: PermissionDecision::Allow,
                caller: "secret_service".to_string(),
                target: Some(key.to_string()),
                reason: Some("secret read via SecretService".to_string()),
            })
            .await;
        result
    }

    pub async fn set_secret(&self, key: String, value: String) -> AppResult<()> {
        if is_secret_placeholder_write(&key, &value) {
            return Ok(());
        }

        let result = self.settings.set(key.clone(), value).await;
        self.security
            .record_audit(AuditEvent {
                operation: PrivilegedOperation::SecretWrite,
                decision: PermissionDecision::Allow,
                caller: "secret_service".to_string(),
                target: Some(key),
                reason: Some("secret write via SecretService".to_string()),
            })
            .await;
        result
    }

    pub async fn set_secrets(&self, secrets: HashMap<String, String>) -> AppResult<()> {
        let secrets: HashMap<String, String> = secrets
            .into_iter()
            .filter(|(key, value)| !is_secret_placeholder_write(key, value))
            .collect();

        let keys: Vec<String> = secrets.keys().cloned().collect();
        let result = self.settings.set_many(secrets).await;
        for key in keys {
            self.security
                .record_audit(AuditEvent {
                    operation: PrivilegedOperation::SecretWrite,
                    decision: PermissionDecision::Allow,
                    caller: "secret_service".to_string(),
                    target: Some(key),
                    reason: Some("bulk secret write via SecretService".to_string()),
                })
                .await;
        }
        result
    }
}

pub fn redact_if_secret(key: &str, value: &str) -> String {
    if value.is_empty() || !is_secret_key(key) {
        return value.to_string();
    }

    SECRET_PRESENT_SENTINEL.to_string()
}

pub fn is_secret_placeholder_write(key: &str, value: &str) -> bool {
    is_secret_key(key) && value == SECRET_PRESENT_SENTINEL
}

pub fn is_secret_key(key: &str) -> bool {
    let key = key.to_ascii_lowercase();
    key.contains("api_key")
        || key.contains("apikey")
        || key.contains("token")
        || key.contains("secret")
        || key.contains("credential")
        || key.contains("password")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_keys_are_redacted() {
        assert_eq!(
            redact_if_secret("openai_api_key", "sk-test"),
            "__ZEN_SECRET_PRESENT__"
        );
        assert_eq!(
            redact_if_secret("auth_token", "abc"),
            "__ZEN_SECRET_PRESENT__"
        );
        assert_eq!(redact_if_secret("theme", "dark"), "dark");
        assert_eq!(redact_if_secret("openai_api_key", ""), "");
    }

    #[test]
    fn secret_placeholder_writes_are_detected() {
        assert!(is_secret_placeholder_write(
            "openai_api_key",
            "__ZEN_SECRET_PRESENT__"
        ));
        assert!(!is_secret_placeholder_write("openai_api_key", "sk-new"));
        assert!(!is_secret_placeholder_write(
            "theme",
            "__ZEN_SECRET_PRESENT__"
        ));
    }
}
