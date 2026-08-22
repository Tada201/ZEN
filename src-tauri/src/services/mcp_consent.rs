//! MCP connection consent store — human-in-the-loop gate for external MCP
//! servers.
//!
//! Before ZEN spawns a stdio child or opens a network connection to a
//! configured MCP server, the server's *connection-relevant* configuration is
//! fingerprinted and checked against the set of fingerprints the user has
//! explicitly approved. A server with no matching approved fingerprint is held
//! in the `AwaitingConsent` state and surfaced to the settings UI as a pending
//! approval; no process is spawned and no request is sent until the user
//! approves it.
//!
//! The gate is deliberately un-grandfathered: an empty consent file means every
//! configured server (including one saved before this feature existed) must be
//! approved once before it connects. Any change to the connection-relevant
//! config (transport, url, command, args, or the *names* of headers/env vars)
//! changes the fingerprint and re-triggers consent, because a mutated command
//! or endpoint is a different privileged operation than the one the user
//! approved.
//!
//! Approvals persist to `dirs::config_dir()/zen/mcp-consent.json`. Header and
//! env *values* are never hashed or stored here — they may be `${env:}` /
//! `${secret:}` references, and hashing them would leak nothing useful while
//! re-prompting on every secret rotation.

use crate::services::{AuditEvent, PermissionDecision, PrivilegedOperation, SecurityService};
use serde::Serialize;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::warn;

const USER_CONFIG_SUBDIR: &str = "zen";
const CONSENT_FILENAME: &str = "mcp-consent.json";
const AUDIT_CALLER: &str = "mcp_consent_store";

/// Safe, credential-free description of a server awaiting consent. Sent to the
/// settings UI so the user can see exactly what will run before approving.
/// Never carries header or env *values* — only their key names.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingConsent {
    pub name: String,
    pub scope: String,
    pub transport: String,
    /// For http: the origin (`scheme://host[:port]`). For stdio: the command.
    pub origin: String,
    /// stdio args (empty for http). Values are config-authored, not secret.
    pub args: Vec<String>,
    /// Names (not values) of configured headers/env vars, so the user can see
    /// what the server will be handed without exposing the secret references.
    pub credential_keys: Vec<String>,
    /// The fingerprint the user must approve; echoed back by `mcp_approve_server`.
    pub fingerprint: String,
}

/// Owns the set of approved connection fingerprints and the live pending set.
pub struct McpConsentStore {
    security: Arc<SecurityService>,
    /// server name → approved fingerprint. One approval per name; changing the
    /// config replaces the fingerprint that must match.
    approved: RwLock<BTreeMap<String, String>>,
    /// server name → pending consent description (rebuilt by each sync).
    pending: RwLock<BTreeMap<String, PendingConsent>>,
    path: PathBuf,
}

impl McpConsentStore {
    /// Build the store and load persisted approvals. A missing/corrupt file is
    /// treated as "nothing approved" (fails closed — every server re-prompts).
    /// Synchronous so it can be built inside the non-async `AppState::new`; the
    /// one-time approval read is a small local file.
    pub fn new(security: Arc<SecurityService>) -> Self {
        let path = dirs::config_dir()
            .map(|dir| dir.join(USER_CONFIG_SUBDIR).join(CONSENT_FILENAME))
            .unwrap_or_else(|| PathBuf::from(CONSENT_FILENAME));
        let approved = load_approved_sync(&path);
        Self {
            security,
            approved: RwLock::new(approved),
            pending: RwLock::new(BTreeMap::new()),
            path,
        }
    }

