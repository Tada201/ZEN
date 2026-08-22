use crate::db::models::*;
use crate::error::ZenResult;
use sqlx::{Row, SqlitePool};

// --- Settings ---

pub async fn count_settings(pool: &SqlitePool) -> ZenResult<i64> {
    Ok(sqlx::query("SELECT COUNT(*) AS count FROM settings").fetch_one(pool).await?.get::<i64, _>("count"))
}

pub async fn get_setting(pool: &SqlitePool, key: &str) -> ZenResult<Option<String>> {
    let result = sqlx::query_as::<_, Setting>("SELECT * FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await?;
    Ok(result.map(|s| s.value))
}

pub async fn get_all_settings(
    pool: &SqlitePool,
) -> ZenResult<std::collections::HashMap<String, String>> {
    let results = sqlx::query_as::<_, Setting>("SELECT * FROM settings")
        .fetch_all(pool)
        .await?;

    let mut map = std::collections::HashMap::new();
    for s in results {
        map.insert(s.key, s.value);
    }
    Ok(map)
}

pub async fn set_setting(pool: &SqlitePool, key: &str, value: &str) -> ZenResult<()> {
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')"
    )
    .bind(key)
    .bind(value)
    .bind(value)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn bulk_set_settings(
    pool: &SqlitePool,
    settings: std::collections::HashMap<String, String>,
) -> ZenResult<()> {
    let mut tx = pool.begin().await?;

    for (key, value) in settings {
        sqlx::query(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')"
        )
        .bind(&key)
        .bind(&value)
        .bind(&value)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn clear_settings(pool: &SqlitePool) -> ZenResult<()> {
    sqlx::query("DELETE FROM settings").execute(pool).await?;
    Ok(())
}

pub async fn increment_setting(pool: &SqlitePool, key: &str) -> ZenResult<()> {
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES (?, '1')
         ON CONFLICT(key) DO UPDATE SET
           value = CAST(CAST(value AS INTEGER) + 1 AS TEXT),
           updated_at = datetime('now')",
    )
    .bind(key)
    .execute(pool)
    .await?;
    Ok(())
}
