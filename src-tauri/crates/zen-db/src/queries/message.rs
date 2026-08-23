use crate::models::*;
use zen_core::ZenResult;
use sqlx::SqlitePool;
use uuid::Uuid;

// --- Messages ---

/// Parameters for inserting a new message into the database.
pub struct NewMessage<'a> {
    pub chat_id: &'a str,
    pub id: Option<&'a str>,
    pub role: &'a str,
    pub content: &'a str,
    pub model: Option<&'a str>,
    pub is_complete: bool,
    pub tool_calls: Option<&'a str>,
    pub tool_call_id: Option<&'a str>,
    pub images: Option<&'a str>,
    pub attachments: Option<&'a str>,
    pub tokens_in: Option<i64>,
    pub tokens_out: Option<i64>,
    pub kind: Option<&'a str>,
    pub metadata: Option<&'a str>,
    pub reasoning_details: Option<&'a str>,
    pub steps_json: Option<&'a str>,
}

impl<'a> Default for NewMessage<'a> {
    fn default() -> Self {
        Self {
            chat_id: "",
            id: None,
            role: "assistant",
            content: "",
            model: None,
            is_complete: true,
            tool_calls: None,
            tool_call_id: None,
            images: None,
            attachments: None,
            tokens_in: None,
            tokens_out: None,
            kind: None,
            metadata: None,
            reasoning_details: None,
            steps_json: None,
        }
    }
}

