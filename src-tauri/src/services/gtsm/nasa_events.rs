use super::types::NaturalEvent;
use anyhow::Result;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct EonetResponse {
    events: Vec<EonetEvent>,
}

#[derive(Debug, Deserialize)]
struct EonetEvent {
    id: String,
    title: String,
    categories: Vec<EonetCategory>,
    geometry: Vec<EonetGeometry>,
    sources: Option<Vec<EonetSource>>,
}

#[derive(Debug, Deserialize)]
struct EonetCategory {
    id: String,
    #[serde(rename = "title")]
    _title: String,
}

#[derive(Debug, Deserialize)]
struct EonetGeometry {
    date: String,
    #[serde(rename = "type")]
    geom_type: String,
    coordinates: Vec<f64>,
    #[serde(rename = "magnitudeValue")]
    magnitude_value: Option<f64>,
    #[serde(rename = "magnitudeUnit")]
    magnitude_unit: Option<String>,
}

#[derive(Debug, Deserialize)]
struct EonetSource {
    url: Option<String>,
}

/// Map EONET category ID → our simplified event_type string
fn category_to_event_type(cat_id: &str) -> &'static str {
    match cat_id {
        "wildfires" => "wildfire",
        "volcanoes" => "volcano",
        "seaLakeIce" => "iceberg",
        "floods" => "flood",
        "severeStorms" => "storm",
        "landslides" => "landslide",
        "dustHaze" => "dust",
        "drought" => "drought",
        "tempExtremes" => "temperature",
        "snow" => "snow",
        "earthquakes" => "earthquake",
        "waterColor" => "water_color",
        _ => "unknown",
    }
}

/// Fetch active natural events from NASA EONET v3
pub async fn fetch_natural_events() -> Result<Vec<NaturalEvent>> {
    let url = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100";

    let client = crate::utils::gtsm_http_client();

    tracing::info!("Fetching natural events from NASA EONET...");
    let response: EonetResponse = client.get(url).send().await?.json().await?;

    let events: Vec<NaturalEvent> = response
        .events
        .into_iter()
        .filter_map(|event| {
            // Use the most recent geometry point
            let geom = event.geometry.last()?;

            // EONET coordinates are [lon, lat] for Point type
            let (lon, lat) = if geom.geom_type == "Point" && geom.coordinates.len() >= 2 {
                (geom.coordinates[0], geom.coordinates[1])
            } else {
                return None;
            };

            let event_type = event
                .categories
                .first()
                .map(|c| category_to_event_type(&c.id))
                .unwrap_or("unknown");

            let source_url = event
                .sources
                .as_ref()
                .and_then(|s| s.first())
                .and_then(|s| s.url.clone());

            Some(NaturalEvent {
                id: event.id,
                title: event.title,
                event_type: event_type.to_string(),
                lat,
                lon,
                date: geom.date.clone(),
                source_url,
                magnitude: geom.magnitude_value,
                magnitude_unit: geom.magnitude_unit.clone(),
            })
        })
        .collect();

    tracing::info!("Parsed {} active natural events from EONET", events.len());
    Ok(events)
}
