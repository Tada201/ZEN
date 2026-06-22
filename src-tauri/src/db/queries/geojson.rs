use crate::db::models::GtsmGeojsonLayer;
use crate::error::ZenResult;
use sqlx::SqlitePool;

const MAX_GTSM_GEOJSON_LAYERS: i64 = 500;

pub async fn list_geojson_layers(pool: &SqlitePool) -> ZenResult<Vec<GtsmGeojsonLayer>> {
    list_geojson_layers_page(pool, MAX_GTSM_GEOJSON_LAYERS, 0).await
}

pub async fn list_geojson_layers_page(
    pool: &SqlitePool,
    limit: i64,
    offset: i64,
) -> ZenResult<Vec<GtsmGeojsonLayer>> {
    let layers = sqlx::query_as::<_, GtsmGeojsonLayer>(
        "SELECT id, name, description, color, visible, geojson, feature_count, geometry_types, bbox_json, created_at, updated_at 
         FROM gtsm_geojson_layers 
         ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
    .bind(limit.clamp(1, MAX_GTSM_GEOJSON_LAYERS + 1))
    .bind(offset.max(0))
    .fetch_all(pool)
    .await?;
    Ok(layers)
}

pub async fn save_geojson_layer(pool: &SqlitePool, layer: &GtsmGeojsonLayer) -> ZenResult<()> {
    sqlx::query(
        r#"INSERT INTO gtsm_geojson_layers 
           (id, name, description, color, visible, geojson, feature_count, geometry_types, bbox_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           description = excluded.description,
           color = excluded.color,
           visible = excluded.visible,
           geojson = excluded.geojson,
           feature_count = excluded.feature_count,
           geometry_types = excluded.geometry_types,
           bbox_json = excluded.bbox_json,
           updated_at = excluded.updated_at"#,
    )
    .bind(&layer.id)
    .bind(&layer.name)
    .bind(&layer.description)
    .bind(&layer.color)
    .bind(layer.visible)
    .bind(&layer.geojson)
    .bind(layer.feature_count)
    .bind(&layer.geometry_types)
    .bind(&layer.bbox_json)
    .bind(&layer.created_at)
    .bind(&layer.updated_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_geojson_layer(pool: &SqlitePool, id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM gtsm_geojson_layers WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}
