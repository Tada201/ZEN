use sqlx::SqlitePool;
use zen_core::ZenResult;

pub(super) async fn automation(pool: &SqlitePool) -> ZenResult<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS zen_commands (
            id              TEXT PRIMARY KEY,
            name            TEXT UNIQUE NOT NULL,
            description     TEXT,
            allowed_tools   TEXT, -- JSON array
            instructions    TEXT,
            variables       TEXT, -- JSON array
            enabled         INTEGER DEFAULT 1
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS hooks (
            id              TEXT PRIMARY KEY,
            name            TEXT NOT NULL,
            trigger         TEXT NOT NULL,
            patterns        TEXT, -- JSON array
            enabled         INTEGER DEFAULT 1,
            trigger_count   INTEGER DEFAULT 0
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS hook_logs (
            timestamp       INTEGER NOT NULL,
            hook_id         TEXT NOT NULL REFERENCES hooks(id) ON DELETE CASCADE,
            hook_name       TEXT NOT NULL,
            trigger         TEXT NOT NULL,
            result          TEXT NOT NULL,
            message         TEXT,
            PRIMARY KEY (timestamp, hook_id)
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    // ── Hierarchical Memory Migrations ──
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS conversation_summaries (
            id            TEXT PRIMARY KEY,
            chat_id       TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            summary       TEXT NOT NULL,
            message_count INTEGER,
            token_count   INTEGER,
            created_at    TEXT DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_conversation_summaries_chat ON conversation_summaries(chat_id);"
    )
    .execute(pool)
    .await;
    Ok(())
}

pub(super) async fn message_alters(pool: &SqlitePool) -> ZenResult<()> {
    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN is_compacted INTEGER DEFAULT 0;")
        .execute(pool)
        .await;

    // Reasoning persistence: store Vec<ReasoningBlock> as JSON
    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN reasoning_details TEXT;")
        .execute(pool)
        .await;

    // Execution timeline persistence: store frontend Step[] as JSON
    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN steps_json TEXT;")
        .execute(pool)
        .await;
    Ok(())
}
