use sqlx::SqlitePool;
use zen_core::ZenResult;

pub(super) async fn gtsm_core(pool: &SqlitePool) -> ZenResult<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS gtsm_geofences (
            id              TEXT PRIMARY KEY,
            name            TEXT NOT NULL,
            geofence_type   TEXT NOT NULL CHECK(geofence_type IN ('circle','polygon','box')),
            center_lat      REAL,
            center_lon      REAL,
            radius_km       REAL,
            polygon_coords  TEXT,  -- JSON array of [lat,lon] pairs
            box_north       REAL,
            box_south       REAL,
            box_east        REAL,
            box_west        REAL,
            alert_enabled   INTEGER DEFAULT 1,
            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    // ── GTSM Custom Markers ──
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS gtsm_markers (
            id              TEXT PRIMARY KEY,
            name            TEXT NOT NULL,
            marker_type     TEXT NOT NULL CHECK(marker_type IN ('waypoint','target','poi')),
            lat             REAL NOT NULL,
            lon             REAL NOT NULL,
            alt             REAL DEFAULT 0,
            color           TEXT DEFAULT '#00FF9F',
            icon            TEXT DEFAULT 'default',
            metadata        TEXT,  -- JSON object
            created_at      TEXT DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;
    Ok(())
}

pub(super) async fn gtsm_layers(pool: &SqlitePool) -> ZenResult<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS gtsm_geojson_layers (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            description TEXT,
            data        TEXT NOT NULL,
            is_visible  INTEGER NOT NULL DEFAULT 1,
            style       TEXT NOT NULL,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;
    Ok(())
}
