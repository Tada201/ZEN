use zen_core::ZenResult;
use sqlx::SqlitePool;

const MAX_GTSM_FAVORITES: i64 = 500;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GtsmFavorite {
    pub id: String,
    pub entity_id: String,
    pub label: String,
    pub layer_id: String,
    pub layer_label: String,
    pub lat: f64,
    pub lon: f64,
    pub alt: f64,
    pub created_at: String,
}

pub async fn list_favorites(pool: &SqlitePool) -> ZenResult<Vec<GtsmFavorite>> {
    let favorites = sqlx::query_as::<_, GtsmFavorite>(
        "SELECT id, entity_id, label, layer_id, layer_label, lat, lon, alt, created_at 
         FROM gtsm_favorites 
         ORDER BY created_at DESC 
         LIMIT ?",
    )
    .bind(MAX_GTSM_FAVORITES)
    .fetch_all(pool)
    .await.map_err(crate::db_err)?;
    Ok(favorites)
}

pub async fn save_favorite(pool: &SqlitePool, favorite: &GtsmFavorite) -> ZenResult<()> {
    sqlx::query(
        r#"INSERT INTO gtsm_favorites 
           (id, entity_id, label, layer_id, layer_label, lat, lon, alt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
           label = excluded.label, layer_id = excluded.layer_id,
           layer_label = excluded.layer_label, lat = excluded.lat,
           lon = excluded.lon, alt = excluded.alt"#,
    )
    .bind(&favorite.id)
    .bind(&favorite.entity_id)
    .bind(&favorite.label)
    .bind(&favorite.layer_id)
    .bind(&favorite.layer_label)
    .bind(favorite.lat)
    .bind(favorite.lon)
    .bind(favorite.alt)
    .execute(pool)
    .await.map_err(crate::db_err)?;
    Ok(())
}

pub async fn delete_favorite(pool: &SqlitePool, id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM gtsm_favorites WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await.map_err(crate::db_err)?;
    Ok(())
}
