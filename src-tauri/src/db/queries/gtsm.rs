use sqlx::SqlitePool;
use uuid::Uuid;
use crate::db::models::*;
use crate::error::ZenResult;


// --- GTSM Geofences ---

use crate::db::models::GtsmGeofence;

pub async fn list_geofences(pool: &SqlitePool) -> ZenResult<Vec<GtsmGeofence>> {
    let geofences = sqlx::query_as::<_, GtsmGeofence>(
        "SELECT * FROM gtsm_geofences ORDER BY created_at DESC"
    )
    .fetch_all(pool)
    .await?;
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
           alert_enabled = excluded.alert_enabled, updated_at = datetime('now')"#
    )
    .bind(&geofence.id)
    .bind(&geofence.name)
    .bind(&geofence.geofence_type)
    .bind(&geofence.center_lat)
    .bind(&geofence.center_lon)
    .bind(&geofence.radius_km)
    .bind(&geofence.polygon_coords)
    .bind(&geofence.box_north)
    .bind(&geofence.box_south)
    .bind(&geofence.box_east)
    .bind(&geofence.box_west)
    .bind(&geofence.alert_enabled)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_geofence(pool: &SqlitePool, id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM gtsm_geofences WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}


// --- GTSM Markers ---

use crate::db::models::GtsmMarker;

pub async fn list_markers(pool: &SqlitePool) -> ZenResult<Vec<GtsmMarker>> {
    let markers = sqlx::query_as::<_, GtsmMarker>(
        "SELECT * FROM gtsm_markers ORDER BY created_at DESC"
    )
    .fetch_all(pool)
    .await?;
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
           updated_at = datetime('now')"#
    )
    .bind(&marker.id)
    .bind(&marker.name)
    .bind(&marker.marker_type)
    .bind(&marker.lat)
    .bind(&marker.lon)
    .bind(&marker.alt)
    .bind(&marker.color)
    .bind(&marker.icon)
    .bind(&marker.metadata)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_marker(pool: &SqlitePool, id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM gtsm_markers WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

