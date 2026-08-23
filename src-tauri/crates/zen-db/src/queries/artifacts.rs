use crate::models::*;
use zen_core::ZenResult;
use sqlx::{Row, SqlitePool};

const MAX_ARTIFACT_LIST_ITEMS: i64 = 1_000;
const MAX_CHAT_ARTIFACT_ITEMS: i64 = 500;
const MAX_CHAT_MESSAGE_ITEMS: i64 = 1_000;

// --- Artifacts ---

pub async fn upsert_artifact(pool: &SqlitePool, art: &Artifact) -> ZenResult<()> {
    sqlx::query(
        r#"
        INSERT INTO artifacts (id, chat_id, message_id, artifact_type, title, content, language, metadata, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            content = excluded.content,
            language = excluded.language,
            metadata = excluded.metadata,
            updated_at = datetime('now')
        "#
    )
    .bind(&art.id)
    .bind(&art.chat_id)
    .bind(&art.message_id)
    .bind(&art.artifact_type)
    .bind(&art.title)
    .bind(&art.content)
    .bind(&art.language)
    .bind(&art.metadata)
    .execute(pool)
    .await.map_err(crate::db_err)?;
    Ok(())
}

pub async fn get_chat_artifacts(pool: &SqlitePool, chat_id: &str) -> ZenResult<Vec<Artifact>> {
    get_chat_artifacts_page(pool, chat_id, MAX_CHAT_ARTIFACT_ITEMS, 0).await
}

pub async fn get_chat_artifacts_page(
    pool: &SqlitePool,
    chat_id: &str,
    limit: i64,
    offset: i64,
) -> ZenResult<Vec<Artifact>> {
    let artifacts = sqlx::query_as::<_, Artifact>(
        "SELECT * FROM artifacts WHERE chat_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
    .bind(chat_id)
    .bind(limit.clamp(1, MAX_CHAT_ARTIFACT_ITEMS + 1))
    .bind(offset.max(0))
    .fetch_all(pool)
    .await.map_err(crate::db_err)?;
    Ok(artifacts)
}

pub async fn get_all_artifacts(pool: &SqlitePool) -> ZenResult<Vec<Artifact>> {
    get_all_artifacts_page(pool, MAX_ARTIFACT_LIST_ITEMS, 0).await
}

pub async fn get_all_artifacts_page(
    pool: &SqlitePool,
    limit: i64,
    offset: i64,
) -> ZenResult<Vec<Artifact>> {
    let artifacts = sqlx::query_as::<_, Artifact>(
        "SELECT * FROM artifacts ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
    .bind(limit.clamp(1, MAX_ARTIFACT_LIST_ITEMS + 1))
    .bind(offset.max(0))
    .fetch_all(pool)
    .await.map_err(crate::db_err)?;
    Ok(artifacts)
}

pub async fn delete_artifact(pool: &SqlitePool, id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM artifacts WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await.map_err(crate::db_err)?;
    Ok(())
}

pub async fn count_messages(pool: &SqlitePool) -> ZenResult<i64> {
    Ok(sqlx::query("SELECT COUNT(*) AS count FROM messages").fetch_one(pool).await.map_err(crate::db_err)?.get::<i64, _>("count"))
}

pub async fn get_all_messages_for_backup(pool: &SqlitePool, chat_id: &str) -> ZenResult<Vec<Message>> {
    sqlx::query_as::<_, Message>("SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC, id ASC")
        .bind(chat_id).fetch_all(pool).await.map_err(crate::db_err)
}

pub async fn get_messages(pool: &SqlitePool, chat_id: &str) -> ZenResult<Vec<Message>> {
    get_messages_page(pool, chat_id, MAX_CHAT_MESSAGE_ITEMS, 0).await
}

pub async fn get_messages_page(
    pool: &SqlitePool,
    chat_id: &str,
    limit: i64,
    offset: i64,
) -> ZenResult<Vec<Message>> {
    let msgs = sqlx::query_as::<_, Message>(
        r#"
        SELECT * FROM (
            SELECT * FROM messages
            WHERE chat_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT ? OFFSET ?
        ) ORDER BY created_at ASC, id ASC
        "#,
    )
    .bind(chat_id)
    .bind(limit.clamp(1, MAX_CHAT_MESSAGE_ITEMS + 1))
    .bind(offset.max(0))
    .fetch_all(pool)
    .await.map_err(crate::db_err)?;
    Ok(msgs)
}

pub async fn complete_message(
    pool: &SqlitePool,
    id: &str,
    content: &str,
    tokens_in: Option<i64>,
    tokens_out: Option<i64>,
    tool_calls: Option<&str>,
) -> ZenResult<()> {
    sqlx::query(
        "UPDATE messages SET content = ?, is_complete = 1, tokens_in = ?, tokens_out = ?, tool_calls = ? WHERE id = ?"
    )
    .bind(content)
    .bind(tokens_in)
    .bind(tokens_out)
    .bind(tool_calls)
    .bind(id)
    .execute(pool)
    .await.map_err(crate::db_err)?;
    Ok(())
}

/// Parameters for updating an existing message.
pub struct UpdateMessage<'a> {
    pub id: &'a str,
    pub chat_id: &'a str,
    pub content: &'a str,
    pub is_complete: bool,
    pub tokens_in: Option<i64>,
    pub tokens_out: Option<i64>,
    pub tool_calls: Option<&'a str>,
    pub reasoning_details: Option<&'a str>,
    pub metadata: Option<&'a str>,
    pub steps_json: Option<&'a str>,
}

impl<'a> Default for UpdateMessage<'a> {
    fn default() -> Self {
        Self {
            id: "",
            chat_id: "",
            content: "",
            is_complete: true,
            tokens_in: None,
            tokens_out: None,
            tool_calls: None,
            reasoning_details: None,
            metadata: None,
            steps_json: None,
        }
    }
}

pub async fn update_message(pool: &SqlitePool, msg: &UpdateMessage<'_>) -> ZenResult<()> {
    // This transaction reads (prev tokens/tool_calls) before it writes. A plain
    // BEGIN DEFERRED takes a read snapshot first, then tries to promote to a
    // writer — under WAL, a concurrent commit in between fails that promotion
    // with SQLITE_BUSY_SNAPSHOT (517), which busy_timeout does NOT retry.
    // BEGIN IMMEDIATE takes the write lock up front, so a busy database waits
    // (covered by busy_timeout) instead of erroring with "database is locked".
    let mut conn = pool.acquire().await.map_err(crate::db_err)?;
    sqlx::query("BEGIN IMMEDIATE").execute(&mut *conn).await.map_err(crate::db_err)?;

    // Raw BEGIN bypasses sqlx transaction tracking, so a mid-transaction error
    // would return an open-write-tx connection to the pool and poison the next
    // BEGIN IMMEDIATE. Run the body fallibly, then explicitly ROLLBACK on error.
    let result = update_message_inner(&mut conn, msg).await;
    match result {
        Ok(()) => {
            sqlx::query("COMMIT").execute(&mut *conn).await.map_err(crate::db_err)?;
            Ok(())
        }
        Err(e) => {
            let _ = sqlx::query("ROLLBACK").execute(&mut *conn).await;
            Err(e)
        }
    }
}

async fn update_message_inner(
    conn: &mut sqlx::SqliteConnection,
    msg: &UpdateMessage<'_>,
) -> ZenResult<()> {
    use sqlx::Row;

    // 1. Get original message to find previous token counts & tool calls
    let original =
        sqlx::query("SELECT tokens_in, tokens_out, tool_calls FROM messages WHERE id = ?")
            .bind(msg.id)
            .fetch_optional(&mut *conn)
            .await.map_err(crate::db_err)?;

    let mut prev_tokens_in = 0;
    let mut prev_tokens_out = 0;
    let mut merged_tool_calls = msg.tool_calls.map(|s| s.to_string());

    if let Some(row) = original {
        prev_tokens_in = row
            .try_get::<Option<i64>, _>("tokens_in")
            .unwrap_or(None)
            .unwrap_or(0);
        prev_tokens_out = row
            .try_get::<Option<i64>, _>("tokens_out")
            .unwrap_or(None)
            .unwrap_or(0);
        let prev_tool_calls = row
            .try_get::<Option<String>, _>("tool_calls")
            .unwrap_or(None);

        if let Some(new_tc_str) = msg.tool_calls {
            if let Ok(new_tcs) = serde_json::from_str::<Vec<serde_json::Value>>(new_tc_str) {
                if let Some(prev_str) = prev_tool_calls.as_deref() {
                    if let Ok(mut prev_tcs) =
                        serde_json::from_str::<Vec<serde_json::Value>>(prev_str)
                    {
                        prev_tcs.extend(new_tcs);
                        if let Ok(merged) = serde_json::to_string(&prev_tcs) {
                            merged_tool_calls = Some(merged);
                        }
                    }
                }
            }
        } else {
            merged_tool_calls = prev_tool_calls;
        }
    }

    // 2. Update message
    sqlx::query(
        "UPDATE messages SET content = ?, is_complete = ?, tokens_in = ?, tokens_out = ?, tool_calls = ?, reasoning_details = COALESCE(?, reasoning_details), metadata = COALESCE(?, metadata), steps_json = COALESCE(?, steps_json) WHERE id = ?"
    )
    .bind(msg.content)
    .bind(msg.is_complete as i32)
    .bind(msg.tokens_in)
    .bind(msg.tokens_out)
    .bind(merged_tool_calls)
    .bind(msg.reasoning_details)
    .bind(msg.metadata)
    .bind(msg.steps_json)
    .bind(msg.id)
    .execute(&mut *conn)
    .await.map_err(crate::db_err)?;

    // 3. Update chat with the token delta
    let delta_in = msg.tokens_in.unwrap_or(0) - prev_tokens_in;
    let delta_out = msg.tokens_out.unwrap_or(0) - prev_tokens_out;

    sqlx::query(
        r#"UPDATE chats 
           SET updated_at = datetime('now'),
               last_activity = datetime('now'),
               total_tokens_in = total_tokens_in + ?,
               total_tokens_out = total_tokens_out + ?
           WHERE id = ?"#,
    )
    .bind(delta_in)
    .bind(delta_out)
    .bind(msg.chat_id)
    .execute(&mut *conn)
    .await.map_err(crate::db_err)?;

    Ok(())
}

pub async fn update_message_partial(
    pool: &SqlitePool,
    id: &str,
    chat_id: &str,
    content: &str,
    tokens_out: usize,
) -> ZenResult<()> {
    sqlx::query("UPDATE messages SET content = ?, tokens_out = ? WHERE id = ? AND chat_id = ?")
        .bind(content)
        .bind(tokens_out as i64)
        .bind(id)
        .bind(chat_id)
        .execute(pool)
        .await.map_err(crate::db_err)?;
    Ok(())
}
