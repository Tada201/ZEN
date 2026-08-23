use sqlx::SqlitePool;
use zen_core::ZenResult;

pub(super) async fn traces(pool: &SqlitePool) -> ZenResult<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS execution_traces (
            trace_id      TEXT PRIMARY KEY,
            chat_id       TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            message_id    TEXT NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
            trace_version INTEGER NOT NULL DEFAULT 2,
            status        TEXT NOT NULL DEFAULT 'checkpoint',
            started_at    INTEGER,
            completed_at  INTEGER,
            updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
            event_count   INTEGER NOT NULL DEFAULT 0
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_execution_traces_chat ON execution_traces(chat_id, updated_at);")
        .execute(pool)
        .await.map_err(crate::db_err)?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS execution_trace_events (
            id             TEXT PRIMARY KEY,
            trace_id       TEXT NOT NULL REFERENCES execution_traces(trace_id) ON DELETE CASCADE,
            node_id        TEXT NOT NULL,
            run_id         TEXT,
            sequence       INTEGER NOT NULL,
            parent_id      TEXT,
            kind           TEXT NOT NULL,
            phase          TEXT,
            summary        TEXT NOT NULL,
            target         TEXT,
            result_summary TEXT,
            output_preview TEXT,
            agent_id       TEXT,
            agent_name     TEXT,
            safe_details_json TEXT,
            payload_json   TEXT NOT NULL,
            started_at     INTEGER,
            completed_at   INTEGER,
            duration_ms    INTEGER,
            retry_count    INTEGER,
            UNIQUE(trace_id, node_id)
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;
    // Additive migration for databases created before bounded output previews
    // became part of the canonical trace contract.
    let _ = sqlx::query("ALTER TABLE execution_trace_events ADD COLUMN run_id TEXT;")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE execution_trace_events ADD COLUMN output_preview TEXT;")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE execution_trace_events ADD COLUMN agent_id TEXT;")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE execution_trace_events ADD COLUMN agent_name TEXT;")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE execution_trace_events ADD COLUMN safe_details_json TEXT;")
        .execute(pool)
        .await;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_execution_trace_events_trace ON execution_trace_events(trace_id, sequence);")
        .execute(pool)
        .await.map_err(crate::db_err)?;
    Ok(())
}
