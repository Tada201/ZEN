use crate::error::ZenResult;
use sqlx::{Row, SqlitePool};

#[derive(Debug, Clone)]
pub struct SessionMemoryRow {
    pub id: String,
    pub session_id: String,
    pub content: String,
    pub metadata: String,
    pub written_by: String,
    pub timestamp: i64,
    pub embedding: Option<Vec<u8>>,
}

pub async fn init_session_memories(pool: &SqlitePool) -> ZenResult<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS session_memories (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            content TEXT NOT NULL,
            metadata TEXT,
            written_by TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            embedding BLOB,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_session_memories_session_id ON session_memories (session_id)",
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn add_session_memory(
    pool: &SqlitePool,
    id: &str,
    session_id: &str,
    content: &str,
    metadata: &str,
    written_by: &str,
    timestamp: i64,
    embedding: &[u8],
) -> ZenResult<()> {
    sqlx::query(
        r#"
        INSERT INTO session_memories (id, session_id, content, metadata, written_by, timestamp, embedding)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(id)
    .bind(session_id)
    .bind(content)
    .bind(metadata)
    .bind(written_by)
    .bind(timestamp)
    .bind(embedding)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_session_memory_rows_for_session(
    pool: &SqlitePool,
    session_id: &str,
) -> ZenResult<Vec<SessionMemoryRow>> {
    let rows = sqlx::query(
        r#"
        SELECT id, session_id, content, metadata, written_by, timestamp, embedding
        FROM session_memories
        WHERE session_id = ?
        ORDER BY timestamp DESC
        "#,
    )
    .bind(session_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| SessionMemoryRow {
            id: row.get(0),
            session_id: row.get(1),
            content: row.get(2),
            metadata: row.get(3),
            written_by: row.get(4),
            timestamp: row.get(5),
            embedding: row.get(6),
        })
        .collect())
}

pub async fn get_session_memory(
    pool: &SqlitePool,
    id: &str,
) -> ZenResult<Option<SessionMemoryRow>> {
    let row = sqlx::query(
        r#"
        SELECT id, session_id, content, metadata, written_by, timestamp, embedding
        FROM session_memories
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|row| SessionMemoryRow {
        id: row.get(0),
        session_id: row.get(1),
        content: row.get(2),
        metadata: row.get(3),
        written_by: row.get(4),
        timestamp: row.get(5),
        embedding: row.get(6),
    }))
}

pub async fn delete_session_memory(pool: &SqlitePool, id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM session_memories WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn delete_session_memories_for_session(
    pool: &SqlitePool,
    session_id: &str,
) -> ZenResult<()> {
    sqlx::query("DELETE FROM session_memories WHERE session_id = ?")
        .bind(session_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn count_session_memories_for_session(
    pool: &SqlitePool,
    session_id: &str,
) -> ZenResult<i64> {
    Ok(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM session_memories WHERE session_id = ?")
            .bind(session_id)
            .fetch_one(pool)
            .await?,
    )
}

pub async fn count_session_memories(pool: &SqlitePool) -> ZenResult<i64> {
    Ok(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM session_memories")
            .fetch_one(pool)
            .await?,
    )
}
