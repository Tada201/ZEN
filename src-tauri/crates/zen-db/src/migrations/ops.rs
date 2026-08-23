use sqlx::SqlitePool;
use zen_core::ZenResult;

pub(super) async fn ops_security(pool: &SqlitePool) -> ZenResult<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS tools (
            id          TEXT PRIMARY KEY,
            name        TEXT UNIQUE NOT NULL,
            enabled     INTEGER DEFAULT 1,
            config_json TEXT
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS tool_logs (
            id          TEXT PRIMARY KEY,
            tool_id     TEXT REFERENCES tools(id),
            chat_id     TEXT REFERENCES chats(id),
            input_json  TEXT,
            output_json TEXT,
            duration_ms INTEGER,
            status      TEXT CHECK(status IN ('ok','error','timeout')),
            created_at  TEXT DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS audit_events (
            id          TEXT PRIMARY KEY,
            timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
            operation   TEXT NOT NULL,
            decision    TEXT NOT NULL,
            caller      TEXT NOT NULL,
            target      TEXT,
            reason      TEXT
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events(timestamp DESC);",
    )
    .execute(pool)
    .await;
    Ok(())
}

pub(super) async fn settings(pool: &SqlitePool) -> ZenResult<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS settings (
            key         TEXT PRIMARY KEY,
            value       TEXT NOT NULL,
            updated_at  TEXT DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    // Attempt to add columns if the DB already exists from an older version
    let _ =
        sqlx::query("ALTER TABLE settings ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));")
            .execute(pool)
            .await;

    // Cleanup: remove the orphaned `memory.drift_detection_enabled` setting.
    // The field was removed from both the Rust MemoryRunSettings struct and the
    // frontend settings UI/schema/mapper — drift detection is always on now,
    // gated only by `drift_threshold`. Any row left from a prior version is
    // dead config that no code path reads. The DELETE is idempotent: if the
    // row doesn't exist (fresh install or already cleaned), it's a no-op.
    // Best-effort (`let _ =`): a transient failure must not abort the rest of
    // run_migrations, since the orphaned row is harmless and the remaining
    // table creations are required for the app to function.
    let _ = sqlx::query("DELETE FROM settings WHERE key = 'memory.drift_detection_enabled';")
        .execute(pool)
        .await;
    Ok(())
}
