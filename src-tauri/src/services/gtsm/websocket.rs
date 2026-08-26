use super::cache::GtsmCache;
use super::types::GtsmStreamMessage;
use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::State,
    response::IntoResponse,
    routing::get,
    Router,
};
use std::sync::Arc;
use tokio::sync::broadcast;
use tower_http::cors::CorsLayer;

/// Shared state for the WebSocket server
pub struct WsState {
    pub tx: broadcast::Sender<String>,
    pub cache: Arc<GtsmCache>,
    pub db_pool: Option<sqlx::SqlitePool>,
    pub secret_manager: Option<Arc<crate::services::SecretService>>,
}

/// Create and return the axum Router for WebSocket connections
pub fn create_ws_router(state: Arc<WsState>) -> Router {
    Router::new()
        .route("/ws/gtsm", get(ws_handler))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<Arc<WsState>>) -> impl IntoResponse {
    tracing::debug!("WebSocket upgrade request received");
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: Arc<WsState>) {
    tracing::info!("New WebSocket connection established");
    let mut rx = state.tx.subscribe();

    // Send initial cached data snapshot
    tracing::info!("Sending initial data snapshot to client...");
    if let Some(sats) = state.cache.get_satellites().await {
        tracing::info!("Sending {} satellites from cache", sats.len());
        let msg = GtsmStreamMessage::Satellites(sats);
        if let Ok(json) = serde_json::to_string(&msg) {
            if socket.send(Message::Text(json.into())).await.is_err() {
                tracing::warn!("Failed to send initial satellites, closing");
                return;
            }
        }
    }
    if let Some(flights) = state.cache.get_flights().await {
        let msg = GtsmStreamMessage::Flights(flights);
        if let Ok(json) = serde_json::to_string(&msg) {
            let _ = socket.send(Message::Text(json.into())).await;
        }
    }
    if let Some(quakes) = state.cache.get_earthquakes().await {
        let msg = GtsmStreamMessage::Earthquakes(quakes);
        if let Ok(json) = serde_json::to_string(&msg) {
            let _ = socket.send(Message::Text(json.into())).await;
        }
    }
    if let Some(mil) = state.cache.get_military().await {
        let msg = GtsmStreamMessage::Military(mil);
        if let Ok(json) = serde_json::to_string(&msg) {
            let _ = socket.send(Message::Text(json.into())).await;
        }
    }
    if let Some(events) = state.cache.get_natural_events().await {
        let msg = GtsmStreamMessage::NaturalEvents(events);
        if let Ok(json) = serde_json::to_string(&msg) {
            let _ = socket.send(Message::Text(json.into())).await;
        }
    }
    if let Some(vessels) = state.cache.get_vessels().await {
        let msg = GtsmStreamMessage::Vessels(vessels);
        if let Ok(json) = serde_json::to_string(&msg) {
            let _ = socket.send(Message::Text(json.into())).await;
        }
    }

    // Stream updates
    loop {
        tokio::select! {
            Ok(msg) = rx.recv() => {
                tracing::info!("Broadcasting message to client: {} bytes", msg.len());
                if socket.send(Message::Text(msg.into())).await.is_err() {
                    tracing::warn!("Failed to send message to client, closing connection");
                    break;
                }
            }
            Some(Ok(msg)) = socket.recv() => {
                match msg {
                    Message::Close(_) => {
                        tracing::info!("Client closed WebSocket connection");
                        break;
                    }
                    Message::Ping(data) => {
                        let _ = socket.send(Message::Pong(data)).await;
                    }
                    _ => {}
                }
            }
            else => {
                tracing::warn!("WebSocket stream loop terminated unexpectedly");
                break;
            }
        }
    }
}

