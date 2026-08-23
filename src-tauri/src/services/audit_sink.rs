//! App-side impl of the `zen_core::ports::AuditSink` port
//! (BIG_MIGRATION.md Phase 4: "route all audit emissions through the
//! AuditSink port; app provides impl").
//!
//! Persists port-shaped audit records into the same audit table
//! `SecurityService::record_audit` writes, so domain crates that adopt the
//! port (Phase 6 threads it via `CoreSinks`) produce rows identical in
//! shape to the service's own emissions. Field mapping is lossless:
//! `action`/`allowed`/`subject`/`detail` -> the audit table's
//! operation/decision/target/reason columns, with `caller` marked `port`.

use zen_core::ports::{AuditEvent, AuditSink};
use zen_db::models::AuditLogEntry;

pub struct ZenAuditSink {
    pool: sqlx::SqlitePool,
}

/// Shared mapping used by both audit sinks (`ZenAuditSink` and the
/// boot-time `SharedPoolAuditSink` in `agent_context.rs`).
pub(crate) fn to_entry(event: AuditEvent) -> AuditLogEntry {
    AuditLogEntry {
        id: uuid::Uuid::new_v4().to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        operation: event.action,
        decision: if event.allowed { "allow" } else { "deny" }.to_string(),
        caller: "port".to_string(),
        target: Some(event.subject),
        reason: event.detail,
    }
}

impl ZenAuditSink {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    /// Deterministic write path (also what the tests exercise).
    pub async fn record_async(&self, event: AuditEvent) {
        if let Err(e) = zen_db::queries::add_audit_event(&self.pool, &to_entry(event)).await {
            tracing::warn!(error = %e, "Failed to persist audit-sink event");
        }
    }
}

impl AuditSink for ZenAuditSink {
    fn record(&self, event: AuditEvent) {
        let entry = to_entry(event);
        let pool = self.pool.clone();
        match tokio::runtime::Handle::try_current() {
            Ok(handle) => {
                handle.spawn(async move {
                    if let Err(e) = zen_db::queries::add_audit_event(&pool, &entry).await {
                        tracing::warn!(error = %e, "Failed to persist audit-sink event");
                    }
                });
            }
            Err(no_runtime) => {
                tracing::warn!(
                    action = %entry.operation,
                    error = %no_runtime,
                    "Audit-sink event dropped: no tokio runtime on this thread"
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn port_events_persist_allow_and_deny_rows() {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
        zen_db::queries::init_audit_events(&pool).await.unwrap();

        let sink = ZenAuditSink::new(pool.clone());
        sink.record_async(AuditEvent {
            action: "tool.execute".to_string(),
            allowed: true,
            subject: "read_file".to_string(),
            detail: Some("policy allowed".to_string()),
        })
        .await;
        sink.record_async(AuditEvent {
            action: "secret.read".to_string(),
            allowed: false,
            subject: "openai_api_key".to_string(),
            detail: None,
        })
        .await;

        let events = zen_db::queries::list_audit_events(&pool, 10).await.unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].operation, "tool.execute");
        assert_eq!(events[0].decision, "allow");
        assert_eq!(events[0].caller, "port");
        assert_eq!(events[1].operation, "secret.read");
        assert_eq!(events[1].decision, "deny");
    }
}