    /// Canonical fingerprint of a server's connection-relevant config. Stable
    /// across process restarts and independent of unrelated hand-authored
    /// sibling fields (timeout, disabled, description). Hashes: transport,
    /// url, command, args (ordered), and the *sorted key names* of headers and
    /// env. Header/env values are intentionally excluded.
    pub fn fingerprint(entry: &Value) -> String {
        let obj = entry.as_object().cloned().unwrap_or_default();
        let transport = if obj
            .get("type")
            .and_then(Value::as_str)
            .is_some_and(|t| t == "http")
            || obj.contains_key("url")
        {
            "http"
        } else {
            "stdio"
        };
        let url = obj.get("url").and_then(Value::as_str).unwrap_or("");
        let command = obj.get("command").and_then(Value::as_str).unwrap_or("");
        let args: Vec<&str> = obj
            .get("args")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(Value::as_str).collect())
            .unwrap_or_default();
        let header_keys = sorted_map_keys(obj.get("headers"));
        let env_keys = sorted_map_keys(obj.get("env"));

        // Length-prefixed, field-tagged canonical form so no field boundary is
        // ambiguous (e.g. args `["a", "bc"]` can't collide with `["ab", "c"]`).
        let mut hasher = Sha256::new();
        hasher.update(b"mcp-consent-v1\n");
        hash_field(&mut hasher, "transport", transport);
        hash_field(&mut hasher, "url", url);
        hash_field(&mut hasher, "command", command);
        hasher.update(format!("args:{}\n", args.len()).as_bytes());
        for arg in &args {
            hash_field(&mut hasher, "arg", arg);
        }
        for key in &header_keys {
            hash_field(&mut hasher, "header", key);
        }
        for key in &env_keys {
            hash_field(&mut hasher, "env", key);
        }
        format!("{:x}", hasher.finalize())
    }

    /// True when `name` has an approved fingerprint equal to `fingerprint`.
    pub async fn is_approved(&self, name: &str, fingerprint: &str) -> bool {
        self.approved
            .read()
            .await
            .get(name)
            .is_some_and(|approved| approved == fingerprint)
    }

    /// Record (or replace) the pending description for a server the gate is
    /// currently blocking. Called by the client's sync when consent is missing.
    pub async fn record_pending(&self, pending: PendingConsent) {
        self.pending
            .write()
            .await
            .insert(pending.name.clone(), pending);
    }

    /// Drop a server from the pending set (it connected, was removed, or was
    /// approved/denied).
    pub async fn clear_pending(&self, name: &str) {
        self.pending.write().await.remove(name);
    }

    /// Snapshot of every server currently awaiting consent.
    pub async fn list_pending(&self) -> Vec<PendingConsent> {
        self.pending.read().await.values().cloned().collect()
    }

    /// Approve `fingerprint` for `name`, persist, and audit. The next sync will
    /// connect the server. Rejects a fingerprint that doesn't match the pending
    /// entry so a stale UI can't approve config the user never saw.
    pub async fn approve(&self, name: &str, fingerprint: &str) -> Result<(), String> {
        let pending_fp = self
            .pending
            .read()
            .await
            .get(name)
            .map(|p| p.fingerprint.clone());
        match pending_fp {
            Some(expected) if expected == fingerprint => {}
            Some(_) => {
                return Err(
                    "consent fingerprint is stale; reload the server list and try again"
                        .to_string(),
                )
            }
            None => return Err(format!("no pending consent for MCP server '{}'", name)),
        }

        self.approved
            .write()
            .await
            .insert(name.to_string(), fingerprint.to_string());
        self.pending.write().await.remove(name);
        self.persist().await;
        self.audit(
            PermissionDecision::Allow,
            name,
            "user approved MCP server connection consent",
        )
        .await;
        Ok(())
    }

    /// Deny consent: revoke any prior approval for `name` and drop it from the
    /// pending set. Persists and audits so a previously-approved server that is
    /// denied stays disconnected on the next sync.
    pub async fn deny(&self, name: &str) {
        let had_approval = self.approved.write().await.remove(name).is_some();
        self.pending.write().await.remove(name);
        if had_approval {
            self.persist().await;
        }
        self.audit(
            PermissionDecision::Deny,
            name,
            "user denied MCP server connection consent",
        )
        .await;
    }

    async fn persist(&self) {
        let approved = self.approved.read().await.clone();
        let document = serde_json::json!({ "approved": approved });
        let content = match serde_json::to_string_pretty(&document) {
            Ok(text) => text,
            Err(error) => {
                warn!(%error, "mcp consent: serialize failed, approvals not persisted");
                return;
            }
        };
        if let Some(parent) = self.path.parent() {
            if let Err(error) = tokio::fs::create_dir_all(parent).await {
                warn!(%error, "mcp consent: dir create failed, approvals not persisted");
                return;
            }
        }
        if let Err(error) = tokio::fs::write(&self.path, content).await {
            warn!(%error, "mcp consent: write failed, approvals not persisted");
        }
    }

    async fn audit(&self, decision: PermissionDecision, name: &str, reason: &str) {
        self.security
            .record_audit(AuditEvent {
                operation: PrivilegedOperation::McpConnectionConsent,
                decision,
                caller: AUDIT_CALLER.to_string(),
                target: Some(format!("mcp_server:{}", name)),
                reason: Some(reason.to_string()),
            })
            .await;
    }
}