/// Check if GTSM fetching is paused via the performance/power settings.
/// Reads the `gtsm_paused` key from the settings DB.
async fn is_gtsm_paused(db_pool: &Option<sqlx::SqlitePool>) -> bool {
    if let Some(pool) = db_pool {
        match zen_db::queries::get_setting(pool, "gtsm_paused").await {
            Ok(Some(val)) => val != "false", // Default to paused unless explicitly set to "false"
            _ => true, // No setting = paused (don't fetch until user activates map)
        }
    } else {
        true
    }
}

/// Check if GTSM outgoing API calls are enabled.
/// Reads the `gtsm_api_enabled` key from the settings DB.
async fn is_gtsm_api_enabled(db_pool: &Option<sqlx::SqlitePool>) -> bool {
    if let Some(pool) = db_pool {
        match zen_db::queries::get_setting(pool, "gtsm_api_enabled").await {
            Ok(Some(val)) => val == "true", // Default to disabled unless explicitly set to "true"
            _ => false, // No setting = disabled (conserve bandwidth/CPU by default)
        }
    } else {
        false
    }
}

/// Check if ADSB/Operational transponders are enabled.
/// Reads the `gtsm_adsb_enabled` key from the settings DB.
async fn is_gtsm_adsb_enabled(db_pool: &Option<sqlx::SqlitePool>) -> bool {
    if let Some(pool) = db_pool {
        match zen_db::queries::get_setting(pool, "gtsm_adsb_enabled").await {
            Ok(Some(val)) => val == "true", // Default to disabled unless explicitly set to "true"
            _ => false,                     // No setting = disabled
        }
    } else {
        false
    }
}

