use sqlx::SqlitePool;
use zen_core::ZenResult;

pub(super) async fn core_tables(pool: &SqlitePool) -> ZenResult<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS chats (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL DEFAULT 'New Chat',
            model       TEXT,
            created_at  TEXT DEFAULT (datetime('now')),
            updated_at  TEXT DEFAULT (datetime('now')),
            pinned      INTEGER DEFAULT 0,
            workspace_root TEXT
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    // Attempt to add columns if the DB already exists from an older version
    let _ = sqlx::query("ALTER TABLE chats ADD COLUMN pinned INTEGER DEFAULT 0;")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE chats ADD COLUMN workspace_root TEXT;")
        .execute(pool)
        .await;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS messages (
            id           TEXT PRIMARY KEY,
            chat_id      TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            role         TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
            content      TEXT NOT NULL,
            tokens_in    INTEGER,
            tokens_out   INTEGER,
            model        TEXT,
            is_complete  INTEGER DEFAULT 1,
            tool_calls   TEXT,
            tool_call_id TEXT,
            images       TEXT,
            attachments  TEXT,
            kind         TEXT DEFAULT 'text',
            metadata     TEXT,
            created_at   TEXT DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    // Attempt to add columns if the DB already exists from an older version
    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN tokens_in INTEGER;")
        .execute(pool)
        .await;

    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN tokens_out INTEGER;")
        .execute(pool)
        .await;

    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN model TEXT;")
        .execute(pool)
        .await;

    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN tool_calls TEXT;")
        .execute(pool)
        .await;

    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN tool_call_id TEXT;")
        .execute(pool)
        .await;

    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN images TEXT;")
        .execute(pool)
        .await;

    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN attachments TEXT;")
        .execute(pool)
        .await;

    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN is_complete INTEGER DEFAULT 1;")
        .execute(pool)
        .await;

    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN kind TEXT DEFAULT 'text';")
        .execute(pool)
        .await;

    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN metadata TEXT;")
        .execute(pool)
        .await;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);")
        .execute(pool)
        .await.map_err(crate::db_err)?;
    Ok(())
}
