use tauri::State;
use crate::error::ZenError;
use super::AppState;

// GTSM Types
use crate::services::gtsm::{
    Satellite, Flight, Earthquake, WeatherPoint, WeatherGridPoint, MilitaryAircraft,
    Route, GeocodingResult, GeofenceZone, FusionEvent
};
use crate::services::gtsm::types::{RoutingProfile, NavigationRoute};
use crate::services::gtsm::history::{TelemetrySnapshot, TrackPoint};
use crate::db::models::{GtsmGeofence, GtsmMarker};

// ─── Realtime Telemetry Cache & API Commands ───

#[tauri::command]
pub async fn get_satellites(
    state: State<'_, AppState>,
) -> Result<Vec<Satellite>, ZenError> {
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
pub async fn get_flights(
    state: State<'_, AppState>,
) -> Result<Vec<Flight>, ZenError> {
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
    ).await.map_err(|e| ZenError::Internal(e.to_string()))?;
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
        lat_min, lat_max, lon_min, lon_max, step
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
pub async fn calculate_route(
    state: State<'_, AppState>,
    start_lat: f64,
    start_lon: f64,
    end_lat: f64,
    end_lon: f64,
) -> Result<Route, ZenError> {
    let key = format!("{:.4},{:.4}->{:.4},{:.4}", start_lat, start_lon, end_lat, end_lon);
    if let Some(cached) = state.gtsm_cache.get_route(&key).await {
        return Ok(cached);
    }
    let route = crate::services::gtsm::routing::calculate_route(start_lat, start_lon, end_lat, end_lon)
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
    state.gtsm_cache.set_geocoding(&query, results.clone(), 86400).await;
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
pub async fn list_geofences(
    state: State<'_, AppState>,
) -> Result<Vec<GeofenceZone>, ZenError> {
    Ok(state.geofence_engine.list_zones().await)
}

#[tauri::command]
pub async fn remove_geofence(
    state: State<'_, AppState>,
    zone_id: String,
) -> Result<(), ZenError> {
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

    events.extend(crate::services::gtsm::fusion::correlate_satellites_earthquakes(&sats, &quakes, radius));
    events.extend(crate::services::gtsm::fusion::correlate_military_earthquakes(&military, &quakes, radius));
    events.extend(crate::services::gtsm::fusion::correlate_flights_military(&flights, &military, radius));

    events.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));
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

    let pool = state.db().await.map_err(|e| ZenError::Internal(e.to_string()))?;

    // Fetch API keys from settings using queries
    let here_key = crate::db::queries::get_setting(&pool, "here_api_key")
        .await
        .map_err(|e| ZenError::Internal(e.to_string()))?
        .unwrap_or_default();
    let google_key = crate::db::queries::get_setting(&pool, "google_maps_api_key")
        .await
        .map_err(|e| ZenError::Internal(e.to_string()))?
        .unwrap_or_default();

    let start_coords = [start_lat, start_lon];
    let end_coords = [end_lat, end_lon];

    crate::services::gtsm::navigation::compute_route(
        start_coords,
        end_coords,
        prof,
        if here_key.is_empty() { None } else { Some(here_key) },
        if google_key.is_empty() { None } else { Some(google_key) },
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
pub async fn get_entity_track(
    state: State<'_, AppState>,
    entity_id: String,
    start_time: i64,
    end_time: i64,
) -> Result<Vec<TrackPoint>, ZenError> {
    crate::services::gtsm::history::query_entity_track(&state.db().await?, &entity_id, start_time, end_time)
        .await
        .map_err(|e| ZenError::Internal(e.to_string()))
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
pub async fn list_geofences_db(
    state: State<'_, AppState>
) -> Result<Vec<GtsmGeofence>, ZenError> {
    crate::db::queries::list_geofences(&state.db().await?)
        .await
        .map_err(|e| ZenError::Custom(e.to_string()))
}

#[tauri::command]
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
pub async fn delete_geofence_db(
    state: State<'_, AppState>,
    id: String
) -> Result<(), ZenError> {
    crate::db::queries::delete_geofence(&state.db().await?, &id)
        .await
        .map_err(|e| ZenError::Custom(e.to_string()))
}

#[tauri::command]
pub async fn list_markers_db(
    state: State<'_, AppState>
) -> Result<Vec<GtsmMarker>, ZenError> {
    crate::db::queries::list_markers(&state.db().await?)
        .await
        .map_err(|e| ZenError::Custom(e.to_string()))
}

#[tauri::command]
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
pub async fn delete_marker_db(
    state: State<'_, AppState>,
    id: String
) -> Result<(), ZenError> {
    crate::db::queries::delete_marker(&state.db().await?, &id)
        .await
        .map_err(|e| ZenError::Custom(e.to_string()))
}
