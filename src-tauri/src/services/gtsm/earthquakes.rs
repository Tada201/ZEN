use super::types::Earthquake;
use anyhow::Result;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct UsgsResponse {
    features: Vec<UsgsFeature>,
}

#[derive(Debug, Deserialize)]
struct UsgsFeature {
    id: String,
    properties: UsgsProperties,
    geometry: UsgsGeometry,
}

#[derive(Debug, Deserialize)]
struct UsgsProperties {
    mag: Option<f64>,
    place: Option<String>,
    time: Option<i64>,
    title: Option<String>,
    tsunami: Option<i32>,
    alert: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UsgsGeometry {
    coordinates: Vec<f64>,
}

/// Fetch recent earthquakes from USGS (free, no API key)
/// `min_magnitude`: minimum magnitude filter (e.g., 2.5 for notable quakes)
/// `hours`: how many hours back to search (max 720 = 30 days)
pub async fn fetch_earthquakes(min_magnitude: f64, hours: u32) -> Result<Vec<Earthquake>> {
    let end = chrono::Utc::now();
    let start = end - chrono::Duration::hours(hours as i64);

    let url = format!(
        "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime={}&endtime={}&minmagnitude={}&orderby=time&limit=200",
        start.format("%Y-%m-%dT%H:%M:%S"),
        end.format("%Y-%m-%dT%H:%M:%S"),
        min_magnitude
    );

    let client = crate::utils::gtsm_http_client();

    let response: UsgsResponse = client.get(&url).send().await?.json().await?;

    let earthquakes = response
        .features
        .into_iter()
        .map(|f| {
            let lon = f.geometry.coordinates.first().copied().unwrap_or(0.0);
            let lat = f.geometry.coordinates.get(1).copied().unwrap_or(0.0);
            let depth = f.geometry.coordinates.get(2).copied().unwrap_or(0.0);

            Earthquake {
                id: f.id,
                title: f.properties.title.unwrap_or_default(),
                lat,
                lon,
                depth,
                magnitude: f.properties.mag.unwrap_or(0.0),
                time: f.properties.time.unwrap_or(0),
                place: f.properties.place.unwrap_or_default(),
                tsunami: f.properties.tsunami.map(|t| t > 0).unwrap_or(false),
                alert: f.properties.alert,
            }
        })
        .collect();

    Ok(earthquakes)
}
