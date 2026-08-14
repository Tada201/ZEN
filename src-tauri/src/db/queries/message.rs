use crate::db::models::*;
use crate::error::ZenResult;
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
        .bind(chrono::Utc::now().to_rfc3339()).execute(&mut **tx).await?;
    Ok(())
}

pub async fn add_message(pool: &SqlitePool, msg: &NewMessage<'_>) -> ZenResult<Message> {
    let id = msg
        .id
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let mut tx = pool.begin().await?;

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
    .execute(&mut *tx)
    .await?;

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
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let msg = sqlx::query_as::<_, Message>("SELECT * FROM messages WHERE id = ?")
        .bind(&id)
        .fetch_one(pool)
        .await?;
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
    .await?;

    if result.rows_affected() == 0 {
        return Err(crate::error::ZenError::Custom(
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
        .await?;
    Ok(())
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
            .await?
        }
        None => {
            sqlx::query(
                "UPDATE messages SET content = ? WHERE id = ? AND chat_id = ? AND role = 'assistant'",
            )
            .bind(content)
            .bind(message_id)
            .bind(chat_id)
            .execute(pool)
            .await?
        }
    };

    if result.rows_affected() == 0 {
        return Err(crate::error::ZenError::Custom(
            UPDATE_MESSAGE_STEPS_NOT_FOUND.to_string(),
        ));
    }

    Ok(())
}
