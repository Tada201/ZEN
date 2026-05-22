use sqlx::SqlitePool;
use uuid::Uuid;
use crate::db::models::*;
use crate::error::ZenResult;


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
    .await?;
    Ok(())
}

pub async fn get_chat_artifacts(pool: &SqlitePool, chat_id: &str) -> ZenResult<Vec<Artifact>> {
    let artifacts = sqlx::query_as::<_, Artifact>(
        "SELECT * FROM artifacts WHERE chat_id = ? ORDER BY created_at DESC"
    )
    .bind(chat_id)
    .fetch_all(pool)
    .await?;
    Ok(artifacts)
}

pub async fn get_all_artifacts(pool: &SqlitePool) -> ZenResult<Vec<Artifact>> {
    let artifacts = sqlx::query_as::<_, Artifact>(
        "SELECT * FROM artifacts ORDER BY created_at DESC"
    )
    .fetch_all(pool)
    .await?;
    Ok(artifacts)
}

pub async fn delete_artifact(pool: &SqlitePool, id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM artifacts WHERE id = ?")
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_messages(pool: &SqlitePool, chat_id: &str) -> ZenResult<Vec<Message>> {
    let msgs = sqlx::query_as::<_, Message>(
        "SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC"
    )
    .bind(chat_id)
    .fetch_all(pool)
    .await?;
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
    .await?;
    Ok(())
}

pub async fn update_message(
    pool: &SqlitePool,
    id: &str,
    chat_id: &str,
    content: &str,
    is_complete: bool,
    tokens_in: Option<i64>,
    tokens_out: Option<i64>,
    tool_calls: Option<&str>,
) -> ZenResult<()> {
    use sqlx::Row;

    let mut tx = pool.begin().await?;

    // 1. Get original message to find previous token counts & tool calls
    let original = sqlx::query("SELECT tokens_in, tokens_out, tool_calls FROM messages WHERE id = ?")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?;

    let mut prev_tokens_in = 0;
    let mut prev_tokens_out = 0;
    let mut merged_tool_calls = tool_calls.map(|s| s.to_string());

    if let Some(row) = original {
        prev_tokens_in = row.try_get::<Option<i64>, _>("tokens_in").unwrap_or(None).unwrap_or(0);
        prev_tokens_out = row.try_get::<Option<i64>, _>("tokens_out").unwrap_or(None).unwrap_or(0);

        if let Some(new_tc_str) = tool_calls {
            if let Ok(new_tcs) = serde_json::from_str::<Vec<serde_json::Value>>(new_tc_str) {
                let prev_tc_str = row.try_get::<Option<String>, _>("tool_calls").unwrap_or(None);
                if let Some(prev_str) = prev_tc_str {
                    if let Ok(mut prev_tcs) = serde_json::from_str::<Vec<serde_json::Value>>(&prev_str) {
                        prev_tcs.extend(new_tcs);
                        if let Ok(merged) = serde_json::to_string(&prev_tcs) {
                            merged_tool_calls = Some(merged);
                        }
                    }
                }
            }
        }
    }

    // 2. Update message
    sqlx::query(
        "UPDATE messages SET content = ?, is_complete = ?, tokens_in = ?, tokens_out = ?, tool_calls = ? WHERE id = ?"
    )
    .bind(content)
    .bind(is_complete as i32)
    .bind(tokens_in)
    .bind(tokens_out)
    .bind(merged_tool_calls)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    // 3. Update chat with the token delta
    let delta_in = tokens_in.unwrap_or(0) - prev_tokens_in;
    let delta_out = tokens_out.unwrap_or(0) - prev_tokens_out;

    sqlx::query(
        r#"UPDATE chats 
           SET updated_at = datetime('now'),
               last_activity = datetime('now'),
               total_tokens_in = total_tokens_in + ?,
               total_tokens_out = total_tokens_out + ?
           WHERE id = ?"#
    )
    .bind(delta_in)
    .bind(delta_out)
    .bind(chat_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(())
}

pub async fn update_message_partial(
    pool: &SqlitePool,
    id: &str,
    chat_id: &str,
    content: &str,
    tokens_out: usize,
) -> ZenResult<()> {
    sqlx::query(
        "UPDATE messages SET content = ?, tokens_out = ? WHERE id = ? AND chat_id = ?"
    )
    .bind(content)
    .bind(tokens_out as i64)
    .bind(id)
    .bind(chat_id)
    .execute(pool)
    .await?;
    Ok(())
}


