use super::AppState;
use crate::commands::pagination::{normalize_page, page_from_fetch, Page};
use crate::error::ZenError;
use tauri::{AppHandle, Manager, State};

fn map_catalog_directory(app: &AppHandle) -> Result<std::path::PathBuf, ZenError> {
    app.path().app_data_dir()
        .map_err(|error| ZenError::Internal(format!("Could not resolve Zen application data directory: {error}")))
}

// GTSM Types
use crate::db::models::{GtsmGeofence, GtsmMarker};
use crate::services::gtsm::history::{TelemetrySnapshot, TrackPoint};
use crate::services::gtsm::types::{NavigationRoute, RoutingProfile};
use crate::services::gtsm::{
    Earthquake, Flight, FusionEvent, GeocodingResult, GeofenceZone, MilitaryAircraft, Route,
    Satellite, WeatherGridPoint, WeatherPoint,
};

// ─── Realtime Telemetry Cache & API Commands ───

#[tauri::command]
pub async fn get_satellites(state: State<'_, AppState>) -> Result<Vec<Satellite>, ZenError> {
    if let Some(cached) = state.gtsm_cache.get_satellites().await {
        return Ok(cached);
    }
    let (tx, _rx) = tokio::sync::broadcast::channel(1);
    let sats = crate::services::gtsm::satellites::fetch_satellites(&tx)
        .await
        .map_err(|e| ZenError::Internal(e.to_string()))?;
    state.gtsm_cache.set_satellites(sats.clone(), 120).await;
    Ok(sats)
}

#[tauri::command]
pub async fn get_flights(state: State<'_, AppState>) -> Result<Vec<Flight>, ZenError> {
    if let Some(cached) = state.gtsm_cache.get_flights().await {
        return Ok(cached);
    }
    let flights = crate::services::gtsm::flights::fetch_flights()
        .await
        .map_err(|e| ZenError::Internal(e.to_string()))?;
    state.gtsm_cache.set_flights(flights.clone(), 15).await;
    Ok(flights)
}

#[tauri::command]
pub async fn get_earthquakes(
    state: State<'_, AppState>,
    min_magnitude: Option<f64>,
    hours: Option<u32>,
) -> Result<Vec<Earthquake>, ZenError> {
    if let Some(cached) = state.gtsm_cache.get_earthquakes().await {
        return Ok(cached);
    }
    let quakes = crate::services::gtsm::earthquakes::fetch_earthquakes(
        min_magnitude.unwrap_or(2.5),
        hours.unwrap_or(24),
    )
    .await
    .map_err(|e| ZenError::Internal(e.to_string()))?;
    state.gtsm_cache.set_earthquakes(quakes.clone(), 300).await;
    Ok(quakes)
}

#[tauri::command]
pub async fn get_weather(
    state: State<'_, AppState>,
    lat: f64,
    lon: f64,
) -> Result<WeatherPoint, ZenError> {
    if let Some(cached) = state.gtsm_cache.get_weather(lat, lon).await {
        return Ok(cached);
    }
    let weather = crate::services::gtsm::weather::fetch_weather(lat, lon)
        .await
        .map_err(|e| ZenError::Internal(e.to_string()))?;
    state.gtsm_cache.set_weather(weather.clone(), 600).await;
    Ok(weather)
}

#[tauri::command]
pub async fn get_weather_grid(
    lat_min: f64,
    lat_max: f64,
    lon_min: f64,
    lon_max: f64,
    step: f64,
) -> Result<Vec<WeatherGridPoint>, ZenError> {
    let grid = crate::services::gtsm::weather::fetch_weather_grid(
        lat_min, lat_max, lon_min, lon_max, step,
    )
    .await
    .map_err(|e| ZenError::Internal(e.to_string()))?;
    Ok(grid)
}

#[tauri::command]
pub async fn get_military_aircraft(
    state: State<'_, AppState>,
) -> Result<Vec<MilitaryAircraft>, ZenError> {
    if let Some(cached) = state.gtsm_cache.get_military().await {
        return Ok(cached);
    }
    let aircraft = crate::services::gtsm::military::fetch_military()
        .await
        .map_err(|e| ZenError::Internal(e.to_string()))?;
    state.gtsm_cache.set_military(aircraft.clone(), 30).await;
    Ok(aircraft)
}

#[tauri::command]
pub async fn get_vessels(state: State<'_, AppState>) -> Result<Vec<crate::services::gtsm::Vessel>, ZenError> {
    Ok(state.gtsm_cache.get_vessels().await.unwrap_or_default())
}

