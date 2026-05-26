use std::collections::HashMap;
use std::sync::Arc;

use crate::error::{AppResult, ZenError};
use crate::services::{
    is_secret_key, is_secret_placeholder_write, AuditEvent, PermissionDecision,
    PrivilegedOperation, SecurityService, SettingsService, SECRET_PRESENT_SENTINEL,
};

const KEYRING_SERVICE: &str = "zen";

/// Central boundary for credential-like values.
///
/// This is intentionally separate from `SettingsService`. Raw credential values
/// are stored in the OS keyring; normal settings only store presence metadata.
pub struct SecretService {
    settings: Arc<SettingsService>,
    security: Arc<SecurityService>,
}

impl SecretService {
    pub fn new(settings: Arc<SettingsService>, security: Arc<SecurityService>) -> Self {
        Self { settings, security }
    }

    pub async fn get_secret(&self, key: &str) -> AppResult<Option<String>> {
        let result = match keyring_entry(key)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(keyring_error("read", key, e)),
        };
        self.security
            .record_audit(AuditEvent {
                operation: PrivilegedOperation::SecretRead,
                decision: audit_decision(&result),
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

        let result = if value.is_empty() {
            self.delete_secret_value(&key).await
        } else {
            self.write_secret_value(&key, &value).await
        };
        self.security
            .record_audit(AuditEvent {
                operation: PrivilegedOperation::SecretWrite,
                decision: audit_decision(&result),
                caller: "secret_service".to_string(),
                target: Some(key),
                reason: Some("secret write via SecretService".to_string()),
            })
            .await;
        result
    }

    pub async fn set_secrets(&self, secrets: HashMap<String, String>) -> AppResult<()> {
        for (key, value) in secrets {
            if is_secret_placeholder_write(&key, &value) {
                continue;
            }

            let result = if value.is_empty() {
                self.delete_secret_value(&key).await
            } else {
                self.write_secret_value(&key, &value).await
            };
            self.security
                .record_audit(AuditEvent {
                    operation: PrivilegedOperation::SecretWrite,
                    decision: audit_decision(&result),
                    caller: "secret_service".to_string(),
                    target: Some(key),
                    reason: Some("bulk secret write via SecretService".to_string()),
                })
                .await;
            result?;
        }
        Ok(())
    }

    pub async fn delete_secret(&self, key: &str) -> AppResult<()> {
        let result = self.delete_secret_value(key).await;
        self.security
            .record_audit(AuditEvent {
                operation: PrivilegedOperation::SecretWrite,
                decision: audit_decision(&result),
                caller: "secret_service".to_string(),
                target: Some(key.to_string()),
                reason: Some("secret delete via SecretService".to_string()),
            })
            .await;
        result
    }

    pub async fn has_secret(&self, key: &str) -> AppResult<bool> {
        Ok(self.get_secret(key).await?.is_some())
    }

    pub async fn migrate_plaintext_settings_to_keyring(&self) -> AppResult<usize> {
        let settings = self.settings.get_all().await?;
        let mut migrated = 0;

        for (key, value) in settings {
            if !is_secret_key(&key) || value.is_empty() || value == SECRET_PRESENT_SENTINEL {
                continue;
            }

            keyring_entry(&key)?
                .set_password(&value)
                .map_err(|e| keyring_error("migrate", &key, e))?;
            self.settings
                .set_secret_presence_metadata(key.clone())
                .await?;
            migrated += 1;

            self.security
                .record_audit(AuditEvent {
                    operation: PrivilegedOperation::SecretWrite,
                    decision: PermissionDecision::Allow,
                    caller: "secret_service".to_string(),
                    target: Some(key),
                    reason: Some("migrated plaintext setting to OS keyring".to_string()),
                })
                .await;
        }

        Ok(migrated)
    }

    async fn write_secret_value(&self, key: &str, value: &str) -> AppResult<()> {
        keyring_entry(key)?
            .set_password(value)
            .map_err(|e| keyring_error("write", key, e))?;
        self.settings
            .set_secret_presence_metadata(key.to_string())
            .await
    }

    async fn delete_secret_value(&self, key: &str) -> AppResult<()> {
        match keyring_entry(key)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {
                self.settings.set(key.to_string(), String::new()).await
            }
            Err(e) => Err(keyring_error("delete", key, e)),
        }
    }
}

fn keyring_entry(key: &str) -> AppResult<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, key).map_err(|e| keyring_error("open", key, e))
}

fn keyring_error(operation: &str, key: &str, error: keyring::Error) -> ZenError {
    ZenError::Internal(format!(
        "Failed to {operation} secret '{key}' in OS keyring: {error}"
    ))
}

fn audit_decision<T>(result: &AppResult<T>) -> PermissionDecision {
    if result.is_ok() {
        PermissionDecision::Allow
    } else {
        PermissionDecision::Deny
    }
}

#[cfg(test)]
mod tests {
    use crate::services::{is_secret_placeholder_write, redact_if_secret, SECRET_PRESENT_SENTINEL};

    #[test]
    fn secret_keys_are_redacted() {
        assert_eq!(
            redact_if_secret("openai_api_key", "sk-test"),
            SECRET_PRESENT_SENTINEL
        );
        assert_eq!(
            redact_if_secret("auth_token", "abc"),
            SECRET_PRESENT_SENTINEL
        );
        assert_eq!(redact_if_secret("theme", "dark"), "dark");
        assert_eq!(redact_if_secret("openai_api_key", ""), "");
    }

    #[test]
    fn secret_placeholder_writes_are_detected() {
        assert!(is_secret_placeholder_write(
            "openai_api_key",
            SECRET_PRESENT_SENTINEL
        ));
        assert!(!is_secret_placeholder_write("openai_api_key", "sk-new"));
        assert!(!is_secret_placeholder_write(
            "theme",
            SECRET_PRESENT_SENTINEL
        ));
    }
}
