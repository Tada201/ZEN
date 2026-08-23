use sqlx::SqlitePool;
use zen_core::ZenResult;

pub(super) async fn workbench(pool: &SqlitePool) -> ZenResult<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS workbench_tabs (
            id          TEXT PRIMARY KEY,
            chat_id     TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            view_id     TEXT NOT NULL,
            label       TEXT NOT NULL,
            position    INTEGER NOT NULL DEFAULT 0,
            state_json  TEXT,
            created_at  TEXT DEFAULT (datetime('now')),
            updated_at  TEXT DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_workbench_tabs_chat ON workbench_tabs(chat_id, position);")
        .execute(pool)
        .await.map_err(crate::db_err)?;
    Ok(())
}