#[tauri::command]
pub async fn get_natural_events(
    state: State<'_, AppState>,
) -> Result<Vec<crate::services::gtsm::NaturalEvent>, ZenError> {
    if let Some(cached) = state.gtsm_cache.get_natural_events().await {
        return Ok(cached);
    }
    let events = crate::services::gtsm::nasa_events::fetch_natural_events()
        .await
        .map_err(|error| ZenError::Internal(error.to_string()))?;
    state.gtsm_cache.set_natural_events(events.clone(), 900).await;
    Ok(events)
}

#[tauri::command]
pub async fn get_undersea_cables() -> Result<serde_json::Value, ZenError> {
    crate::services::gtsm::cables::fetch_undersea_cables()
        .await
        .map_err(|error| ZenError::Internal(error.to_string()))
}

#[tauri::command]
pub fn list_map_connectors() -> Vec<crate::services::gtsm::connectors::MapConnectorMetadata> {
    crate::services::gtsm::connectors::built_in_connectors()
}

#[tauri::command]
pub async fn list_map_cameras(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<crate::services::gtsm::cameras::CameraCatalogEntry>, ZenError> {
    crate::services::gtsm::cameras::list_camera_catalog(
        &map_catalog_directory(&app)?,
        &state.settings_manager,
        &state.secret_manager,
        &state.security,
    ).await
}

#[tauri::command]
pub async fn get_map_camera_catalog(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<crate::services::gtsm::cameras::CameraCatalogSnapshot, ZenError> {
    crate::services::gtsm::cameras::get_camera_catalog_snapshot(
        &map_catalog_directory(&app)?,
        &state.settings_manager,
        &state.secret_manager,
        &state.security,
    )
    .await
}

#[tauri::command]
pub async fn resolve_map_camera_playback(
    app: AppHandle,
    state: State<'_, AppState>,
    camera_id: String,
) -> Result<crate::services::gtsm::cameras::CameraPlaybackDescriptor, ZenError> {
    crate::services::gtsm::cameras::resolve_camera_playback(
        &camera_id,
        &map_catalog_directory(&app)?,
        &state.settings_manager,
        &state.secret_manager,
        &state.security,
    )
    .await
}

#[tauri::command]
pub async fn test_map_camera_catalog(app: AppHandle, state: State<'_, AppState>) -> Result<usize, ZenError> {
    crate::services::gtsm::cameras::test_camera_catalog(
        &map_catalog_directory(&app)?,
        &state.settings_manager,
        &state.secret_manager,
        &state.security,
    ).await
}

#[tauri::command]
pub async fn import_local_map_camera_catalog(
    app: AppHandle,
    state: State<'_, AppState>,
    source_name: String,
    bytes: Vec<u8>,
) -> Result<crate::services::gtsm::cameras::LocalCameraCatalogImportReport, ZenError> {
    crate::services::gtsm::cameras::import_local_camera_catalog(
        &map_catalog_directory(&app)?, source_name, bytes, &state.security,
    ).await
}

#[tauri::command]
pub async fn calculate_route(
    state: State<'_, AppState>,
    start_lat: f64,
    start_lon: f64,
    end_lat: f64,
    end_lon: f64,
) -> Result<Route, ZenError> {
    let key = format!(
        "{start_lat:.4},{start_lon:.4}->{end_lat:.4},{end_lon:.4}"
    );
    if let Some(cached) = state.gtsm_cache.get_route(&key).await {
        return Ok(cached);
    }
    let route =
        crate::services::gtsm::routing::calculate_route(start_lat, start_lon, end_lat, end_lon)
            .await
            .map_err(|e| ZenError::Internal(e.to_string()))?;
    state.gtsm_cache.set_route(&key, route.clone(), 3600).await;
    Ok(route)
}

#[tauri::command]
pub async fn geocode_search(
    state: State<'_, AppState>,
    query: String,
    limit: Option<u8>,
) -> Result<Vec<GeocodingResult>, ZenError> {
    if let Some(cached) = state.gtsm_cache.get_geocoding(&query).await {
        return Ok(cached);
    }
    let results = crate::services::gtsm::geocoding::search(&query, limit.unwrap_or(5))
        .await
        .map_err(|e| ZenError::Internal(e.to_string()))?;
    state
        .gtsm_cache
        .set_geocoding(&query, results.clone(), 86400)
        .await;
    Ok(results)
}

#[tauri::command]
pub async fn reverse_geocode(
    _state: State<'_, AppState>,
    lat: f64,
    lon: f64,
) -> Result<GeocodingResult, ZenError> {
    crate::services::gtsm::geocoding::reverse(lat, lon)
        .await
        .map_err(|e| ZenError::Internal(e.to_string()))
}

// ─── Realtime Geofencing Engine Commands ───

#[tauri::command]
pub async fn create_geofence(
    state: State<'_, AppState>,
    zone: GeofenceZone,
) -> Result<(), ZenError> {
    state.geofence_engine.add_zone(zone).await;
    Ok(())
}

#[tauri::command]
pub async fn list_geofences(state: State<'_, AppState>) -> Result<Vec<GeofenceZone>, ZenError> {
    Ok(state.geofence_engine.list_zones().await)
}

#[tauri::command]
pub async fn remove_geofence(state: State<'_, AppState>, zone_id: String) -> Result<(), ZenError> {
    state.geofence_engine.remove_zone(&zone_id).await;
    Ok(())
}

// ─── Data Fusion Commands ───

#[tauri::command]
pub async fn get_fusion_events(
    state: State<'_, AppState>,
    radius_km: Option<f64>,
) -> Result<Vec<FusionEvent>, ZenError> {
    let radius = radius_km.unwrap_or(500.0);
    let mut events = Vec::new();

    let sats = state.gtsm_cache.get_satellites().await.unwrap_or_default();
    let quakes = state.gtsm_cache.get_earthquakes().await.unwrap_or_default();
    let military = state.gtsm_cache.get_military().await.unwrap_or_default();
    let flights = state.gtsm_cache.get_flights().await.unwrap_or_default();

    events.extend(
        crate::services::gtsm::fusion::correlate_satellites_earthquakes(&sats, &quakes, radius),
    );
    events.extend(
        crate::services::gtsm::fusion::correlate_military_earthquakes(&military, &quakes, radius),
    );
    events.extend(crate::services::gtsm::fusion::correlate_flights_military(
        &flights, &military, radius,
    ));

    events.sort_by(|a, b| {
        b.confidence
            .partial_cmp(&a.confidence)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(events)
}

// ─── ECEF Camera tracking and Navigation Route computation ───

#[tauri::command]
pub async fn compute_navigation_route(
    state: State<'_, AppState>,
    start_lat: f64,
    start_lon: f64,
    end_lat: f64,
    end_lon: f64,
    profile: String,
) -> Result<NavigationRoute, ZenError> {
    let prof = match profile.to_lowercase().as_str() {
        "pedestrian" | "walking" => RoutingProfile::Pedestrian,
        "car" | "driving" => RoutingProfile::Car,
        "truck" | "heavy" => RoutingProfile::Truck,
        _ => RoutingProfile::Car,
    };

    let pool = state
        .db()
        .await
        .map_err(|e| ZenError::Internal(e.to_string()))?;

    // Fetch API keys through SecretService; settings reads must not expose credentials.
    let here_key = state
        .secret_manager
        .get_secret("here_api_key")
        .await
        .map_err(|e| ZenError::Internal(e.to_string()))?
        .unwrap_or_default();
    let google_key = state
        .secret_manager
        .get_secret("google_maps_api_key")
        .await
        .map_err(|e| ZenError::Internal(e.to_string()))?
        .unwrap_or_default();

    let start_coords = [start_lat, start_lon];
    let end_coords = [end_lat, end_lon];

    crate::services::gtsm::navigation::compute_route(
        start_coords,
        end_coords,
        prof,
        if here_key.is_empty() {
            None
        } else {
            Some(here_key)
        },
        if google_key.is_empty() {
            None
        } else {
            Some(google_key)
        },
        Some(&pool),
    )
    .await
    .map_err(|e| ZenError::Internal(e.to_string()))
}

// ─── Camera Telemetry History Snapshot Commands ───

#[tauri::command]
pub async fn get_telemetry_history(
    state: State<'_, AppState>,
    entity_type: String,
    timestamp: i64,
) -> Result<Vec<TelemetrySnapshot>, ZenError> {
    crate::services::gtsm::history::query_history(&state.db().await?, &entity_type, timestamp)
        .await
        .map_err(|e| ZenError::Internal(e.to_string()))
}

#[tauri::command]
pub async fn get_telemetry_history_page(
    state: State<'_, AppState>,
    entity_type: String,
    timestamp: i64,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Page<TelemetrySnapshot>, ZenError> {
    let (limit, offset) = normalize_page(limit, offset);
    let items = crate::services::gtsm::history::query_history_page(
        &state.db().await?,
        &entity_type,
        timestamp,
        limit + 1,
        offset,
    )
    .await
    .map_err(|e| ZenError::Internal(e.to_string()))?;
    Ok(page_from_fetch(items, limit, offset))
}

#[tauri::command]
pub async fn get_entity_track(
    state: State<'_, AppState>,
    entity_id: String,
    start_time: i64,
    end_time: i64,
) -> Result<Vec<TrackPoint>, ZenError> {
    crate::services::gtsm::history::query_entity_track(
        &state.db().await?,
        &entity_id,
        start_time,
        end_time,
    )
    .await
    .map_err(|e| ZenError::Internal(e.to_string()))
}

#[tauri::command]
pub async fn get_entity_track_page(
    state: State<'_, AppState>,
    entity_id: String,
    start_time: i64,
    end_time: i64,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Page<TrackPoint>, ZenError> {
    let (limit, offset) = normalize_page(limit, offset);
    let items = crate::services::gtsm::history::query_entity_track_page(
        &state.db().await?,
        &entity_id,
        start_time,
        end_time,
        limit + 1,
        offset,
    )
    .await
    .map_err(|e| ZenError::Internal(e.to_string()))?;
    Ok(page_from_fetch(items, limit, offset))
}

#[tauri::command]
pub async fn get_telemetry_stats(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, ZenError> {
    let (total, entities) = crate::services::gtsm::history::get_storage_stats(&state.db().await?)
        .await
        .map_err(|e| ZenError::Internal(e.to_string()))?;

    let time_range = crate::services::gtsm::history::get_available_timerange(&state.db().await?)
        .await
        .map_err(|e| ZenError::Internal(e.to_string()))?;

    Ok(serde_json::json!({
        "total_snapshots": total,
        "distinct_entities": entities,
        "time_range": time_range.map(|(start, end)| serde_json::json!({
            "start": start,
            "end": end,
        })),
    }))
}

// ─── GTSM SQLite DB Geofences & Markers Persistence Commands ───

#[tauri::command]
pub async fn list_geofences_db(state: State<'_, AppState>) -> Result<Vec<GtsmGeofence>, ZenError> {
    crate::db::queries::list_geofences(&state.db().await?)
        .await
        .map_err(|e| ZenError::Custom(e.to_string()))
}

#[tauri::command]
pub async fn list_geofences_db_page(
    state: State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Page<GtsmGeofence>, ZenError> {
    let (limit, offset) = normalize_page(limit, offset);
    let items = crate::db::queries::list_geofences_page(&state.db().await?, limit + 1, offset)
        .await
        .map_err(|e| ZenError::Custom(e.to_string()))?;
    Ok(page_from_fetch(items, limit, offset))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn save_geofence_db(
    state: State<'_, AppState>,
    id: String,
    name: String,
    geofence_type: String,
    center_lat: Option<f64>,
    center_lon: Option<f64>,
    radius_km: Option<f64>,
    polygon_coords: Option<String>,
    box_north: Option<f64>,
    box_south: Option<f64>,
    box_east: Option<f64>,
    box_west: Option<f64>,
    alert_enabled: bool,
) -> Result<(), ZenError> {
    let geofence = GtsmGeofence {
        id,
        name,
        geofence_type,
        center_lat,
        center_lon,
        radius_km,
        polygon_coords,
        box_north,
        box_south,
        box_east,
        box_west,
        alert_enabled: if alert_enabled { 1 } else { 0 },
        created_at: String::new(),
        updated_at: String::new(),
    };

    crate::db::queries::save_geofence(&state.db().await?, &geofence)
        .await
        .map_err(|e| ZenError::Custom(e.to_string()))
}

#[tauri::command]
pub async fn delete_geofence_db(state: State<'_, AppState>, id: String) -> Result<(), ZenError> {
    crate::db::queries::delete_geofence(&state.db().await?, &id)
        .await
        .map_err(|e| ZenError::Custom(e.to_string()))
}

#[tauri::command]
pub async fn list_markers_db(state: State<'_, AppState>) -> Result<Vec<GtsmMarker>, ZenError> {
    crate::db::queries::list_markers(&state.db().await?)
        .await
        .map_err(|e| ZenError::Custom(e.to_string()))
}

#[tauri::command]
pub async fn list_markers_db_page(
    state: State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Page<GtsmMarker>, ZenError> {
    let (limit, offset) = normalize_page(limit, offset);
    let items = crate::db::queries::list_markers_page(&state.db().await?, limit + 1, offset)
        .await
        .map_err(|e| ZenError::Custom(e.to_string()))?;
    Ok(page_from_fetch(items, limit, offset))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn save_marker_db(
    state: State<'_, AppState>,
    id: String,
    name: String,
    marker_type: String,
    lat: f64,
    lon: f64,
    alt: f64,
    color: String,
    icon: String,
    metadata: Option<String>,
) -> Result<(), ZenError> {
    let marker = GtsmMarker {
        id,
        name,
        marker_type,
        lat,
        lon,
        alt,
        color,
        icon,
        metadata,
        created_at: String::new(),
    };

    crate::db::queries::save_marker(&state.db().await?, &marker)
        .await
        .map_err(|e| ZenError::Custom(e.to_string()))
}

#[tauri::command]
pub async fn delete_marker_db(state: State<'_, AppState>, id: String) -> Result<(), ZenError> {
    crate::db::queries::delete_marker(&state.db().await?, &id)
        .await
        .map_err(|e| ZenError::Custom(e.to_string()))
}

use crate::db::models::GtsmGeojsonLayer;
use crate::db::queries::GtsmFavorite;
use crate::services::gtsm::GeojsonService;

#[tauri::command]
pub fn extract_kmz_kml(bytes: Vec<u8>) -> Result<String, ZenError> {
    GeojsonService::extract_kmz_kml(&bytes)
}

#[tauri::command]
pub async fn list_geojson_layers_db(state: State<'_, AppState>) -> Result<Vec<GtsmGeojsonLayer>, ZenError> {
    crate::db::queries::list_geojson_layers(&state.db().await?)
        .await
        .map_err(|e| ZenError::Custom(e.to_string()))
}

#[tauri::command]
pub async fn list_geojson_layers_db_page(
    state: State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Page<GtsmGeojsonLayer>, ZenError> {
    let (limit, offset) = normalize_page(limit, offset);
    let items = crate::db::queries::list_geojson_layers_page(&state.db().await?, limit + 1, offset)
        .await
        .map_err(|e| ZenError::Custom(e.to_string()))?;
    Ok(page_from_fetch(items, limit, offset))
}

#[tauri::command]
pub async fn save_geojson_layer_db(
    state: State<'_, AppState>,
    id: String,
    name: String,
    description: String,
    color: String,
    visible: bool,
    geojson: String,
) -> Result<GtsmGeojsonLayer, ZenError> {
    // Validate geojson content and compute feature/bbox/geom metadata
    let metadata = GeojsonService::parse_and_validate(&geojson)
        .map_err(|e| ZenError::Custom(e.to_string()))?;

    let geometry_types = serde_json::to_string(&metadata.geometry_types)
        .map_err(|e| ZenError::Custom(format!("Serialization error: {e}")))?;
    let bbox_json = if let Some(ref bbox) = metadata.bbox {
        Some(serde_json::to_string(bbox).map_err(|e| ZenError::Custom(format!("Serialization error: {e}")))?)
    } else {
        None
    };

    let now_str = chrono::Utc::now().to_rfc3339();

    let layer = GtsmGeojsonLayer {
        id,
        name,
        description,
        color,
        visible: if visible { 1 } else { 0 },
        geojson,
        feature_count: metadata.feature_count,
        geometry_types,
        bbox_json,
        created_at: now_str.clone(),
        updated_at: now_str,
    };

    crate::db::queries::save_geojson_layer(&state.db().await?, &layer)
        .await
        .map_err(|e| ZenError::Custom(e.to_string()))?;

    Ok(layer)
}

#[tauri::command]
pub async fn delete_geojson_layer_db(state: State<'_, AppState>, id: String) -> Result<(), ZenError> {
    crate::db::queries::delete_geojson_layer(&state.db().await?, &id)
        .await
        .map_err(|e| ZenError::Custom(e.to_string()))
}

// ─── GTSM Favorites (bookmarks) Persistence Commands ───

#[tauri::command]
pub async fn list_favorites_db(state: State<'_, AppState>) -> Result<Vec<GtsmFavorite>, ZenError> {
    crate::db::queries::list_favorites(&state.db().await?)
        .await
        .map_err(|e| ZenError::Custom(e.to_string()))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn save_favorite_db(
    state: State<'_, AppState>,
    id: String,
    entity_id: String,
    label: String,
    layer_id: String,
    layer_label: String,
    lat: f64,
    lon: f64,
    alt: f64,
) -> Result<(), ZenError> {
    let favorite = GtsmFavorite {
        id,
        entity_id,
        label,
        layer_id,
        layer_label,
        lat,
        lon,
        alt,
        created_at: String::new(),
    };

    crate::db::queries::save_favorite(&state.db().await?, &favorite)
        .await
        .map_err(|e| ZenError::Custom(e.to_string()))
}

#[tauri::command]
pub async fn delete_favorite_db(state: State<'_, AppState>, id: String) -> Result<(), ZenError> {
    crate::db::queries::delete_favorite(&state.db().await?, &id)
        .await
        .map_err(|e| ZenError::Custom(e.to_string()))
}
