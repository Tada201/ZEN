use zen_security::RiskLevel;
use zen_tools::registry::{ToolError, ToolOutput};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::json;
use tauri::{AppHandle, Emitter};

/// Tool to activate a 2D operational wireframe map at a specific location.
pub struct ActivateOperationalMapTool;

#[derive(Debug, Deserialize)]
pub struct OperationalMapArgs {
    pub location_name: Option<String>,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    pub zoom: Option<u8>,
}

#[async_trait]
impl zen_tools::Tool<tauri::AppHandle> for ActivateOperationalMapTool {
    fn name(&self) -> &str {
        "activate_2d_operational_map"
    }

    fn description(&self) -> &str {
        "Activates a 2D operational wireframe map for situational awareness. \
         Can pinpoint a specific location via name or coordinates."
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "location_name": {
                    "type": "string",
                    "description": "Name of the location (e.g., 'Tokyo', 'Pentagon')"
                },
                "lat": {
                    "type": "number",
                    "description": "Latitude coordinate"
                },
                "lon": {
                    "type": "number",
                    "description": "Longitude coordinate"
                },
                "zoom": {
                    "type": "integer",
                    "description": "Zoom level (1-20)",
                    "default": 10
                }
            }
        })
    }

    fn risk_level(&self) -> RiskLevel {
        RiskLevel::Low
    }

    async fn execute(
        &self,
        app: AppHandle,
        _chat_id: String,
        args: serde_json::Value,
    ) -> Result<ToolOutput, ToolError> {
        let args: OperationalMapArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArguments {
                details: e.to_string(),
            })?;

        let mut final_lat = args.lat;
        let mut final_lon = args.lon;
        let mut resolved_name = args.location_name.clone();

        if final_lat.is_none() || final_lon.is_none() {
            if let Some(name) = &args.location_name {
                let results = crate::services::gtsm::geocoding::search(name, 1)
                    .await
                    .map_err(|e| ToolError::ExecutionFailed {
                        message: format!("Geocoding failed: {e}"),
                    })?;

                if let Some(first) = results.first() {
                    final_lat = Some(first.lat);
                    final_lon = Some(first.lon);
                    resolved_name = Some(first.display_name.clone());
                } else {
                    return Err(ToolError::ExecutionFailed {
                        message: format!("Location '{name}' could not be resolved."),
                    });
                }
            } else {
                return Err(ToolError::InvalidArguments {
                    details: "Either location_name or both lat and lon must be provided."
                        .to_string(),
                });
            }
        }

        let (lat, lon) = match (final_lat, final_lon) {
            (Some(lat), Some(lon)) => (lat, lon),
            // Unreachable when a location_name was geocoded above, but kept
            // local so the invariant doesn't depend on far-away control flow.
            _ => {
                return Err(ToolError::InvalidArguments {
                    details: "Either location_name or both lat and lon must be provided."
                        .to_string(),
                });
            }
        };
        let zoom = args.zoom.unwrap_or(10);

        // Emit event to frontend
        let _ = app.emit(
            "map:activate-operational",
            json!({
                "lat": lat,
                "lon": lon,
                "zoom": zoom,
                "label": resolved_name.clone().unwrap_or_else(|| format!("{lat:.4}, {lon:.4}"))
            }),
        );

        Ok(ToolOutput {
            content: json!({
                "status": "success",
                "lat": lat,
                "lon": lon,
                "zoom": zoom,
                "location": resolved_name
            }),
            metadata: None,
        })
    }
}
