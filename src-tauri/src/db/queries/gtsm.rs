use crate::error::ZenResult;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

const MAX_GTSM_GEOFENCE_ITEMS: i64 = 1_000;
const MAX_GTSM_MARKER_ITEMS: i64 = 1_000;
const MAX_TELEMETRY_HISTORY_ITEMS: i64 = 5_000;
const MAX_ENTITY_TRACK_POINTS: i64 = 2_000;

// --- GTSM Geofences ---

use crate::db::models::GtsmGeofence;

pub async fn list_geofences(pool: &SqlitePool) -> ZenResult<Vec<GtsmGeofence>> {
    list_geofences_page(pool, MAX_GTSM_GEOFENCE_ITEMS, 0).await
}

pub async fn list_geofences_page(
    pool: &SqlitePool,
    limit: i64,
    offset: i64,
) -> ZenResult<Vec<GtsmGeofence>> {
    let geofences = sqlx::query_as::<_, GtsmGeofence>(
        "SELECT * FROM gtsm_geofences ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
    .bind(limit.clamp(1, MAX_GTSM_GEOFENCE_ITEMS + 1))
    .bind(offset.max(0))
    .fetch_all(pool)
    .await.map_err(crate::error::db_err)?;
    Ok(geofences)
}

pub async fn save_geofence(pool: &SqlitePool, geofence: &GtsmGeofence) -> ZenResult<()> {
    sqlx::query(
        r#"INSERT INTO gtsm_geofences 
           (id, name, geofence_type, center_lat, center_lon, radius_km, polygon_coords, 
            box_north, box_south, box_east, box_west, alert_enabled)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, geofence_type = excluded.geofence_type,
           center_lat = excluded.center_lat, center_lon = excluded.center_lon,
           radius_km = excluded.radius_km, polygon_coords = excluded.polygon_coords,
           box_north = excluded.box_north, box_south = excluded.box_south,
           box_east = excluded.box_east, box_west = excluded.box_west,
           alert_enabled = excluded.alert_enabled, updated_at = datetime('now')"#,
    )
    .bind(&geofence.id)
    .bind(&geofence.name)
    .bind(&geofence.geofence_type)
    .bind(geofence.center_lat)
    .bind(geofence.center_lon)
    .bind(geofence.radius_km)
    .bind(&geofence.polygon_coords)
    .bind(geofence.box_north)
    .bind(geofence.box_south)
    .bind(geofence.box_east)
    .bind(geofence.box_west)
    .bind(geofence.alert_enabled)
    .execute(pool)
    .await.map_err(crate::error::db_err)?;
    Ok(())
}

pub async fn delete_geofence(pool: &SqlitePool, id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM gtsm_geofences WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await.map_err(crate::error::db_err)?;
    Ok(())
}

// --- GTSM Markers ---

use crate::db::models::GtsmMarker;

pub async fn list_markers(pool: &SqlitePool) -> ZenResult<Vec<GtsmMarker>> {
    list_markers_page(pool, MAX_GTSM_MARKER_ITEMS, 0).await
}

pub async fn list_markers_page(
    pool: &SqlitePool,
    limit: i64,
    offset: i64,
) -> ZenResult<Vec<GtsmMarker>> {
    let markers = sqlx::query_as::<_, GtsmMarker>(
        "SELECT * FROM gtsm_markers ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
    .bind(limit.clamp(1, MAX_GTSM_MARKER_ITEMS + 1))
    .bind(offset.max(0))
    .fetch_all(pool)
    .await.map_err(crate::error::db_err)?;
    Ok(markers)
}

pub async fn save_marker(pool: &SqlitePool, marker: &GtsmMarker) -> ZenResult<()> {
    sqlx::query(
        r#"INSERT INTO gtsm_markers 
           (id, name, marker_type, lat, lon, alt, color, icon, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, marker_type = excluded.marker_type,
           lat = excluded.lat, lon = excluded.lon, alt = excluded.alt,
           color = excluded.color, icon = excluded.icon, metadata = excluded.metadata,
           updated_at = datetime('now')"#,
    )
    .bind(&marker.id)
    .bind(&marker.name)
    .bind(&marker.marker_type)
    .bind(marker.lat)
    .bind(marker.lon)
    .bind(marker.alt)
    .bind(&marker.color)
    .bind(&marker.icon)
    .bind(&marker.metadata)
    .execute(pool)
    .await.map_err(crate::error::db_err)?;
    Ok(())
}

pub async fn delete_marker(pool: &SqlitePool, id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM gtsm_markers WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await.map_err(crate::error::db_err)?;
    Ok(())
}

/// A single telemetry snapshot row.
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

/// Lightweight track point for trail rendering.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TrackPoint {
    pub timestamp: i64,
    pub lat: f64,
    pub lon: f64,
    pub alt: f64,
}

pub async fn record_snapshot(
    pool: &SqlitePool,
    entity_type: &str,
    entities: Vec<(String, f64, f64, f64, Option<String>)>,
) -> Result<()> {
    if entities.is_empty() {
        return Ok(());
    }

    let now = chrono::Utc::now().timestamp();
    let mut tx = pool.begin().await.map_err(crate::error::db_err)?;

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
        .await.map_err(crate::error::db_err)?;
    }

    tx.commit().await.map_err(crate::error::db_err)?;
    tracing::debug!(
        "Recorded {} {} snapshots at timestamp {}",
        entities.len(),
        entity_type,
        now
    );
    Ok(())
}

pub async fn query_history(
    pool: &SqlitePool,
    entity_type: &str,
    timestamp: i64,
) -> Result<Vec<TelemetrySnapshot>> {
    query_history_page(pool, entity_type, timestamp, MAX_TELEMETRY_HISTORY_ITEMS, 0).await
}

pub async fn query_history_page(
    pool: &SqlitePool,
    entity_type: &str,
    timestamp: i64,
    limit: i64,
    offset: i64,
) -> Result<Vec<TelemetrySnapshot>> {
    let nearest_ts: Option<i64> = sqlx::query_scalar(
        "SELECT timestamp FROM telemetry_snapshots
         WHERE entity_type = ?
         ORDER BY ABS(timestamp - ?)
         LIMIT 1",
    )
    .bind(entity_type)
    .bind(timestamp)
    .fetch_optional(pool)
    .await.map_err(crate::error::db_err)?;

    let nearest = match nearest_ts {
        Some(ts) => ts,
        None => return Ok(vec![]),
    };

    let rows = sqlx::query_as::<_, TelemetrySnapshot>(
        "SELECT * FROM telemetry_snapshots
         WHERE entity_type = ? AND timestamp = ?
         ORDER BY entity_id
         LIMIT ? OFFSET ?",
    )
    .bind(entity_type)
    .bind(nearest)
    .bind(limit.clamp(1, MAX_TELEMETRY_HISTORY_ITEMS + 1))
    .bind(offset.max(0))
    .fetch_all(pool)
    .await.map_err(crate::error::db_err)?;

    Ok(rows)
}

pub async fn query_entity_track(
    pool: &SqlitePool,
    entity_id: &str,
    start_time: i64,
    end_time: i64,
) -> Result<Vec<TrackPoint>> {
    query_entity_track_page(
        pool,
        entity_id,
        start_time,
        end_time,
        MAX_ENTITY_TRACK_POINTS,
        0,
    )
    .await
}

pub async fn query_entity_track_page(
    pool: &SqlitePool,
    entity_id: &str,
    start_time: i64,
    end_time: i64,
    limit: i64,
    offset: i64,
) -> Result<Vec<TrackPoint>> {
    let rows = sqlx::query_as::<_, TrackPoint>(
        "SELECT timestamp, lat, lon, alt FROM telemetry_snapshots
         WHERE entity_id = ? AND timestamp BETWEEN ? AND ?
         ORDER BY timestamp ASC
         LIMIT ? OFFSET ?",
    )
    .bind(entity_id)
    .bind(start_time)
    .bind(end_time)
    .bind(limit.clamp(1, MAX_ENTITY_TRACK_POINTS + 1))
    .bind(offset.max(0))
    .fetch_all(pool)
    .await.map_err(crate::error::db_err)?;

    Ok(rows)
}

pub async fn get_available_timerange(pool: &SqlitePool) -> Result<Option<(i64, i64)>> {
    let row: Option<(i64, i64)> =
        sqlx::query_as("SELECT MIN(timestamp), MAX(timestamp) FROM telemetry_snapshots")
            .fetch_optional(pool)
            .await.map_err(crate::error::db_err)?;

    Ok(row)
}

pub async fn cleanup_old_snapshots(pool: &SqlitePool, max_age_hours: i64) -> Result<u64> {
    let cutoff = chrono::Utc::now().timestamp() - (max_age_hours * 3600);

    let result = sqlx::query("DELETE FROM telemetry_snapshots WHERE timestamp < ?")
        .bind(cutoff)
        .execute(pool)
        .await.map_err(crate::error::db_err)?;

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

pub async fn get_storage_stats(pool: &SqlitePool) -> Result<(i64, i64)> {
    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM telemetry_snapshots")
        .fetch_one(pool)
        .await.map_err(crate::error::db_err)?;

    let entities: i64 =
        sqlx::query_scalar("SELECT COUNT(DISTINCT entity_id) FROM telemetry_snapshots")
            .fetch_one(pool)
            .await.map_err(crate::error::db_err)?;

    Ok((total, entities))
}
