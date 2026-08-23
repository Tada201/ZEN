//! SQL for thread-scoped goals (`/goal`). One row per chat; all status and
//! lifecycle transitions live behind `services::goal` which emits the
//! `goal:updated` event — these queries are pure persistence.

use sqlx::SqlitePool;

use crate::models::ThreadGoal;
use zen_core::{ZenError, ZenResult};

pub async fn get_thread_goal(pool: &SqlitePool, chat_id: &str) -> ZenResult<Option<ThreadGoal>> {
    let goal = sqlx::query_as::<_, ThreadGoal>(
        "SELECT chat_id, objective, status, turns_count, created_at, updated_at FROM thread_goals WHERE chat_id = ?",
    )
    .bind(chat_id)
    .fetch_optional(pool)
    .await.map_err(crate::db_err)?;
    Ok(goal)
}

/// Insert or replace the chat's goal. A new objective restarts the run:
/// status returns to `active` and the continuation-turn counter resets.
pub async fn upsert_thread_goal(
    pool: &SqlitePool,
    chat_id: &str,
    objective: &str,
) -> ZenResult<ThreadGoal> {
    sqlx::query(
        r#"
        INSERT INTO thread_goals (chat_id, objective, status, turns_count, created_at, updated_at)
        VALUES (?, ?, 'active', 0, datetime('now'), datetime('now'))
        ON CONFLICT(chat_id) DO UPDATE SET
            objective = excluded.objective,
            status = 'active',
            turns_count = 0,
            updated_at = datetime('now')
        "#,
    )
    .bind(chat_id)
    .bind(objective)
    .execute(pool)
    .await.map_err(crate::db_err)?;
    get_thread_goal(pool, chat_id).await?.ok_or_else(|| {
        ZenError::Custom("goal row vanished immediately after upsert".to_string())
    })
}

pub async fn set_thread_goal_status(
    pool: &SqlitePool,
    chat_id: &str,
    status: &str,
) -> ZenResult<Option<ThreadGoal>> {
    let result = sqlx::query(
        "UPDATE thread_goals SET status = ?, updated_at = datetime('now') WHERE chat_id = ?",
    )
    .bind(status)
    .bind(chat_id)
    .execute(pool)
    .await.map_err(crate::db_err)?;
    if result.rows_affected() == 0 {
        return Ok(None);
    }
    get_thread_goal(pool, chat_id).await
}

pub async fn increment_thread_goal_turns(pool: &SqlitePool, chat_id: &str) -> ZenResult<()> {
    sqlx::query(
        "UPDATE thread_goals SET turns_count = turns_count + 1, updated_at = datetime('now') WHERE chat_id = ?",
    )
    .bind(chat_id)
    .execute(pool)
    .await.map_err(crate::db_err)?;
    Ok(())
}

pub async fn delete_thread_goal(pool: &SqlitePool, chat_id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM thread_goals WHERE chat_id = ?")
        .bind(chat_id)
        .execute(pool)
        .await.map_err(crate::db_err)?;
    Ok(())
}