/// Background task that fetches data and broadcasts updates.
/// Uses per-data-type intervals that match their freshness requirements
/// instead of a single 30s poll loop.
pub async fn run_stream_loop(
    cache: Arc<GtsmCache>,
    tx: broadcast::Sender<String>,
    db_pool: Option<sqlx::SqlitePool>,
    secret_manager: Option<Arc<crate::services::SecretService>>,
) {
    // Per-data-type intervals aligned with cache TTL
    let mut sat_interval = tokio::time::interval(std::time::Duration::from_secs(120));
    let mut flight_interval = tokio::time::interval(std::time::Duration::from_secs(300));
    let mut quake_interval = tokio::time::interval(std::time::Duration::from_secs(300));
    let mut mil_interval = tokio::time::interval(std::time::Duration::from_secs(30));
    let mut eonet_interval = tokio::time::interval(std::time::Duration::from_secs(900)); // 15 min
    let mut snapshot_interval = tokio::time::interval(std::time::Duration::from_secs(300)); // 5 min
    let mut cleanup_interval = tokio::time::interval(std::time::Duration::from_secs(3600)); // 1 hour

    // First tick fires immediately
    sat_interval.tick().await;
    flight_interval.tick().await;
    quake_interval.tick().await;
    mil_interval.tick().await;
    eonet_interval.tick().await;
    snapshot_interval.tick().await;
    cleanup_interval.tick().await;

    // Check if GTSM API calls are enabled before launching data fetchers
    let api_enabled = is_gtsm_api_enabled(&db_pool).await;

    if api_enabled {
        // Initial fetch for all data types (Parallelized to prevent head-of-line blocking)
        let c1 = cache.clone();
        let t1 = tx.clone();
        tokio::spawn(async move { fetch_and_broadcast_satellites(&c1, &t1).await });

        let c2 = cache.clone();
        let t2 = tx.clone();
        tokio::spawn(async move { fetch_and_broadcast_flights(&c2, &t2).await });

        let c3 = cache.clone();
        let t3 = tx.clone();
        tokio::spawn(async move { fetch_and_broadcast_earthquakes(&c3, &t3).await });

        let c4 = cache.clone();
        let t4 = tx.clone();
        let p4 = db_pool.clone();
        tokio::spawn(async move {
            if is_gtsm_adsb_enabled(&p4).await {
                fetch_and_broadcast_military(&c4, &t4).await
            }
        });

        let c5 = cache.clone();
        let t5 = tx.clone();
        tokio::spawn(async move { fetch_and_broadcast_natural_events(&c5, &t5).await });
    } else {
        tracing::info!("GTSM API calls disabled. Skipping initial data fetch.");
    }

    // Launch outbound AIS WebSocket if API key is configured AND API calls are enabled
    if api_enabled {
        if let Some(secret_manager) = secret_manager.clone() {
            let tx_clone = tx.clone();
            let cache_clone = cache.clone();
            tokio::spawn(async move {
                match secret_manager.get_secret("gtsm_ais_api_key").await {
                    Ok(Some(key)) if !key.is_empty() => {
                        super::vessels::spawn_ais_stream(key, tx_clone, cache_clone);
                    }
                    Ok(_) => {
                        tracing::info!(
                            "No 'gtsm_ais_api_key' in settings. Skipping AIS vessel tracking."
                        );
                    }
                    Err(e) => {
                        tracing::error!("Error reading AIS setting: {}", e);
                    }
                }
            });
        }
    } else {
        tracing::info!("GTSM API calls disabled. Skipping AIS stream spawn.");
    }

    loop {
        tokio::select! {
            _ = sat_interval.tick() => {
                if is_gtsm_api_enabled(&db_pool).await && !is_gtsm_paused(&db_pool).await {
                    fetch_and_broadcast_satellites(&cache, &tx).await;
                }
            }
            _ = flight_interval.tick() => {
                if is_gtsm_api_enabled(&db_pool).await && !is_gtsm_paused(&db_pool).await {
                    fetch_and_broadcast_flights(&cache, &tx).await;
                }
            }
            _ = quake_interval.tick() => {
                if is_gtsm_api_enabled(&db_pool).await && !is_gtsm_paused(&db_pool).await {
                    fetch_and_broadcast_earthquakes(&cache, &tx).await;
                }
            }
            _ = mil_interval.tick() => {
                if is_gtsm_api_enabled(&db_pool).await && !is_gtsm_paused(&db_pool).await && is_gtsm_adsb_enabled(&db_pool).await {
                    fetch_and_broadcast_military(&cache, &tx).await;
                }
            }
            _ = eonet_interval.tick() => {
                if is_gtsm_api_enabled(&db_pool).await && !is_gtsm_paused(&db_pool).await {
                    fetch_and_broadcast_natural_events(&cache, &tx).await;
                }
            }
            _ = snapshot_interval.tick() => {
                if is_gtsm_api_enabled(&db_pool).await && !is_gtsm_paused(&db_pool).await {
                    if let Some(pool) = &db_pool {
                        record_snapshots(&cache, pool).await;
                    }
                }
            }
            _ = cleanup_interval.tick() => {
                if let Some(pool) = &db_pool {
                    let _ = super::history::cleanup_old_snapshots(pool, 48).await;
                }
            }
        }
    }
}

async fn fetch_and_broadcast_satellites(cache: &GtsmCache, tx: &broadcast::Sender<String>) {
    // Clear stale satellite state on clients before streaming fresh positions
    if let Ok(json) = serde_json::to_string(&GtsmStreamMessage::ClearSatellites) {
        let _ = tx.send(json);
    }

    // Stream updated positions from the Rust-side TLE cache (or fetch if stale/empty)
    match super::satellites::fetch_satellites(tx).await {
        Ok(sats) => {
            // Also update the global cache for new websocket connections
            cache.set_satellites(sats, 120).await;
        }
        Err(e) => tracing::error!("Satellite fetch failed: {}", e),
    }
}

async fn fetch_and_broadcast_flights(cache: &GtsmCache, tx: &broadcast::Sender<String>) {
    match super::flights::fetch_flights().await {
        Ok(flights) => {
            cache.set_flights(flights.clone(), 15).await;
            if let Ok(json) = serde_json::to_string(&GtsmStreamMessage::Flights(flights)) {
                let _ = tx.send(json);
            }
        }
        Err(e) => tracing::error!("Flight fetch failed: {}", e),
    }
}

