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
        }
    }
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
            metadata, reasoning_details, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
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