fn sorted_map_keys(value: Option<&Value>) -> Vec<String> {
    let mut keys: Vec<String> = value
        .and_then(Value::as_object)
        .map(|map| map.keys().cloned().collect())
        .unwrap_or_default();
    keys.sort();
    keys
}

fn hash_field(hasher: &mut Sha256, tag: &str, value: &str) {
    hasher.update(format!("{}:{}:", tag, value.len()).as_bytes());
    hasher.update(value.as_bytes());
    hasher.update(b"\n");
}

fn load_approved_sync(path: &PathBuf) -> BTreeMap<String, String> {
    let Ok(content) = std::fs::read_to_string(path) else {
        return BTreeMap::new();
    };
    parse_approved(&content)
}

fn parse_approved(content: &str) -> BTreeMap<String, String> {
    let Ok(document) = serde_json::from_str::<Value>(content) else {
        warn!("mcp consent: corrupt consent file, treating all servers as un-approved");
        return BTreeMap::new();
    };
    document
        .get("approved")
        .and_then(Value::as_object)
        .map(|map: &Map<String, Value>| {
            map.iter()
                .filter_map(|(name, fp)| fp.as_str().map(|fp| (name.clone(), fp.to_string())))
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprint_ignores_unrelated_fields_but_tracks_command() {
        let a = serde_json::json!({ "command": "npx", "args": ["-y", "srv"], "timeout_ms": 1000 });
        let b = serde_json::json!({ "command": "npx", "args": ["-y", "srv"], "disabled": true });
        assert_eq!(McpConsentStore::fingerprint(&a), McpConsentStore::fingerprint(&b));

        let c = serde_json::json!({ "command": "npx", "args": ["-y", "other"] });
        assert_ne!(McpConsentStore::fingerprint(&a), McpConsentStore::fingerprint(&c));
    }

    #[test]
    fn fingerprint_tracks_header_and_env_key_names_not_values() {
        let a = serde_json::json!({
            "url": "https://mcp.example/mcp",
            "headers": { "Authorization": "Bearer ${env:A}" }
        });
        let b = serde_json::json!({
            "url": "https://mcp.example/mcp",
            "headers": { "Authorization": "Bearer ${env:B}" }
        });
        // Same header key, different value ⇒ same fingerprint (values excluded).
        assert_eq!(McpConsentStore::fingerprint(&a), McpConsentStore::fingerprint(&b));

        let c = serde_json::json!({
            "url": "https://mcp.example/mcp",
            "headers": { "X-Api-Key": "${env:A}" }
        });
        // Different header key ⇒ different fingerprint.
        assert_ne!(McpConsentStore::fingerprint(&a), McpConsentStore::fingerprint(&c));
    }

    #[test]
    fn args_boundary_is_unambiguous() {
        let a = serde_json::json!({ "command": "x", "args": ["a", "bc"] });
        let b = serde_json::json!({ "command": "x", "args": ["ab", "c"] });
        assert_ne!(McpConsentStore::fingerprint(&a), McpConsentStore::fingerprint(&b));
    }

    // Build a store backed by a unique temp consent file so persistence and
    // reload round-trips don't collide with the real user config or each other.
    fn temp_store() -> (McpConsentStore, PathBuf) {
        let security = Arc::new(SecurityService::new());
        let path = std::env::temp_dir().join(format!("zen-mcp-consent-test-{}.json", uuid::Uuid::new_v4()));
        let store = McpConsentStore {
            security,
            approved: RwLock::new(BTreeMap::new()),
            pending: RwLock::new(BTreeMap::new()),
            path: path.clone(),
        };
        (store, path)
    }

    fn pending_for(name: &str, cfg: &Value) -> PendingConsent {
        PendingConsent {
            name: name.to_string(),
            scope: "workspace".to_string(),
            transport: "stdio".to_string(),
            origin: "npx".to_string(),
            args: Vec::new(),
            credential_keys: Vec::new(),
            fingerprint: McpConsentStore::fingerprint(cfg),
        }
    }

    #[tokio::test]
    async fn ungrandfathered_empty_store_approves_nothing() {
        let (store, path) = temp_store();
        let cfg = serde_json::json!({ "command": "npx", "args": ["srv"] });
        // A never-approved server (even one saved before the gate) is not approved.
        assert!(!store.is_approved("srv", &McpConsentStore::fingerprint(&cfg)).await);
        assert!(store.list_pending().await.is_empty());
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn approve_then_is_approved_and_persists() {
        let (store, path) = temp_store();
        let cfg = serde_json::json!({ "command": "npx", "args": ["srv"] });
        let fp = McpConsentStore::fingerprint(&cfg);
        store.record_pending(pending_for("srv", &cfg)).await;

        store.approve("srv", &fp).await.expect("approve should succeed");
        assert!(store.is_approved("srv", &fp).await);
        // Approving clears the pending entry.
        assert!(store.list_pending().await.is_empty());
        // Persisted to disk and reloadable across a restart.
        assert_eq!(parse_approved(&std::fs::read_to_string(&path).unwrap()).get("srv"), Some(&fp));
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn approve_rejects_stale_fingerprint() {
        let (store, path) = temp_store();
        let cfg = serde_json::json!({ "command": "npx", "args": ["srv"] });
        store.record_pending(pending_for("srv", &cfg)).await;
        // A fingerprint that doesn't match the pending entry is refused, so a
        // stale UI can't approve config the user never reviewed.
        assert!(store.approve("srv", "deadbeef").await.is_err());
        assert!(!store.is_approved("srv", "deadbeef").await);
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn approve_without_pending_is_error() {
        let (store, path) = temp_store();
        assert!(store.approve("ghost", "anyfp").await.is_err());
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn deny_revokes_prior_approval() {
        let (store, path) = temp_store();
        let cfg = serde_json::json!({ "command": "npx", "args": ["srv"] });
        let fp = McpConsentStore::fingerprint(&cfg);
        store.record_pending(pending_for("srv", &cfg)).await;
        store.approve("srv", &fp).await.unwrap();
        assert!(store.is_approved("srv", &fp).await);

        store.deny("srv").await;
        // A denied server stays disconnected on the next sync and the revocation
        // is persisted.
        assert!(!store.is_approved("srv", &fp).await);
        assert!(!parse_approved(&std::fs::read_to_string(&path).unwrap()).contains_key("srv"));
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn config_change_reprompts_via_new_fingerprint() {
        let (store, path) = temp_store();
        let cfg = serde_json::json!({ "command": "npx", "args": ["srv"] });
        let fp = McpConsentStore::fingerprint(&cfg);
        store.record_pending(pending_for("srv", &cfg)).await;
        store.approve("srv", &fp).await.unwrap();

        // Changing the command yields a different fingerprint, so the old
        // approval no longer counts — consent is required again.
        let changed = serde_json::json!({ "command": "npx", "args": ["evil"] });
        let changed_fp = McpConsentStore::fingerprint(&changed);
        assert_ne!(fp, changed_fp);
        assert!(!store.is_approved("srv", &changed_fp).await);
        let _ = std::fs::remove_file(path);
    }
}
