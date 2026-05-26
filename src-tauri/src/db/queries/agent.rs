use crate::error::ZenResult;
use sqlx::SqlitePool;

pub async fn get_orchestration_plan_counts(pool: &SqlitePool) -> ZenResult<(usize, usize)> {
    let active = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM orchestration_plans WHERE status NOT IN ('completed', 'failed')",
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0) as usize;

    let completed = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM orchestration_plans WHERE status = 'completed'",
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0) as usize;

    Ok((active, completed))
}
