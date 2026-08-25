//! Retired OSINT feed adapters kept source-only for the future unified
//! `world_map` tool. They are intentionally not registered or agent-visible.

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use tauri::AppHandle;

/// Fetch earthquake data via USGS
pub struct EarthquakeTool;

#[async_trait]
impl zen_tools::AgentTool<tauri::AppHandle> for EarthquakeTool {
    fn id(&self) -> &str {
        "get_earthquakes"
    }

    fn description(&self) -> &str {
        "Fetch recent earthquake data from USGS. Returns magnitude, location, depth, and tsunami alerts."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "min_magnitude": { "type": "number", "description": "Minimum magnitude (default 2.5)", "default": 2.5 },
                "hours": { "type": "integer", "description": "Hours to look back (default 24, max 720)", "default": 24 }
            }
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
        let min_mag = input
            .get("min_magnitude")
            .and_then(|v| v.as_f64())
            .unwrap_or(2.5);
        let hours = input.get("hours").and_then(|v| v.as_u64()).unwrap_or(24) as u32;

        let quakes = crate::services::gtsm::earthquakes::fetch_earthquakes(min_mag, hours)
            .await
            .map_err(|e| anyhow!("Earthquake fetch failed: {e}"))?;

        // Build narrative summary
        let summary = if quakes.is_empty() {
            format!(
                "No earthquakes detected with magnitude ≥ {min_mag} in the past {hours} hours."
            )
        } else {
            let max_quake = quakes
                .iter()
                .max_by(|a, b| {
                    a.magnitude
                        .partial_cmp(&b.magnitude)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .ok_or_else(|| anyhow::anyhow!("No quake found despite non-empty list"))?;
            let strong_count = quakes.iter().filter(|q| q.magnitude >= 5.0).count();
            let tsunami_count = quakes.iter().filter(|q| q.tsunami).count();

            let mut summary_parts = vec![format!(
                "Detected {} earthquakes (M{:.1}+) in the past {} hours",
                quakes.len(),
                min_mag,
                hours
            )];

            if strong_count > 0 {
                summary_parts.push(format!("{strong_count} exceeded M5.0"));
            }
            if tsunami_count > 0 {
                summary_parts.push(format!("{tsunami_count} issued tsunami alerts"));
            }

            summary_parts.push(format!(
                "Strongest: M{:.1} at {} (depth: {:.1}km)",
                max_quake.magnitude, max_quake.place, max_quake.depth
            ));

            summary_parts.join("; ") + "."
        };

        Ok(json!({
            "summary": summary,
            "count": quakes.len(),
            "earthquakes": quakes,
        }))
    }
}

// Weather lookup is intentionally not an agent tool. Current weather should
// use `web_search` until a canonical information tool is defined.

/// Fetch military aircraft positions
pub struct MilitaryTrackingTool;

#[async_trait]
impl zen_tools::AgentTool<tauri::AppHandle> for MilitaryTrackingTool {
    fn id(&self) -> &str {
        "get_military_aircraft"
    }

    fn description(&self) -> &str {
        "Fetch current military aircraft positions from ADS-B data. Optionally filter by bounding box."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "lat1": { "type": "number", "description": "Bounding box south latitude (optional)" },
                "lon1": { "type": "number", "description": "Bounding box west longitude (optional)" },
                "lat2": { "type": "number", "description": "Bounding box north latitude (optional)" },
                "lon2": { "type": "number", "description": "Bounding box east longitude (optional)" }
            }
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
        let has_bbox = input.get("lat1").is_some();

        let aircraft = if has_bbox {
            let lat1 = input["lat1"].as_f64().unwrap_or(-90.0);
            let lon1 = input["lon1"].as_f64().unwrap_or(-180.0);
            let lat2 = input["lat2"].as_f64().unwrap_or(90.0);
            let lon2 = input["lon2"].as_f64().unwrap_or(180.0);
            crate::services::gtsm::military::fetch_military_in_area(lat1, lon1, lat2, lon2).await
        } else {
            crate::services::gtsm::military::fetch_military().await
        }
        .map_err(|e| anyhow!("Military tracking failed: {e}"))?;

        // Build narrative summary
        let summary = if aircraft.is_empty() {
            if has_bbox {
                "No military aircraft detected in the specified area.".to_string()
            } else {
                "No military aircraft currently broadcasting ADS-B signals.".to_string()
            }
        } else {
            let mut type_counts: std::collections::HashMap<&str, usize> =
                std::collections::HashMap::new();
            for ac in &aircraft {
                let type_str = ac.aircraft_type.as_deref().unwrap_or("Unknown");
                *type_counts.entry(type_str).or_insert(0) += 1;
            }

            let type_summary: Vec<String> = type_counts
                .iter()
                .map(|(t, c)| format!("{t} x{c}"))
                .collect();

            let altitude_avg =
                aircraft.iter().map(|a| a.alt_baro).sum::<f64>() / aircraft.len() as f64;

            let speed_max = aircraft
                .iter()
                .map(|a| a.ground_speed)
                .fold(0.0f64, |a, b| a.max(b));

            let callsigns: Vec<&str> = aircraft
                .iter()
                .filter_map(|a| a.flight.as_deref())
                .take(5)
                .collect();

            let mut summary_parts = vec![format!("Tracking {} military aircraft", aircraft.len())];

            if !type_summary.is_empty() {
                summary_parts.push(format!("Types: {}", type_summary.join(", ")));
            }

            if !callsigns.is_empty() {
                summary_parts.push(format!("Callsigns: {}", callsigns.join(", ")));
            }

            summary_parts.push(format!(
                "Avg altitude: {altitude_avg:.0} ft, Max speed: {speed_max:.0} km/h"
            ));

            summary_parts.join("; ") + "."
        };

        Ok(json!({
            "summary": summary,
            "count": aircraft.len(),
            "aircraft": aircraft,
        }))
    }
}
