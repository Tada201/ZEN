use crate::agent::tools::AgentTool;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use serde::Deserialize;
use tauri::Manager;

#[derive(Debug, Deserialize)]
struct RouteArgs {
    origin: Option<String>,
    destination: Option<String>,
    start_lat: Option<f64>,
    start_lon: Option<f64>,
    end_lat: Option<f64>,
    end_lon: Option<f64>,
    profile: Option<crate::services::gtsm::types::RoutingProfile>,
}

/// Calculate a driving route between two locations
pub struct RouteTool;

#[async_trait]
impl AgentTool for RouteTool {
    fn id(&self) -> &str {
        "calculate_route"
    }

    fn description(&self) -> &str {
        "Calculate a driving route between two points. Accepts location names (e.g., 'Paris', 'Berlin') or coordinates. \
         Returns distance, duration (including traffic delays), and route summary."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "origin": { "type": "string", "description": "Starting location name or 'lat,lon'" },
                "destination": { "type": "string", "description": "Destination location name or 'lat,lon'" },
                "start_lat": { "type": "number", "description": "Fallback start latitude" },
                "start_lon": { "type": "number", "description": "Fallback start longitude" },
                "end_lat": { "type": "number", "description": "Fallback end latitude" },
                "end_lon": { "type": "number", "description": "Fallback end longitude" },
                "profile": { "type": "string", "description": "Routing profile: 'car', 'walk', 'bicycle', 'truck'", "default": "car" }
            }
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        _chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<
            std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>,
        >,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let args: RouteArgs = serde_json::from_value(input)
            .map_err(|e| anyhow!("Invalid routing arguments: {}", e))?;

        // ── Resolve Origin ──
        let start_coords = if let Some(origin_name) = args.origin {
            let results = crate::services::gtsm::geocoding::search(&origin_name, 1)
                .await
                .map_err(|e| anyhow!("Failed to geocode origin '{}': {}", origin_name, e))?;
            let first = results
                .first()
                .ok_or_else(|| anyhow!("Origin '{}' not found", origin_name))?;
            [first.lat, first.lon]
        } else {
            [
                args.start_lat
                    .ok_or_else(|| anyhow!("origin or start_lat required"))?,
                args.start_lon
                    .ok_or_else(|| anyhow!("origin or start_lon required"))?,
            ]
        };

        // ── Resolve Destination ──
        let end_coords = if let Some(dest_name) = args.destination {
            let results = crate::services::gtsm::geocoding::search(&dest_name, 1)
                .await
                .map_err(|e| anyhow!("Failed to geocode destination '{}': {}", dest_name, e))?;
            let first = results
                .first()
                .ok_or_else(|| anyhow!("Destination '{}' not found", dest_name))?;
            [first.lat, first.lon]
        } else {
            [
                args.end_lat
                    .ok_or_else(|| anyhow!("destination or end_lat required"))?,
                args.end_lon
                    .ok_or_else(|| anyhow!("destination or end_lon required"))?,
            ]
        };

        let profile = args
            .profile
            .unwrap_or(crate::services::gtsm::types::RoutingProfile::Car);

        // ── Get AppState for keys and DB ──
        let state = app.state::<crate::commands::AppState>();
        let pool = state
            .db()
            .await
            .map_err(|e| anyhow::anyhow!("DB Init failed: {}", e))?;

        // Fetch API keys through SecretService; settings reads must not expose credentials.
        let here_key = state
            .secret_manager
            .get_secret("here_api_key")
            .await?
            .unwrap_or_default();
        let google_key = state
            .secret_manager
            .get_secret("google_maps_api_key")
            .await?
            .unwrap_or_default();

        // ── Compute Route ──
        let route = crate::services::gtsm::navigation::compute_route(
            start_coords,
            end_coords,
            profile,
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
        .map_err(|e| anyhow!("Route calculation failed: {}", e))?;

        // Emit route to frontend
        let _ = app.emit("map:show-route", serde_json::to_value(&route)?);

        let dist_km = route.distance_m / 1000.0;
        let dur_min = route.duration_s / 60.0;
        let traffic_info = route
            .traffic_duration_s
            .map(|t| format!(" (including {:.0}m traffic)", t / 60.0))
            .unwrap_or_default();

        Ok(json!({
            "status": "success",
            "provider": route.provider,
            "distance_km": format!("{:.1}", dist_km),
            "duration_minutes": format!("{:.0}{}", dur_min, traffic_info),
            "summary": route.summary,
            "steps_count": route.steps.len(),
            "geometry_points": route.geometry.len(),
            "traffic_delay_detected": route.traffic_duration_s.is_some(),
        }))
    }
}

/// Geocode a location name to coordinates
pub struct GeocodeTool;

#[async_trait]
impl AgentTool for GeocodeTool {
    fn id(&self) -> &str {
        "geocode_search"
    }

    fn description(&self) -> &str {
        "Search for a place name and get its coordinates. Use this to convert location names to lat/lon before routing or map display."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": { "type": "string", "description": "Place name or address to search" },
                "limit": { "type": "integer", "description": "Max results (default 5)", "default": 5 }
            },
            "required": ["query"]
        })
    }

    async fn run(
        &self,
        _app: AppHandle,
        _chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<
            std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>,
        >,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let query = input["query"]
            .as_str()
            .ok_or_else(|| anyhow!("query required"))?;
        let limit = input.get("limit").and_then(|v| v.as_u64()).unwrap_or(5) as u8;

        let results = crate::services::gtsm::geocoding::search(query, limit)
            .await
            .map_err(|e| anyhow!("Geocoding failed: {}", e))?;

        Ok(json!({
            "count": results.len(),
            "results": results,
        }))
    }
}

/// Reverse geocode coordinates to a place name
pub struct ReverseGeocodeTool;

#[async_trait]
impl AgentTool for ReverseGeocodeTool {
    fn id(&self) -> &str {
        "reverse_geocode"
    }

    fn description(&self) -> &str {
        "Convert latitude/longitude coordinates into a human-readable place name."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "lat": { "type": "number", "description": "Latitude" },
                "lon": { "type": "number", "description": "Longitude" }
            },
            "required": ["lat", "lon"]
        })
    }

    async fn run(
        &self,
        _app: AppHandle,
        _chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<
            std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>,
        >,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let lat = input["lat"]
            .as_f64()
            .ok_or_else(|| anyhow!("lat required"))?;
        let lon = input["lon"]
            .as_f64()
            .ok_or_else(|| anyhow!("lon required"))?;

        let result = crate::services::gtsm::geocoding::reverse(lat, lon)
            .await
            .map_err(|e| anyhow!("Reverse geocoding failed: {}", e))?;

        Ok(serde_json::to_value(&result)?)
    }
}
