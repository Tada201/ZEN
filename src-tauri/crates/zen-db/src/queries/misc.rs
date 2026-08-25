use crate::models::*;
use zen_core::ZenResult;
use sqlx::SqlitePool;
use uuid::Uuid;

const MAX_ORCHESTRATION_TASK_ITEMS: i64 = 500;
const MAX_ORCHESTRATION_PLAN_ITEMS: i64 = 100;
const MAX_SKILL_ITEMS: i64 = 500;
const MAX_HOOK_ITEMS: i64 = 500;
const MAX_COMMAND_ITEMS: i64 = 500;
const MAX_PREVIOUS_SUMMARY_ITEMS: i64 = 100;

// --- Orchestration ---

pub async fn save_orchestration_plan(pool: &SqlitePool, plan: &OrchestrationPlan) -> ZenResult<()> {
    sqlx::query(
        r#"
        INSERT INTO orchestration_plans (id, chat_id, goal, complexity, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            updated_at = datetime('now')
        "#,
    )
    .bind(&plan.id)
    .bind(&plan.chat_id)
    .bind(&plan.goal)
    .bind(&plan.complexity)
    .bind(&plan.status)
    .bind(&plan.created_at)
    .bind(&plan.updated_at)
    .execute(pool)
    .await.map_err(crate::db_err)?;
    Ok(())
}

pub async fn save_orchestration_task(pool: &SqlitePool, task: &OrchestrationTask) -> ZenResult<()> {
    sqlx::query(
        r#"
        INSERT INTO orchestration_tasks (id, plan_id, description, agent_id, priority, status, dependencies, result, retry_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            result = excluded.result,
            retry_count = excluded.retry_count,
            updated_at = datetime('now')
        "#,
    )
    .bind(&task.id)
    .bind(&task.plan_id)
    .bind(&task.description)
    .bind(&task.agent_id)
    .bind(task.priority)
    .bind(&task.status)
    .bind(&task.dependencies)
    .bind(&task.result)
    .bind(task.retry_count)
    .bind(&task.created_at)
    .bind(&task.updated_at)
    .execute(pool)
    .await.map_err(crate::db_err)?;
    Ok(())
}

pub async fn get_orchestration_plan(
    pool: &SqlitePool,
    plan_id: &str,
) -> ZenResult<OrchestrationPlan> {
    let plan =
        sqlx::query_as::<_, OrchestrationPlan>("SELECT * FROM orchestration_plans WHERE id = ?")
            .bind(plan_id)
            .fetch_one(pool)
            .await.map_err(crate::db_err)?;
    Ok(plan)
}

pub async fn get_orchestration_tasks(
    pool: &SqlitePool,
    plan_id: &str,
) -> ZenResult<Vec<OrchestrationTask>> {
    let tasks = sqlx::query_as::<_, OrchestrationTask>("SELECT * FROM orchestration_tasks WHERE plan_id = ? ORDER BY priority DESC, created_at ASC LIMIT ?")
        .bind(plan_id)
        .bind(MAX_ORCHESTRATION_TASK_ITEMS)
        .fetch_all(pool)
        .await.map_err(crate::db_err)?;
    Ok(tasks)
}

pub async fn get_orchestration_plans_by_chat(
    pool: &SqlitePool,
    chat_id: &str,
) -> ZenResult<Vec<OrchestrationPlan>> {
    let plans = sqlx::query_as::<_, OrchestrationPlan>(
        "SELECT * FROM orchestration_plans WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?",
    )
    .bind(chat_id)
    .bind(MAX_ORCHESTRATION_PLAN_ITEMS)
    .fetch_all(pool)
    .await.map_err(crate::db_err)?;
    Ok(plans)
}

pub async fn update_orchestration_task_status(
    pool: &SqlitePool,
    task_id: &str,
    status: &str,
    result: Option<&str>,
) -> ZenResult<()> {
    sqlx::query("UPDATE orchestration_tasks SET status = ?, result = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(status)
        .bind(result)
        .bind(task_id)
        .execute(pool)
        .await.map_err(crate::db_err)?;
    Ok(())
}

pub async fn update_orchestration_plan_status(
    pool: &SqlitePool,
    plan_id: &str,
    status: &str,
) -> ZenResult<()> {
    sqlx::query(
        "UPDATE orchestration_plans SET status = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(status)
    .bind(plan_id)
    .execute(pool)
    .await.map_err(crate::db_err)?;
    Ok(())
}

// --- Skills, Hooks & Commands ---

use crate::models::{Hook, HookLogEntry, Skill, ZenCommand};

pub async fn list_skills(pool: &SqlitePool) -> ZenResult<Vec<Skill>> {
    let skills = sqlx::query_as::<_, Skill>(
        "SELECT id, name, '' as description, '' as invocation_syntax, enabled FROM tools LIMIT ?",
    )
    .bind(MAX_SKILL_ITEMS)
    .fetch_all(pool)
    .await.map_err(crate::db_err)?;
    Ok(skills)
}

pub async fn set_skill_enabled(pool: &SqlitePool, skill_id: &str, enabled: bool) -> ZenResult<()> {
    sqlx::query("UPDATE tools SET enabled = ? WHERE id = ?")
        .bind(enabled as i32)
        .bind(skill_id)
        .execute(pool)
        .await.map_err(crate::db_err)?;
    Ok(())
}

pub async fn list_hooks(pool: &SqlitePool) -> ZenResult<Vec<Hook>> {
    let hooks = sqlx::query_as::<_, Hook>("SELECT * FROM hooks ORDER BY name ASC LIMIT ?")
        .bind(MAX_HOOK_ITEMS)
        .fetch_all(pool)
        .await.map_err(crate::db_err)?;
    Ok(hooks)
}

pub async fn set_hook_enabled(pool: &SqlitePool, hook_id: &str, enabled: bool) -> ZenResult<()> {
    sqlx::query("UPDATE hooks SET enabled = ? WHERE id = ?")
        .bind(enabled as i32)
        .bind(hook_id)
        .execute(pool)
        .await.map_err(crate::db_err)?;
    Ok(())
}

pub async fn list_commands(pool: &SqlitePool) -> ZenResult<Vec<ZenCommand>> {
    let commands =
        sqlx::query_as::<_, ZenCommand>("SELECT * FROM zen_commands ORDER BY name ASC LIMIT ?")
            .bind(MAX_COMMAND_ITEMS)
            .fetch_all(pool)
            .await.map_err(crate::db_err)?;
    Ok(commands)
}

pub async fn toggle_command(pool: &SqlitePool, id: &str) -> ZenResult<()> {
    sqlx::query(
        "UPDATE zen_commands SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END WHERE id = ?",
    )
    .bind(id)
    .execute(pool)
    .await.map_err(crate::db_err)?;
    Ok(())
}

pub async fn get_hook_logs(pool: &SqlitePool, limit: i64) -> ZenResult<Vec<HookLogEntry>> {
    let logs = sqlx::query_as::<_, HookLogEntry>(
        "SELECT * FROM hook_logs ORDER BY timestamp DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(pool)
    .await.map_err(crate::db_err)?;
    Ok(logs)
}

pub async fn add_hook_log(pool: &SqlitePool, log: &HookLogEntry) -> ZenResult<()> {
    sqlx::query(
        "INSERT INTO hook_logs (timestamp, hook_id, hook_name, trigger, result, message) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(log.timestamp)
    .bind(&log.hook_id)
    .bind(&log.hook_name)
    .bind(&log.trigger)
    .bind(&log.result)
    .bind(&log.message)
    .execute(pool)
    .await.map_err(crate::db_err)?;
    Ok(())
}

// --- Hierarchical Memory (Phase 1) ---

pub async fn save_summary(
    pool: &SqlitePool,
    chat_id: &str,
    summary: &str,
    message_count: Option<i32>,
    token_count: Option<i32>,
) -> ZenResult<ConversationSummary> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO conversation_summaries (id, chat_id, summary, message_count, token_count) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(chat_id)
    .bind(summary)
    .bind(message_count)
    .bind(token_count)
    .execute(pool)
    .await.map_err(crate::db_err)?;

    let sum = sqlx::query_as::<_, ConversationSummary>(
        "SELECT * FROM conversation_summaries WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(pool)
    .await.map_err(crate::db_err)?;
    Ok(sum)
}

pub async fn get_current_summary(
    pool: &SqlitePool,
    chat_id: &str,
) -> ZenResult<Option<ConversationSummary>> {
    let sum = sqlx::query_as::<_, ConversationSummary>(
        "SELECT * FROM conversation_summaries WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(chat_id)
    .fetch_optional(pool)
    .await.map_err(crate::db_err)?;
    Ok(sum)
}

pub async fn get_previous_summaries(
    pool: &SqlitePool,
    chat_id: &str,
) -> ZenResult<Vec<ConversationSummary>> {
    let summaries = sqlx::query_as::<_, ConversationSummary>(
        "SELECT * FROM conversation_summaries WHERE chat_id = ? ORDER BY created_at ASC LIMIT ?",
    )
    .bind(chat_id)
    .bind(MAX_PREVIOUS_SUMMARY_ITEMS + 1)
    .fetch_all(pool)
    .await.map_err(crate::db_err)?;

    if summaries.len() > 1 {
        let count = summaries.len();
        Ok(summaries[0..count - 1].to_vec())
    } else {
        Ok(vec![])
    }
}

pub async fn mark_messages_compacted(
    pool: &SqlitePool,
    chat_id: &str,
    up_to_created_at: &str,
) -> ZenResult<()> {
    sqlx::query("UPDATE messages SET is_compacted = 1 WHERE chat_id = ? AND created_at <= ?")
        .bind(chat_id)
        .bind(up_to_created_at)
        .execute(pool)
        .await.map_err(crate::db_err)?;
    Ok(())
}

/// Mark exactly the messages whose IDs appear in `ids` as compacted.
///
/// Unlike `mark_messages_compacted` (which matches by `created_at <= cutoff`),
/// this function uses stable row identifiers so it never accidentally compacts
/// newer messages that happen to share the same second-level timestamp.
pub async fn mark_messages_compacted_by_ids(pool: &SqlitePool, ids: &[String]) -> ZenResult<()> {
    if ids.is_empty() {
        return Ok(());
    }
    // SQLite does not support array binding, so we build an IN-clause with
    // one placeholder per ID.  The IDs are UUIDs so there is no SQL-injection
    // risk from the format itself, but we still use bound parameters to be
    // safe and consistent with the rest of the codebase.
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "UPDATE messages SET is_compacted = 1 WHERE id IN ({placeholders})"
    );
    let mut q = sqlx::query(&sql);
    for id in ids {
        q = q.bind(id);
    }
    q.execute(pool).await.map_err(crate::db_err)?;
    Ok(())
}

pub async fn get_active_messages(pool: &SqlitePool, chat_id: &str) -> ZenResult<Vec<Message>> {
    let msgs = sqlx::query_as::<_, Message>(
        r#"
        SELECT * FROM (
            SELECT * FROM messages
            WHERE chat_id = ? AND (is_compacted = 0 OR is_compacted IS NULL)
            ORDER BY created_at DESC
            LIMIT 500
        ) ORDER BY created_at ASC
        "#,
    )
    .bind(chat_id)
    .fetch_all(pool)
    .await.map_err(crate::db_err)?;
    Ok(msgs)
}
