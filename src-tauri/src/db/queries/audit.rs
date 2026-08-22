use crate::db::models::AuditLogEntry;
use crate::error::ZenResult;
use sqlx::SqlitePool;

pub async fn init_audit_events(pool: &SqlitePool) -> ZenResult<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS audit_events (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            operation TEXT NOT NULL,
            decision TEXT NOT NULL,
            caller TEXT NOT NULL,
            target TEXT,
            reason TEXT
        )
        "#,
    )
    .execute(pool)
    .await.map_err(crate::error::db_err)?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events(timestamp DESC)",
    )
    .execute(pool)
    .await.map_err(crate::error::db_err)?;

    Ok(())
}

pub async fn add_audit_event(pool: &SqlitePool, event: &AuditLogEntry) -> ZenResult<()> {
    sqlx::query(
        "INSERT INTO audit_events (id, timestamp, operation, decision, caller, target, reason) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&event.id)
    .bind(&event.timestamp)
    .bind(&event.operation)
    .bind(&event.decision)
    .bind(&event.caller)
    .bind(&event.target)
    .bind(&event.reason)
    .execute(pool)
    .await.map_err(crate::error::db_err)?;
    Ok(())
}

pub async fn list_audit_events(pool: &SqlitePool, limit: i64) -> ZenResult<Vec<AuditLogEntry>> {
    let limit = limit.clamp(1, 500);
    let events = sqlx::query_as::<_, AuditLogEntry>(
        "SELECT * FROM audit_events ORDER BY timestamp DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(pool)
    .await.map_err(crate::error::db_err)?;
    Ok(events)
}
