use sqlx::SqlitePool;
use zen_core::ZenResult;

pub(super) async fn graphs_canvas(pool: &SqlitePool) -> ZenResult<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS graph_sessions (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            nodes TEXT NOT NULL DEFAULT '[]',
            edges TEXT NOT NULL DEFAULT '[]',
            metadata TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_graph_sessions_chat ON graph_sessions(chat_id);",
    )
    .execute(pool)
    .await;

    // ── Drawing Canvases ──
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS drawing_canvases (
            id              TEXT PRIMARY KEY,
            chat_id         TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            name            TEXT NOT NULL DEFAULT 'Canvas',
            objects         TEXT NOT NULL DEFAULT '[]',  -- JSON array of drawing objects
            background      TEXT DEFAULT '#050505',
            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_drawing_canvases_chat ON drawing_canvases(chat_id);",
    )
    .execute(pool)
    .await;
    Ok(())
}
