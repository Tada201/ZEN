use zen_core::ZenResult;
use sqlx::{Row, SqlitePool};

const MAX_SESSION_MEMORY_ROWS: i64 = 1_000;

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
    .await.map_err(crate::db_err)?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_session_memories_session_id ON session_memories (session_id)",
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    Ok(())
}

/// Parameters for inserting a new session memory.
pub struct NewSessionMemory<'a> {
    pub id: &'a str,
    pub session_id: &'a str,
    pub content: &'a str,
    pub metadata: &'a str,
    pub written_by: &'a str,
    pub timestamp: i64,
    pub embedding: &'a [u8],
}

pub async fn add_session_memory(pool: &SqlitePool, mem: &NewSessionMemory<'_>) -> ZenResult<()> {
    sqlx::query(
        r#"
        INSERT INTO session_memories (id, session_id, content, metadata, written_by, timestamp, embedding)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(mem.id)
    .bind(mem.session_id)
    .bind(mem.content)
    .bind(mem.metadata)
    .bind(mem.written_by)
    .bind(mem.timestamp)
    .bind(mem.embedding)
    .execute(pool)
    .await.map_err(crate::db_err)?;

    Ok(())
}

pub async fn get_session_memory_rows_for_session(
    pool: &SqlitePool,
    session_id: &str,
) -> ZenResult<Vec<SessionMemoryRow>> {
    get_session_memory_rows_for_session_page(pool, session_id, MAX_SESSION_MEMORY_ROWS, 0).await
}

pub async fn get_session_memory_rows_for_session_page(
    pool: &SqlitePool,
    session_id: &str,
    limit: i64,
    offset: i64,
) -> ZenResult<Vec<SessionMemoryRow>> {
    let rows = sqlx::query(
        r#"
        SELECT id, session_id, content, metadata, written_by, timestamp, embedding
        FROM session_memories
        WHERE session_id = ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
        "#,
    )
    .bind(session_id)
    .bind(limit.clamp(1, MAX_SESSION_MEMORY_ROWS + 1))
    .bind(offset.max(0))
    .fetch_all(pool)
    .await.map_err(crate::db_err)?;

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
    .await.map_err(crate::db_err)?;

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
        .await.map_err(crate::db_err)?;

    Ok(())
}

pub async fn delete_session_memories_for_session(
    pool: &SqlitePool,
    session_id: &str,
) -> ZenResult<()> {
    sqlx::query("DELETE FROM session_memories WHERE session_id = ?")
        .bind(session_id)
        .execute(pool)
        .await.map_err(crate::db_err)?;

    Ok(())
}

pub async fn count_session_memories_for_session(
    pool: &SqlitePool,
    session_id: &str,
) -> ZenResult<i64> {
    sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM session_memories WHERE session_id = ?")
        .bind(session_id)
        .fetch_one(pool)
        .await
        .map_err(crate::db_err)
}

pub async fn count_session_memories(pool: &SqlitePool) -> ZenResult<i64> {
    sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM session_memories")
        .fetch_one(pool)
        .await
        .map_err(crate::db_err)
}
