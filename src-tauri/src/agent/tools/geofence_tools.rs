use serde_json::{json, Value};
use anyhow::{Result, anyhow};
use tauri::{AppHandle, Emitter, Manager};
use async_trait::async_trait;
use crate::agent::tools::AgentTool;
use crate::services::gtsm::types::{GeofenceZone, GeofenceType};

/// Create a geofence zone
pub struct CreateGeofenceTool;

#[async_trait]
impl AgentTool for CreateGeofenceTool {
    fn id(&self) -> &str { "create_geofence" }

    fn description(&self) -> &str {
        "Create a geofence zone (polygon or circle) that monitors for entity enter/exit events. \
         For circles, provide center coordinates and radius in km. \
         For polygons, provide an array of [lat, lon] vertex pairs."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "name": { "type": "string", "description": "Zone name" },
                "zone_type": { "type": "string", "enum": ["circle", "polygon"], "description": "Type of geofence" },
                "center_lat": { "type": "number", "description": "Center latitude (for circle)" },
                "center_lon": { "type": "number", "description": "Center longitude (for circle)" },
                "radius_km": { "type": "number", "description": "Radius in kilometers (for circle)" },
                "vertices": {
                    "type": "array",
                    "items": { "type": "array", "items": { "type": "number" } },
                    "description": "Array of [lat, lon] pairs (for polygon)"
                }
            },
            "required": ["name", "zone_type"]
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        _chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>>,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let name = input["name"].as_str().ok_or_else(|| anyhow!("name required"))?.to_string();
        let zone_type_str = input["zone_type"].as_str().ok_or_else(|| anyhow!("zone_type required"))?;
        let id = uuid::Uuid::new_v4().to_string();

        let zone = match zone_type_str {
            "circle" => {
                let center_lat = input["center_lat"].as_f64().ok_or_else(|| anyhow!("center_lat required"))?;
                let center_lon = input["center_lon"].as_f64().ok_or_else(|| anyhow!("center_lon required"))?;
                let radius = input["radius_km"].as_f64().ok_or_else(|| anyhow!("radius_km required"))?;

                GeofenceZone {
                    id: id.clone(),
                    name: name.clone(),
                    zone_type: GeofenceType::Circle,
                    vertices: vec![],
                    radius: Some(radius),
                    center: Some([center_lat, center_lon]),
                }
            }
            "polygon" => {
                let vertices: Vec<[f64; 2]> = serde_json::from_value(
                    input["vertices"].clone()
                ).map_err(|_| anyhow!("vertices must be array of [lat, lon] pairs"))?;

                if vertices.len() < 3 {
                    return Err(anyhow!("Polygon needs at least 3 vertices"));
                }

                GeofenceZone {
                    id: id.clone(),
                    name: name.clone(),
                    zone_type: GeofenceType::Polygon,
                    vertices,
                    radius: None,
                    center: None,
                }
            }
            _ => return Err(anyhow!("zone_type must be 'circle' or 'polygon'")),
        };

        // Persist to geofence engine (in-memory)
        let state = app.state::<crate::commands::AppState>();
        state.geofence_engine.add_zone(zone.clone()).await;

        // Persist to database
        let polygon_coords = if zone.vertices.is_empty() {
            None
        } else {
            Some(serde_json::to_string(&zone.vertices).unwrap_or_default())
        };

        let geofence_db = crate::db::models::GtsmGeofence {
            id: id.clone(),
            name: name.clone(),
            geofence_type: zone_type_str.to_string(),
            center_lat: zone.center.map(|c| c[0]),
            center_lon: zone.center.map(|c| c[1]),
            radius_km: zone.radius,
            polygon_coords,
            box_north: None,
            box_south: None,
            box_east: None,
            box_west: None,
            alert_enabled: 1,
            created_at: String::new(),
            updated_at: String::new(),
        };

        // Attempt DB persistence with proper error handling
        let db_persisted = match state.db().await {
            Ok(pool) => {
                match crate::db::queries::save_geofence(&pool, &geofence_db).await {
                    Ok(_) => {
                        tracing::info!("Geofence '{}' (id: {}) saved to database", name, id);
                        true
                    }
                    Err(e) => {
                        tracing::error!("Geofence '{}' (id: {}) DB save failed: {}. Zone remains in memory.", name, id, e);
                        false
                    }
                }
            }
            Err(e) => {
                tracing::warn!("Geofence '{}' (id: {}) - DB pool unavailable: {}. Zone added to memory only.", name, id, e);
                false
            }
        };

        // Emit event to frontend so the UI draws the zone
        let _ = app.emit("map:geofence-created", json!({
            "zone_id": id,
            "name": name,
            "zone_type": zone_type_str,
            "center": zone.center,
            "radius_km": zone.radius,
            "vertices": zone.vertices,
        }));

        let persistence_status = if db_persisted {
            "persisted to database"
        } else {
            "added to memory only (DB unavailable)"
        };

        Ok(json!({
            "status": "success",
            "zone_id": id,
            "db_persisted": db_persisted,
            "message": format!("Geofence '{}' created and {} (id: {})", name, persistence_status, id),
            "zone": zone,
        }))
    }
}
