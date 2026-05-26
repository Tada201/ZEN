use crate::db::models::*;
use crate::error::ZenResult;
use sqlx::SqlitePool;
use uuid::Uuid;

// --- Messages ---

pub async fn add_message(
    pool: &SqlitePool,
    chat_id: &str,
    id: Option<&str>,
    role: &str,
    content: &str,
    model: Option<&str>,
    is_complete: bool,
    tool_calls: Option<&str>,
    tool_call_id: Option<&str>,
    images: Option<&str>,
    attachments: Option<&str>,
    tokens_in: Option<i64>,
    tokens_out: Option<i64>,
    kind: Option<&str>,
    metadata: Option<&str>,
) -> ZenResult<Message> {
    let id = id
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let mut tx = pool.begin().await?;

    sqlx::query(
        "INSERT INTO messages (id, chat_id, role, content, model, is_complete, tool_calls, tool_call_id, images, attachments, tokens_in, tokens_out, kind, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(chat_id)
    .bind(role)
    .bind(content)
    .bind(model)
    .bind(is_complete as i32)
    .bind(tool_calls)
    .bind(tool_call_id)
    .bind(images)
    .bind(attachments)
    .bind(tokens_in)
    .bind(tokens_out)
    .bind(kind)
    .bind(metadata)
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
    .bind(tokens_in.unwrap_or(0))
    .bind(tokens_out.unwrap_or(0))
    .bind(chat_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let msg = sqlx::query_as::<_, Message>("SELECT * FROM messages WHERE id = ?")
        .bind(&id)
        .fetch_one(pool)
        .await?;
    Ok(msg)
}
