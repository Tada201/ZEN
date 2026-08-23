//! Port traits (seams) that domain code depends on instead of reaching up
//! into the app crate (BIG_MIGRATION.md Phase 2 defines; Phase 6 adopts).
//!
//! Only the shapes live here. The app crate implements these over Tauri
//! (`EventSink` wraps `AppHandle::emit`), keyring (`SecretStore`), the
//! settings service (`SettingsStore`), and the audit trail (`AuditSink`),
//! and threads them through domain constructors as `AgentContext` in
//! Phase 6. Event payloads crossing `EventSink` must remain byte-identical
//! to today's frontend contract (risk R5).

use serde_json::Value;

use crate::error::ZenResult;

/// Emits a named backend event to the UI. The app impl bridges to the Tauri
/// emitter; event names and payload shapes are the frontend contract.
pub trait EventSink: Send + Sync {
    fn emit(&self, event: &str, payload: &Value);
}

/// Secret material access (API keys, tokens). The app impl wraps the
/// OS-keyring-backed `SecretService`; secrets never travel through settings.
///
/// Async (Phase 6 re-scope): the real service awaits keyring + audit I/O;
/// a synchronous port would force blocking calls inside async domain paths,
/// which is a behavior change. Shape mirrors `SecretService` 1:1.
#[async_trait::async_trait]
pub trait SecretStore: Send + Sync {
    async fn get_secret(&self, key: &str) -> ZenResult<Option<String>>;
    async fn set_secret(&self, key: String, value: String) -> ZenResult<()>;
    async fn delete_secret(&self, key: &str) -> ZenResult<()>;
}

/// Non-secret preference access. The app impl wraps `SettingsService`.
///
/// Async (Phase 6 re-scope): mirrors `SettingsService::{get,set}` which await
/// the SQLite pool. String-shaped (not `Value`) so adapter mapping is lossless.
#[async_trait::async_trait]
pub trait SettingsStore: Send + Sync {
    async fn get_setting(&self, key: &str) -> ZenResult<Option<String>>;
    async fn set_setting(&self, key: String, value: String) -> ZenResult<()>;
}

/// A privileged-operation audit record. Emitted for every
/// allow/deny decision on a privileged path (RULES.md security contract).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AuditEvent {
    /// Short action code, e.g. "tool.execute", "secret.read".
    pub action: String,
    /// Whether the privileged action was allowed (false = denied/malformed).
    pub allowed: bool,
    /// What the action targeted (tool id, path, provider, ...).
    pub subject: String,
    /// Optional human-readable context; must never contain secret material
    /// or full provider response bodies.
    pub detail: Option<String>,
}

/// Records privileged-operation audit events. The app impl persists via the
/// security service's audit trail.
pub trait AuditSink: Send + Sync {
    fn record(&self, event: AuditEvent);
}

/// The bundle of port implementations domain code will receive instead of
/// `AppState` (BIG_MIGRATION.md Phase 6 names and threads this as
/// `AgentContext`; Phase 2 only fixes the sink shapes so upper crates can
/// compile against them from day one).
#[derive(Clone)]
pub struct CoreSinks {
    pub events: std::sync::Arc<dyn EventSink>,
    pub secrets: std::sync::Arc<dyn SecretStore>,
    pub settings: std::sync::Arc<dyn SettingsStore>,
    pub audit: std::sync::Arc<dyn AuditSink>,
}
