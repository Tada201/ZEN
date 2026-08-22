use crate::error::ZenResult;
use sqlx::SqlitePool;

pub async fn add_clarification_request(
    pool: &SqlitePool,
    id: &str,
    chat_id: &str,
    question: &str,
    clarification_type: &str,
    options_json: &str,
    created_at: &str,
) -> ZenResult<()> {
    sqlx::query(
        r#"
        INSERT INTO clarification_requests (id, chat_id, question, clarification_type, options, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(id)
    .bind(chat_id)
    .bind(question)
    .bind(clarification_type)
    .bind(options_json)
    .bind(created_at)
    .execute(pool)
    .await.map_err(crate::error::db_err)?;

    Ok(())
}

pub async fn update_clarification_response(
    pool: &SqlitePool,
    chat_id: &str,
    response_json: &str,
    responded_at: &str,
) -> ZenResult<()> {
    sqlx::query(
        r#"
        UPDATE clarification_requests
        SET response = ?, responded_at = ?
        WHERE chat_id = ?
        "#,
    )
    .bind(response_json)
    .bind(responded_at)
    .bind(chat_id)
    .execute(pool)
    .await.map_err(crate::error::db_err)?;

    Ok(())
}