pub async fn add_message_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    msg: &NewMessage<'_>,
    id: &str,
) -> ZenResult<()> {
    sqlx::query("INSERT INTO messages (id, chat_id, role, content, model, is_complete, tool_calls, tool_call_id, images, attachments, tokens_in, tokens_out, kind, metadata, reasoning_details, steps_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id).bind(msg.chat_id).bind(msg.role).bind(msg.content).bind(msg.model).bind(msg.is_complete as i32)
        .bind(msg.tool_calls).bind(msg.tool_call_id).bind(msg.images).bind(msg.attachments).bind(msg.tokens_in).bind(msg.tokens_out)
        .bind(msg.kind).bind(msg.metadata).bind(msg.reasoning_details).bind(msg.steps_json)
        .bind(chrono::Utc::now().to_rfc3339()).execute(&mut **tx).await.map_err(crate::db_err)?;
    Ok(())
}

pub async fn add_message(pool: &SqlitePool, msg: &NewMessage<'_>) -> ZenResult<Message> {
    let id = msg
        .id
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    // BEGIN IMMEDIATE for the same reason as update_message below and
    // artifacts::update_message: this transaction writes from the first
    // statement, and a deferred read-to-write promotion under a competing
    // writer returns immediate SQLITE_BUSY (busy handler is bypassed for the
    // deadlock-prone upgrade) instead of waiting per the pool busy_timeout.
    let mut conn = pool.acquire().await.map_err(crate::db_err)?;
    sqlx::query("BEGIN IMMEDIATE").execute(&mut *conn).await.map_err(crate::db_err)?;

    let result = async {
        sqlx::query(
            r#"
            INSERT INTO messages (
                id, chat_id, role, content, model, is_complete, tool_calls,
                tool_call_id, images, attachments, tokens_in, tokens_out, kind,
                metadata, reasoning_details, steps_json, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            "#,
        )
        .bind(&id)
        .bind(msg.chat_id)
        .bind(msg.role)
        .bind(msg.content)
        .bind(msg.model)
        .bind(msg.is_complete as i32)
        .bind(msg.tool_calls)
        .bind(msg.tool_call_id)
        .bind(msg.images)
        .bind(msg.attachments)
        .bind(msg.tokens_in)
        .bind(msg.tokens_out)
        .bind(msg.kind)
        .bind(msg.metadata)
        .bind(msg.reasoning_details)
        .bind(msg.steps_json)
        .execute(&mut *conn)
        .await.map_err(crate::db_err)?;

        // Update chat metadata: message_count, tokens, updated_at, last_activity
        sqlx::query(
            r#"UPDATE chats
               SET updated_at = datetime('now'),
                   last_activity = datetime('now'),
                   message_count = message_count + 1,
                   total_tokens_in = total_tokens_in + ?,
                   total_tokens_out = total_tokens_out + ?
               WHERE id = ?"#,
        )
        .bind(msg.tokens_in.unwrap_or(0))
        .bind(msg.tokens_out.unwrap_or(0))
        .bind(msg.chat_id)
        .execute(&mut *conn)
        .await.map_err(crate::db_err)?;

        Ok(())
    }
    .await;

    match result {
        Ok(()) => {
            sqlx::query("COMMIT").execute(&mut *conn).await.map_err(crate::db_err)?;
        }
        Err(e) => {
            let _ = sqlx::query("ROLLBACK").execute(&mut *conn).await;
            return Err(e);
        }
    }

    let msg = sqlx::query_as::<_, Message>("SELECT * FROM messages WHERE id = ?")
        .bind(&id)
        .fetch_one(pool)
        .await.map_err(crate::db_err)?;
    Ok(msg)
}

pub(crate) const UPDATE_MESSAGE_STEPS_NOT_FOUND: &str =
    "No assistant message found for the provided message_id";

/// Persists the frontend execution timeline (`steps_json`) for a single assistant
/// message. Only rows with role `assistant` are updated, and only if they belong
/// to the requested chat. Returns an error if no matching row is found.
pub async fn update_message_steps(
    pool: &SqlitePool,
    chat_id: &str,
    message_id: &str,
    steps_json: &str,
) -> ZenResult<()> {
    let result = sqlx::query(
        "UPDATE messages SET steps_json = ? WHERE id = ? AND chat_id = ? AND role = 'assistant'"
    )
    .bind(steps_json)
    .bind(message_id)
    .bind(chat_id)
    .execute(pool)
    .await.map_err(crate::db_err)?;

    if result.rows_affected() == 0 {
        return Err(crate::ZenError::Custom(
            UPDATE_MESSAGE_STEPS_NOT_FOUND.to_string(),
        ));
    }

    Ok(())
}

/// Updates only the content and metadata of a message.
pub async fn update_message_content_and_metadata(
    pool: &SqlitePool,
    id: &str,
    content: &str,
    metadata: &str,
) -> ZenResult<()> {
    sqlx::query("UPDATE messages SET content = ?, metadata = ? WHERE id = ?")
        .bind(content)
        .bind(metadata)
        .bind(id)
        .execute(pool)
        .await.map_err(crate::db_err)?;
    Ok(())
}

/// Loads a single message row scoped to a chat. The regenerate path uses this
/// to validate its anchor turn before truncating history.
pub async fn get_message_in_chat(
    pool: &SqlitePool,
    chat_id: &str,
    message_id: &str,
) -> ZenResult<Option<Message>> {
    let row = sqlx::query_as::<_, Message>("SELECT * FROM messages WHERE id = ? AND chat_id = ?")
        .bind(message_id)
        .bind(chat_id)
        .fetch_optional(pool)
        .await.map_err(crate::db_err)?;
    Ok(row)
}

/// Regenerate support: counts user turns ordered after the anchor. Zero means
/// the anchor is the latest user turn; a non-zero count means the caller is
/// regenerating a stale turn and would silently delete newer user turns and
/// their responses, so the command layer must refuse.
pub async fn count_later_user_messages(
    pool: &SqlitePool,
    chat_id: &str,
    anchor_message_id: &str,
) -> ZenResult<u64> {
    let row: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
          FROM messages m
          JOIN messages a ON a.id = ?2 AND a.chat_id = ?1
         WHERE m.chat_id = ?1
           AND m.role = 'user'
           AND (m.created_at, m.id) > (a.created_at, a.id)
        "#,
    )
    .bind(chat_id)
    .bind(anchor_message_id)
    .fetch_one(pool)
    .await.map_err(crate::db_err)?;
    Ok(row.0 as u64)
}

/// Regenerate support: delete every message ordered after the anchor row
/// (exclusive), so re-running a turn replaces it instead of appending a
/// duplicate prompt. Ordering matches the canonical timeline read
/// (`get_messages`: created_at ASC, id ASC) — NOT rowid — because imported
/// chats preserve the original created_at while rowid follows the import
/// array order, which can diverge from the timeline the UI shows.
/// Per-message dependents (steps columns, artifacts, execution traces)
/// cascade via foreign keys, and the chat counters + token totals are kept
/// honest. The anchor itself survives.
pub async fn truncate_messages_after(
    pool: &SqlitePool,
    chat_id: &str,
    anchor_message_id: &str,
) -> ZenResult<u64> {
    // BEGIN IMMEDIATE for the same reason as artifacts::update_message: the
    // body writes from the first statement, and a deferred read-to-write
    // promotion can fail with SQLITE_BUSY_SNAPSHOT under concurrent commits.
    let mut conn = pool.acquire().await.map_err(crate::db_err)?;
    sqlx::query("BEGIN IMMEDIATE").execute(&mut *conn).await.map_err(crate::db_err)?;

    let result: ZenResult<u64> = async {
        // Sum the doomed rows' tokens before deleting so chat totals stay
        // honest; row-value comparison mirrors get_messages ordering.
        let tokens = sqlx::query_as::<_, (i64, i64)>(
            r#"
            SELECT COALESCE(SUM(m.tokens_in), 0), COALESCE(SUM(m.tokens_out), 0)
              FROM messages m
              JOIN messages a ON a.id = ?2 AND a.chat_id = ?1
             WHERE m.chat_id = ?1
               AND (m.created_at, m.id) > (a.created_at, a.id)
            "#,
        )
        .bind(chat_id)
        .bind(anchor_message_id)
        .fetch_one(&mut *conn)
        .await.map_err(crate::db_err)?;

        let removed = sqlx::query(
            r#"
            DELETE FROM messages
             WHERE chat_id = ?1
               AND id IN (
                   SELECT m.id
                     FROM messages m
                     JOIN messages a ON a.id = ?2 AND a.chat_id = ?1
                    WHERE m.chat_id = ?1
                      AND (m.created_at, m.id) > (a.created_at, a.id)
               )
            "#,
        )
        .bind(chat_id)
        .bind(anchor_message_id)
        .execute(&mut *conn)
        .await.map_err(crate::db_err)?
        .rows_affected();

        sqlx::query(
            r#"
            UPDATE chats
               SET updated_at = datetime('now'),
                   last_activity = datetime('now'),
                   message_count = MAX(COALESCE(message_count, 0) - ?1, 0),
                   total_tokens_in = MAX(COALESCE(total_tokens_in, 0) - ?2, 0),
                   total_tokens_out = MAX(COALESCE(total_tokens_out, 0) - ?3, 0)
             WHERE id = ?4
            "#,
        )
        .bind(removed as i64)
        .bind(tokens.0)
        .bind(tokens.1)
        .bind(chat_id)
        .execute(&mut *conn)
        .await.map_err(crate::db_err)?;

        Ok(removed)
    }
    .await;

    match result {
        Ok(removed) => {
            sqlx::query("COMMIT").execute(&mut *conn).await.map_err(crate::db_err)?;
            Ok(removed)
        }
        Err(e) => {
            let _ = sqlx::query("ROLLBACK").execute(&mut *conn).await;
            Err(e)
        }
    }
}

/// Persists an edited assistant message body (used by self-healing diagram
/// repairs). Optionally rewrites `steps_json` in the same write so reloads
/// reproduce the fixed content on the timeline path too. Scoped to the chat +
/// assistant role; errors when no matching row exists.
pub async fn update_message_content(
    pool: &SqlitePool,
    chat_id: &str,
    message_id: &str,
    content: &str,
    steps_json: Option<&str>,
) -> ZenResult<()> {
    let result = match steps_json {
        Some(steps) => {
            sqlx::query(
                "UPDATE messages SET content = ?, steps_json = ? WHERE id = ? AND chat_id = ? AND role = 'assistant'",
            )
            .bind(content)
            .bind(steps)
            .bind(message_id)
            .bind(chat_id)
            .execute(pool)
            .await.map_err(crate::db_err)?
        }
        None => {
            sqlx::query(
                "UPDATE messages SET content = ? WHERE id = ? AND chat_id = ? AND role = 'assistant'",
            )
            .bind(content)
            .bind(message_id)
            .bind(chat_id)
            .execute(pool)
            .await.map_err(crate::db_err)?
        }
    };

    if result.rows_affected() == 0 {
        return Err(crate::ZenError::Custom(
            UPDATE_MESSAGE_STEPS_NOT_FOUND.to_string(),
        ));
    }

    Ok(())
}
