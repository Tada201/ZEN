use anyhow::Result;
use sqlx::SqlitePool;
use serde::{Serialize, Deserialize};

/// A single telemetry snapshot row
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TelemetrySnapshot {
    pub id: i64,
    pub entity_type: String,
    pub entity_id: String,
    pub timestamp: i64,
    pub lat: f64,
    pub lon: f64,
    pub alt: f64,
    pub metadata: Option<String>,
}

/// Lightweight track point for trail rendering
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TrackPoint {
    pub timestamp: i64,
    pub lat: f64,
    pub lon: f64,
    pub alt: f64,
}

/// Record a batch of entities as a snapshot at the given timestamp
pub async fn record_snapshot(
    pool: &SqlitePool,
    entity_type: &str,
    entities: Vec<(String, f64, f64, f64, Option<String>)>, // (id, lat, lon, alt, metadata_json)
) -> Result<()> {
    if entities.is_empty() {
        return Ok(());
    }

    let now = chrono::Utc::now().timestamp();
    
    // Use a transaction for bulk insert performance
    let mut tx = pool.begin().await?;
    
    for (entity_id, lat, lon, alt, metadata) in &entities {
        sqlx::query(
            "INSERT INTO telemetry_snapshots (entity_type, entity_id, timestamp, lat, lon, alt, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(entity_type)
        .bind(entity_id)
        .bind(now)
        .bind(lat)
        .bind(lon)
        .bind(alt)
        .bind(metadata)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    tracing::debug!(
        "Recorded {} {} snapshots at timestamp {}",
        entities.len(),
        entity_type,
        now
    );
    Ok(())
}

/// Query historical entities at the nearest snapshot to a given timestamp
pub async fn query_history(
    pool: &SqlitePool,
    entity_type: &str,
    timestamp: i64,
) -> Result<Vec<TelemetrySnapshot>> {
    // Find the nearest snapshot timestamp for this entity type
    let nearest_ts: Option<i64> = sqlx::query_scalar(
        "SELECT timestamp FROM telemetry_snapshots 
         WHERE entity_type = ? 
         ORDER BY ABS(timestamp - ?) 
         LIMIT 1"
    )
    .bind(entity_type)
    .bind(timestamp)
    .fetch_optional(pool)
    .await?;

    let nearest = match nearest_ts {
        Some(ts) => ts,
        None => return Ok(vec![]),
    };

    let rows = sqlx::query_as::<_, TelemetrySnapshot>(
        "SELECT * FROM telemetry_snapshots 
         WHERE entity_type = ? AND timestamp = ? 
         ORDER BY entity_id"
    )
    .bind(entity_type)
    .bind(nearest)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

/// Get position trail for a single entity over a time range
pub async fn query_entity_track(
    pool: &SqlitePool,
    entity_id: &str,
    start_time: i64,
    end_time: i64,
) -> Result<Vec<TrackPoint>> {
    let rows = sqlx::query_as::<_, TrackPoint>(
        "SELECT timestamp, lat, lon, alt FROM telemetry_snapshots 
         WHERE entity_id = ? AND timestamp BETWEEN ? AND ? 
         ORDER BY timestamp ASC"
    )
    .bind(entity_id)
    .bind(start_time)
    .bind(end_time)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

/// Get the available time range of stored snapshots
pub async fn get_available_timerange(pool: &SqlitePool) -> Result<Option<(i64, i64)>> {
    let row: Option<(i64, i64)> = sqlx::query_as(
        "SELECT MIN(timestamp), MAX(timestamp) FROM telemetry_snapshots"
    )
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

/// Delete snapshots older than the specified number of hours
pub async fn cleanup_old_snapshots(pool: &SqlitePool, max_age_hours: i64) -> Result<u64> {
    let cutoff = chrono::Utc::now().timestamp() - (max_age_hours * 3600);
    
    let result = sqlx::query("DELETE FROM telemetry_snapshots WHERE timestamp < ?")
        .bind(cutoff)
        .execute(pool)
        .await?;

    let deleted = result.rows_affected();
    if deleted > 0 {
        tracing::info!(
            "Cleaned up {} old telemetry snapshots (older than {}h)",
            deleted,
            max_age_hours
        );
    }

    Ok(deleted)
}

/// Get snapshot storage statistics
pub async fn get_storage_stats(pool: &SqlitePool) -> Result<(i64, i64)> {
    // (total_rows, distinct_entity_count)
    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM telemetry_snapshots")
        .fetch_one(pool)
        .await?;
    
    let entities: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT entity_id) FROM telemetry_snapshots"
    )
    .fetch_one(pool)
    .await?;

    Ok((total, entities))
}
