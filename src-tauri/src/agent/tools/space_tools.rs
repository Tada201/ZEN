use serde::Deserialize;
use serde_json::{json, Value};
use async_trait::async_trait;
use crate::agent::tools::AgentTool;
use anyhow::Result;
use tauri::Manager;

#[derive(Debug, Deserialize)]
struct SpaceArgs {
    query: String,
    #[serde(default)]
    #[serde(rename = "type")]
    query_type: Option<String>,
}

pub struct SpaceQueryTool;

#[async_trait]
impl AgentTool for SpaceQueryTool {
    fn id(&self) -> &str { "deep_space_query" }

    fn description(&self) -> &str {
        "Query real astronomical data: star positions, planets, satellites, deep sky objects. \
        Examples: 'Where is Mars?', 'Show ISS location', 'Find Andromeda Galaxy', 'Brightest stars'. \
        Use the 'type' parameter for explicit dispatch: 'planets', 'stars', 'satellites', 'deepsky', or 'auto' for automatic detection."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Astronomical query (e.g., 'Mars position', 'ISS tracking', 'Messier objects')"
                },
                "type": {
                    "type": "string",
                    "enum": ["planets", "stars", "satellites", "deepsky", "auto"],
                    "description": "Explicit data source type. Use 'auto' for automatic detection based on query keywords (default: auto)"
                }
            },
            "required": ["query"]
        })
    }

    async fn run(
        &self,
        app: tauri::AppHandle,
        _chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>>,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let args: SpaceArgs = serde_json::from_value(input)?;
        let query_lower = args.query.to_lowercase();

        // Explicit dispatch if type provided
        if let Some(ref query_type) = args.query_type {
            match query_type.as_str() {
                "planets" => return fetch_planets(&app).await,
                "stars" => return fetch_stars(&app).await,
                "satellites" => return fetch_satellites(&app).await,
                "deepsky" => return fetch_deepsky(&app).await,
                "auto" | _ => {} // Fall through to keyword matching
            }
        }

        // Dispatch to appropriate data source based on query keywords
        if query_lower.contains("planet") || query_lower.contains("mars") ||
           query_lower.contains("venus") || query_lower.contains("jupiter") ||
           query_lower.contains("saturn") {
            return fetch_planets(&app).await;
        }

        if query_lower.contains("star") || query_lower.contains("brightest") ||
           query_lower.contains("magnitude") {
            return fetch_stars(&app).await;
        }

        if query_lower.contains("satellite") || query_lower.contains("iss") ||
           query_lower.contains("starlink") || query_lower.contains("tracking") {
            return fetch_satellites(&app).await;
        }

        if query_lower.contains("galaxy") || query_lower.contains("nebula") ||
           query_lower.contains("messier") || query_lower.contains("m31") ||
           query_lower.contains("andromeda") {
            return fetch_deepsky(&app).await;
        }

        // Default: return astronomy status
        fetch_astronomy_status(&app).await
    }
}

async fn fetch_planets(app: &tauri::AppHandle) -> Result<Value> {
    let planets = crate::commands::astronomy_commands::get_planets(
        tauri::State::from(app.state::<std::sync::Arc<crate::services::astronomy::AstronomyCache>>().clone()),
    )
    .await
    .map_err(|e| anyhow::anyhow!(e))?;

    let planet_list = planets.iter()
        .map(|p| format!("{}: RA {:.1}°, Dec {:.1}°, Magnitude {:.2}", p.name, p.ra, p.dec, p.magnitude))
        .collect::<Vec<_>>()
        .join("\n");

    Ok(json!({
        "status": "success",
        "type": "planets",
        "count": planets.len(),
        "data": planet_list,
        "source": "NASA JPL Horizons ephemerides"
    }))
}

async fn fetch_stars(app: &tauri::AppHandle) -> Result<Value> {
    let stars = crate::commands::astronomy_commands::get_stars(
        tauri::State::from(app.state::<std::sync::Arc<crate::services::astronomy::AstronomyCache>>().clone()),
        app.clone(),
    )
    .await
    .map_err(|e| anyhow::anyhow!(e))?;

    let total = stars.len();
    let brightest = stars.iter()
        .filter(|s| s.magnitude <= 3.0)
        .take(10)
        .map(|s| format!("{}: Mag {:.1}", s.name.as_deref().unwrap_or("Unknown"), s.magnitude))
        .collect::<Vec<_>>()
        .join(", ");

    Ok(json!({
        "status": "success",
        "type": "stars",
        "count": total,
        "brightest": brightest,
        "source": "HYG Catalog (120k stars)"
    }))
}

async fn fetch_satellites(app: &tauri::AppHandle) -> Result<Value> {
    let sats = crate::commands::astronomy_commands::get_astronomical_satellites(
        tauri::State::from(app.state::<std::sync::Arc<crate::services::astronomy::AstronomyCache>>().clone()),
    )
    .await
    .map_err(|e| anyhow::anyhow!(e))?;

    let sat_list = sats.iter()
        .map(|s| format!("{}: {} km altitude, {} deg inclination", s.name, s.altitude_km as i32, s.inclination as i32))
        .collect::<Vec<_>>()
        .join("\n");

    Ok(json!({
        "status": "success",
        "type": "satellites",
        "count": sats.len(),
        "data": sat_list,
        "source": "Celestrak TLE Elements"
    }))
}

async fn fetch_deepsky(app: &tauri::AppHandle) -> Result<Value> {
    let objects = crate::commands::astronomy_commands::get_deepsky_objects(
        tauri::State::from(app.state::<std::sync::Arc<crate::services::astronomy::AstronomyCache>>().clone()),
    )
    .await
    .map_err(|e| anyhow::anyhow!(e))?;

    let obj_list = objects.iter()
        .map(|o| format!("{} ({}): RA {:.1}°, Dec {:.1}°, Mag {:.1}", 
            o.messier_id.as_deref().unwrap_or(&o.name), 
            o.object_type, o.ra, o.dec, o.magnitude))
        .collect::<Vec<_>>()
        .join("\n");

    Ok(json!({
        "status": "success",
        "type": "deepsky",
        "count": objects.len(),
        "data": obj_list,
        "source": "Messier/NGC Catalog"
    }))
}

async fn fetch_astronomy_status(app: &tauri::AppHandle) -> Result<Value> {
    crate::commands::astronomy_commands::get_astronomy_status(
        tauri::State::from(app.state::<std::sync::Arc<crate::services::astronomy::AstronomyCache>>().clone()),
        app.clone(),
    )
    .await
    .map_err(|e| anyhow::anyhow!(e))
}
