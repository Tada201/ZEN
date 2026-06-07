use crate::error::ZenResult;
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SessionPermission {
    pub id: String,
    pub chat_id: String,
    pub tool_name: String,
    pub args_hash: String,
    pub pattern: Option<String>,
    pub granted_at: String,
}

pub async fn init_session_permissions(pool: &SqlitePool) -> ZenResult<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS session_permissions (
            id          TEXT PRIMARY KEY,
            chat_id     TEXT NOT NULL,
            tool_name   TEXT NOT NULL,
            args_hash   TEXT NOT NULL,
            pattern     TEXT,
            granted_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await?;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_session_permissions_chat ON session_permissions(chat_id);",
    )
    .execute(pool)
    .await;

    let _ = sqlx::query(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_session_permissions_chat_tool_args
         ON session_permissions(chat_id, tool_name, args_hash);",
    )
    .execute(pool)
    .await;

    Ok(())
}

pub async fn upsert_session_permission(
    pool: &SqlitePool,
    perm: &SessionPermission,
) -> ZenResult<()> {
    sqlx::query(
        "INSERT INTO session_permissions (id, chat_id, tool_name, args_hash, pattern, granted_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(chat_id, tool_name, args_hash) DO UPDATE SET
            pattern = excluded.pattern,
            granted_at = excluded.granted_at",
    )
    .bind(&perm.id)
    .bind(&perm.chat_id)
    .bind(&perm.tool_name)
    .bind(&perm.args_hash)
    .bind(&perm.pattern)
    .bind(&perm.granted_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list_session_permissions_for_chat(
    pool: &SqlitePool,
    chat_id: &str,
) -> ZenResult<Vec<SessionPermission>> {
    let rows = sqlx::query_as::<_, SessionPermission>(
        "SELECT id, chat_id, tool_name, args_hash, pattern, granted_at
         FROM session_permissions
         WHERE chat_id = ?
         ORDER BY granted_at DESC",
    )
    .bind(chat_id)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn load_session_permission_map(
    pool: &SqlitePool,
    chat_id: &str,
) -> ZenResult<std::collections::HashMap<String, bool>> {
    let rows =
        sqlx::query("SELECT tool_name, args_hash FROM session_permissions WHERE chat_id = ?")
            .bind(chat_id)
            .fetch_all(pool)
            .await?;

    let mut map = std::collections::HashMap::new();
    for row in rows {
        let tool_name: String = row.try_get("tool_name").unwrap_or_default();
        let args_hash: String = row.try_get("args_hash").unwrap_or_default();
        if tool_name.is_empty() || args_hash.is_empty() {
            continue;
        }
        let key = format!("{}:{}", tool_name, args_hash);
        map.insert(key, true);
    }
    Ok(map)
}

pub async fn delete_session_permission(pool: &SqlitePool, id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM session_permissions WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}
