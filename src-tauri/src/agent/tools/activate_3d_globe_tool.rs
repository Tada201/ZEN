use serde_json::{json, Value};
use async_trait::async_trait;
use crate::agent::tools::AgentTool;
use anyhow::Result;
use tauri::Manager;

pub struct Activate3DGlobeTool;

#[async_trait]
impl AgentTool for Activate3DGlobeTool {
    fn id(&self) -> &str {
        "activate_space_observatory"
    }

    fn description(&self) -> &str {
        "Activate and show the 3D space observatory/globe for interactive visualization. \
         Use this to display astronomical data in a 3D rendered environment. \
         Can optionally focus on specific celestial objects or regions."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "target": {
                    "type": "string",
                    "description": "Optional: target object to focus on (e.g., 'Mars', 'Andromeda', 'ISS')"
                },
                "layer_mode": {
                    "type": "string",
                    "enum": ["all", "stars", "planets", "satellites", "deepsky"],
                    "description": "Which data layers to show (default: all)"
                },
                "magnitude_limit": {
                    "type": "number",
                    "description": "Optional: limit stars by magnitude (1-6, default: 6)"
                }
            },
            "required": []
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
        let target = input.get("target").and_then(|v| v.as_str()).unwrap_or("none");
        let layer_mode = input.get("layer_mode").and_then(|v| v.as_str()).unwrap_or("all");
        let magnitude_limit = input
            .get("magnitude_limit")
            .and_then(|v| v.as_f64())
            .unwrap_or(6.0);

        // Query astronomy cache for object counts
        let (star_count, planet_count, satellite_count, deepsky_count) = {
            let cache = app.state::<std::sync::Arc<crate::services::astronomy::AstronomyCache>>();
            let stars = crate::commands::astronomy_commands::get_stars(
                tauri::State::from(cache.clone()),
                app.clone(),
            ).await.ok().map(|s| s.len()).unwrap_or(0);
            let planets = crate::commands::astronomy_commands::get_planets(
                tauri::State::from(cache.clone()),
            ).await.ok().map(|p| p.len()).unwrap_or(0);
            let satellites = crate::commands::astronomy_commands::get_astronomical_satellites(
                tauri::State::from(cache.clone()),
            ).await.ok().map(|s| s.len()).unwrap_or(0);
            let deepsky = crate::commands::astronomy_commands::get_deepsky_objects(
                tauri::State::from(cache.clone()),
            ).await.ok().map(|o| o.len()).unwrap_or(0);
            (stars, planets, satellites, deepsky)
        };

        let active_layers = json!({
            "stars": layer_mode == "all" || layer_mode == "stars",
            "planets": layer_mode == "all" || layer_mode == "planets",
            "satellites": layer_mode == "all" || layer_mode == "satellites",
            "deepsky": layer_mode == "all" || layer_mode == "deepsky",
        });

        // Construct command to send to frontend
        let response = json!({
            "status": "success",
            "action": "activate_space_observatory",
            "config": {
                "target": target,
                "layers": active_layers,
                "star_magnitude_limit": magnitude_limit,
            },
            "object_counts": {
                "stars": star_count,
                "planets": planet_count,
                "satellites": satellite_count,
                "deepsky_objects": deepsky_count,
            },
            "message": format!(
                "Activating 3D space observatory{}. Showing {} layers at magnitude limit {}. \
                 Catalog loaded: {} stars, {} planets, {} satellites, {} deep-sky objects.",
                if target != "none" { format!(" - focusing on {}", target) } else { String::new() },
                layer_mode,
                magnitude_limit,
                star_count, planet_count, satellite_count, deepsky_count
            )
        });

        Ok(response)
    }
}
