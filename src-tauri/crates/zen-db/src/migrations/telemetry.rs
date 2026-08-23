use sqlx::SqlitePool;
use zen_core::ZenResult;

pub(super) async fn telemetry(pool: &SqlitePool) -> ZenResult<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS telemetry_snapshots (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id   TEXT NOT NULL,
            timestamp   INTEGER NOT NULL,
            lat         REAL NOT NULL,
            lon         REAL NOT NULL,
            alt         REAL NOT NULL DEFAULT 0,
            metadata    TEXT
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    // Indexes for efficient history queries
    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_snap_type_time ON telemetry_snapshots(entity_type, timestamp);"
    ).execute(pool).await;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_snap_entity ON telemetry_snapshots(entity_id, timestamp);",
    )
    .execute(pool)
    .await;
    Ok(())
}
