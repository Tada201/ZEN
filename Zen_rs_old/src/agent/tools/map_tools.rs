use crate::agent::tools::AgentTool;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

pub struct MapTool;

impl Default for MapTool {
    fn default() -> Self {
        Self::new()
    }
}

impl MapTool {
    pub fn new() -> Self {
        Self
    }

    /// Guardrail: Clamps spatial parameters to valid ranges.
    fn apply_guardrails(&self, lat: f64, lon: f64, zoom: u8) -> (f64, f64, u8) {
        let clamped_lat = lat.clamp(-90.0, 90.0);
        let clamped_lon = lon.clamp(-180.0, 180.0);
        let clamped_zoom = zoom.clamp(1, 22);
        (clamped_lat, clamped_lon, clamped_zoom)
    }
}

#[derive(Debug, Deserialize)]
struct MapArgs {
    lat: Option<f64>,
    lon: Option<f64>,
    zoom: Option<f64>,
    label: Option<String>,
    location_name: Option<String>,
}

#[async_trait]
impl AgentTool for MapTool {
    fn id(&self) -> &str {
        "activate_3d_globe"
    }

    fn description(&self) -> &str {
        "Activates the 3D globe viewer at the specified coordinates. \
         Use this when the user asks for maps, situational awareness, OSINT data visualization, or location tracking. \
         Shows military aircraft, earthquakes, weather, and other spatial data on a 3D Cesium globe."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "location_name": { "type": "string", "description": "Name of the location to show (e.g. 'Tokyo', 'Pentagon')" },
                "lat": { "type": "number", "description": "Latitude (-90 to 90)" },
                "lon": { "type": "number", "description": "Longitude (-180 to 180)" },
                "zoom": { "type": "number", "description": "Camera zoom level (1-22)", "default": 10 },
                "label": { "type": "string", "description": "Optional label for the location" }
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
        let args: MapArgs =
            serde_json::from_value(input).map_err(|e| anyhow!("Invalid map arguments: {}", e))?;

        let mut final_lat = args.lat;
        let mut final_lon = args.lon;
        let mut resolved_name = args.label.or(args.location_name.clone());

        if final_lat.is_none() || final_lon.is_none() {
            if let Some(name) = &args.location_name {
                let results = crate::services::gtsm::geocoding::search(name, 1)
                    .await
                    .map_err(|e| anyhow!("Geocoding failed: {}", e))?;

                if let Some(first) = results.first() {
                    final_lat = Some(first.lat);
                    final_lon = Some(first.lon);
                    if resolved_name.is_none() {
                        resolved_name = Some(first.display_name.clone());
                    }
                } else {
                    return Err(anyhow!("Location '{}' could not be resolved. Please be more specific or provide direct coordinates.", name));
                }
            } else {
                return Err(anyhow!(
                    "Either 'location_name' or both 'lat' and 'lon' must be provided."
                ));
            }
        }

        let lat = final_lat.ok_or_else(|| anyhow!("Latitude must be provided"))?;
        let lon = final_lon.ok_or_else(|| anyhow!("Longitude must be provided"))?;
        let zoom_val = args.zoom.unwrap_or(10.0) as u8;

        let (lat, lon, zoom) = self.apply_guardrails(lat, lon, zoom_val);
        let label = resolved_name.unwrap_or_else(|| format!("{:.4}, {:.4}", lat, lon));
        let altitude_meters = 40_000_000.0 / (2.0_f64.powi(zoom as i32));

        tracing::info!(
            "[GLOBE] Activating 3D globe at {}, {} (altitude {:.0}m, zoom {})",
            lat,
            lon,
            altitude_meters,
            zoom
        );

        // Emit to frontend to navigate 3D globe
        let _ = app.emit(
            "globe:navigate",
            json!({
                "lat": lat,
                "lon": lon,
                "altitude": altitude_meters,
                "label": label
            }),
        );

        Ok(json!({
            "status": "success",
            "message": format!("3D globe activated at {}", label),
            "coordinates": { "lat": lat, "lon": lon },
            "altitude": altitude_meters,
            "active_layers": ["aircraft", "earthquakes", "weather", "satellites", "vessels"],
            "label": label,
        }))
    }
}
