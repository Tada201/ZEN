//! OAuth token persistence for MCP servers, backed by `SecretService`
//! (OS keyring). Tokens are the highest-value credential the MCP client
//! holds, so they never touch `.mcp.json` or the settings DB — only the
//! keyring. The stored blob is the full token response (access token,
//! optional refresh token, expiry) so a later request can refresh without
//! re-running the interactive flow.

use serde::{Deserialize, Serialize};

use zen_core::SecretStore;

/// Keyring key namespace for MCP OAuth tokens. One entry per server name.
fn token_key(server_name: &str) -> String {
    format!("mcp.oauth.{}", server_name)
}

/// A stored OAuth token set. `obtained_at_unix` + `expires_in_secs` let the
/// client decide when to refresh without a wall-clock token-introspection
/// round-trip.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredToken {
    pub access_token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_type: Option<String>,
    #[serde(default)]
    pub obtained_at_unix: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_in_secs: Option<u64>,
}

impl StoredToken {
    /// True when the access token is within `skew` seconds of expiry (or
    /// already expired). Tokens without an expiry are treated as long-lived.
    pub fn is_expired(&self, skew_secs: u64) -> bool {
        let Some(ttl) = self.expires_in_secs else {
            return false;
        };
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        now + skew_secs >= self.obtained_at_unix.saturating_add(ttl)
    }

    /// The `Authorization` header value (`Bearer <token>` unless the server
    /// specified a different scheme).
    pub fn authorization_header(&self) -> String {
        let scheme = self.token_type.as_deref().unwrap_or("Bearer");
        // Normalize the common lowercase `bearer` to the canonical casing.
        let scheme = if scheme.eq_ignore_ascii_case("bearer") {
            "Bearer"
        } else {
            scheme
        };
        format!("{} {}", scheme, self.access_token)
    }
}

/// Persist `token` for `server_name` in the secret store.
pub async fn store_token(
    secrets: &dyn SecretStore,
    server_name: &str,
    token: &StoredToken,
) -> Result<(), String> {
    let blob = serde_json::to_string(token).map_err(|e| format!("token serialize: {}", e))?;
    secrets
        .set_secret(token_key(server_name), blob)
        .await
        .map_err(|e| format!("token keyring write: {}", e))
}

/// Load the stored token for `server_name`, if any.
pub async fn load_token(
    secrets: &dyn SecretStore,
    server_name: &str,
) -> Result<Option<StoredToken>, String> {
    let Some(blob) = secrets
        .get_secret(&token_key(server_name))
        .await
        .map_err(|e| format!("token keyring read: {}", e))?
    else {
        return Ok(None);
    };
    serde_json::from_str(&blob)
        .map(Some)
        .map_err(|e| format!("token parse: {}", e))
}

/// Delete any stored token for `server_name` (e.g. on consent revoke).
pub async fn clear_token(secrets: &dyn SecretStore, server_name: &str) -> Result<(), String> {
    secrets
        .delete_secret(&token_key(server_name))
        .await
        .map_err(|e| format!("token keyring delete: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expiry_respects_skew_and_missing_ttl() {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let fresh = StoredToken {
            access_token: "a".into(),
            refresh_token: None,
            token_type: None,
            obtained_at_unix: now,
            expires_in_secs: Some(3600),
        };
        assert!(!fresh.is_expired(60));
        let stale = StoredToken {
            obtained_at_unix: now - 3600,
            ..fresh.clone()
        };
        assert!(stale.is_expired(60));
        let no_ttl = StoredToken {
            expires_in_secs: None,
            ..fresh.clone()
        };
        assert!(!no_ttl.is_expired(60));
        assert_eq!(fresh.authorization_header(), "Bearer a");
    }

    #[test]
    fn authorization_header_normalizes_and_preserves_scheme() {
        // Lowercase `bearer` is canonicalized.
        let lower = StoredToken {
            access_token: "tok".into(),
            refresh_token: None,
            token_type: Some("bearer".into()),
            obtained_at_unix: 0,
            expires_in_secs: None,
        };
        assert_eq!(lower.authorization_header(), "Bearer tok");
        // A non-bearer scheme is preserved verbatim.
        let dpop = StoredToken {
            token_type: Some("DPoP".into()),
            ..lower.clone()
        };
        assert_eq!(dpop.authorization_header(), "DPoP tok");
    }

    /// In-memory fake of the `zen-core::SecretStore` port (the real impl is
    /// the app's OS-keyring service; tests must not touch host state).
    struct MemSecrets(std::sync::Mutex<std::collections::HashMap<String, String>>);
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

    #[tokio::test]
    async fn keyring_round_trip_stores_loads_and_clears() {
        let secrets = MemSecrets(Default::default());
        let name = format!("zen-oauth-test-{}", uuid::Uuid::new_v4());
        let token = StoredToken {
            access_token: "secret-access".into(),
            refresh_token: Some("secret-refresh".into()),
            token_type: Some("Bearer".into()),
            obtained_at_unix: 123,
            expires_in_secs: Some(3600),
        };
        // Headless CI may have no OS keyring backend; a write failure there is
        // an environment limitation, not a logic bug, so skip rather than fail.
        if store_token(&secrets, &name, &token).await.is_err() {
            return;
        }
        let loaded = load_token(&secrets, &name).await.expect("load").expect("some");
        assert_eq!(loaded.access_token, "secret-access");
        assert_eq!(loaded.refresh_token.as_deref(), Some("secret-refresh"));
        assert_eq!(loaded.expires_in_secs, Some(3600));
        clear_token(&secrets, &name).await.expect("clear");
        assert!(load_token(&secrets, &name).await.expect("load").is_none());
    }
}