async fn fetch_and_broadcast_earthquakes(cache: &GtsmCache, tx: &broadcast::Sender<String>) {
    match super::earthquakes::fetch_earthquakes(2.5, 24).await {
        Ok(quakes) => {
            cache.set_earthquakes(quakes.clone(), 300).await;
            if let Ok(json) = serde_json::to_string(&GtsmStreamMessage::Earthquakes(quakes)) {
                let _ = tx.send(json);
            }
        }
        Err(e) => tracing::error!("Earthquake fetch failed: {}", e),
    }
}

async fn fetch_and_broadcast_military(cache: &GtsmCache, tx: &broadcast::Sender<String>) {
    match super::military::fetch_military().await {
        Ok(mil) => {
            cache.set_military(mil.clone(), 30).await;
            if let Ok(json) = serde_json::to_string(&GtsmStreamMessage::Military(mil)) {
                let _ = tx.send(json);
            }
        }
        Err(e) => tracing::error!("Military fetch failed: {}", e),
    }
}

async fn fetch_and_broadcast_natural_events(cache: &GtsmCache, tx: &broadcast::Sender<String>) {
    match super::nasa_events::fetch_natural_events().await {
        Ok(events) => {
            cache.set_natural_events(events.clone(), 900).await;
            if let Ok(json) = serde_json::to_string(&GtsmStreamMessage::NaturalEvents(events)) {
                let _ = tx.send(json);
            }
        }
        Err(e) => tracing::error!("NASA EONET fetch failed: {}", e),
    }
}

/// Record current cache state as telemetry snapshots
async fn record_snapshots(cache: &GtsmCache, pool: &sqlx::SqlitePool) {
    // Snapshot military aircraft
    if let Some(mil) = cache.get_military().await {
        let entities: Vec<(String, f64, f64, f64, Option<String>)> = mil
            .iter()
            .map(|m| {
                let meta = serde_json::json!({
                    "hex": &m.hex,
                    "flight": &m.flight,
                    "type": &m.aircraft_type,
                    "speed": m.ground_speed,
                    "heading": m.track,
                })
                .to_string();
                (m.hex.clone(), m.lat, m.lon, m.alt_baro, Some(meta))
            })
            .collect();
        if let Err(e) = super::history::record_snapshot(pool, "military", entities).await {
            tracing::error!("Failed to snapshot military: {}", e);
        }
    }

    // Snapshot earthquakes (deduplicated by event ID)
    if let Some(quakes) = cache.get_earthquakes().await {
        let entities: Vec<(String, f64, f64, f64, Option<String>)> = quakes
            .iter()
            .map(|q| {
                let meta = serde_json::json!({
                    "magnitude": q.magnitude,
                    "place": &q.place,
                    "time": q.time,
                })
                .to_string();
                (q.id.clone(), q.lat, q.lon, q.depth, Some(meta))
            })
            .collect();
        if let Err(e) = super::history::record_snapshot(pool, "earthquake", entities).await {
            tracing::error!("Failed to snapshot earthquakes: {}", e);
        }
    }

    // Snapshot natural events
    if let Some(events) = cache.get_natural_events().await {
        let entities: Vec<(String, f64, f64, f64, Option<String>)> = events
            .iter()
            .map(|e| {
                let meta = serde_json::json!({
                    "title": &e.title,
                    "event_type": &e.event_type,
                    "magnitude": e.magnitude,
                    "source_url": &e.source_url,
                })
                .to_string();
                (e.id.clone(), e.lat, e.lon, 0.0, Some(meta))
            })
            .collect();
        if let Err(e) = super::history::record_snapshot(pool, "natural_event", entities).await {
            tracing::error!("Failed to snapshot natural events: {}", e);
        }
    }

    tracing::debug!("Telemetry snapshots recorded successfully");
}
