use super::types::GeocodingResult;
use anyhow::{Result, anyhow};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct NominatimResult {
    lat: String,
    lon: String,
    display_name: String,
    #[serde(rename = "type")]
    place_type: Option<String>,
    importance: Option<f64>,
    boundingbox: Option<Vec<String>>,
}

/// Forward geocode: search query → coordinates (Nominatim/OSM, free)
pub async fn search(query: &str, limit: u8) -> Result<Vec<GeocodingResult>> {
    let url = format!(
        "https://nominatim.openstreetmap.org/search?q={}&format=json&limit={}&addressdetails=0",
        urlencoding::encode(query),
        limit.min(10)
    );

    let client = reqwest::Client::builder()
        .user_agent("ZenGTSM/0.1 (operational-monitor)")
        .build()?;

    let results: Vec<NominatimResult> = client.get(&url).send().await?.json().await?;

    let geocoded = results.into_iter().filter_map(|r| {
        let lat = r.lat.parse::<f64>().ok()?;
        let lon = r.lon.parse::<f64>().ok()?;

        let bounding_box = r.boundingbox.and_then(|bb| {
            if bb.len() == 4 {
                Some([
                    bb[0].parse::<f64>().unwrap_or(0.0),
                    bb[1].parse::<f64>().unwrap_or(0.0),
                    bb[2].parse::<f64>().unwrap_or(0.0),
                    bb[3].parse::<f64>().unwrap_or(0.0),
                ])
            } else {
                None
            }
        });

        Some(GeocodingResult {
            lat,
            lon,
            display_name: r.display_name,
            place_type: r.place_type.unwrap_or_else(|| "unknown".to_string()),
            importance: r.importance.unwrap_or(0.0),
            bounding_box,
        })
    }).collect();

    Ok(geocoded)
}

/// Reverse geocode: coordinates → place name
pub async fn reverse(lat: f64, lon: f64) -> Result<GeocodingResult> {
    let url = format!(
        "https://nominatim.openstreetmap.org/reverse?lat={}&lon={}&format=json",
        lat, lon
    );

    let client = reqwest::Client::builder()
        .user_agent("ZenGTSM/0.1 (operational-monitor)")
        .build()?;

    let result: NominatimResult = client.get(&url).send().await?.json().await?;

    let lat = result.lat.parse::<f64>().map_err(|_| anyhow!("Invalid lat"))?;
    let lon = result.lon.parse::<f64>().map_err(|_| anyhow!("Invalid lon"))?;

    let bounding_box = result.boundingbox.and_then(|bb| {
        if bb.len() == 4 {
            Some([
                bb[0].parse::<f64>().unwrap_or(0.0),
                bb[1].parse::<f64>().unwrap_or(0.0),
                bb[2].parse::<f64>().unwrap_or(0.0),
                bb[3].parse::<f64>().unwrap_or(0.0),
            ])
        } else {
            None
        }
    });

    Ok(GeocodingResult {
        lat,
        lon,
        display_name: result.display_name,
        place_type: result.place_type.unwrap_or_else(|| "unknown".to_string()),
        importance: result.importance.unwrap_or(0.0),
        bounding_box,
    })
}

/// Search within a radius (uses Nominatim viewbox)
pub async fn search_near(query: &str, center_lat: f64, center_lon: f64, radius_km: f64) -> Result<Vec<GeocodingResult>> {
    let delta = radius_km / 111.0;
    let viewbox = format!(
        "{},{},{},{}",
        center_lon - delta, center_lat + delta,
        center_lon + delta, center_lat - delta
    );

    let url = format!(
        "https://nominatim.openstreetmap.org/search?q={}&format=json&limit=10&viewbox={}&bounded=1",
        urlencoding::encode(query),
        viewbox
    );

    let client = reqwest::Client::builder()
        .user_agent("ZenGTSM/0.1 (operational-monitor)")
        .build()?;

    let results: Vec<NominatimResult> = client.get(&url).send().await?.json().await?;

    let geocoded = results.into_iter().filter_map(|r| {
        let lat = r.lat.parse::<f64>().ok()?;
        let lon = r.lon.parse::<f64>().ok()?;
        Some(GeocodingResult {
            lat,
            lon,
            display_name: r.display_name,
            place_type: r.place_type.unwrap_or_else(|| "unknown".to_string()),
            importance: r.importance.unwrap_or(0.0),
            bounding_box: None,
        })
    }).collect();

    Ok(geocoded)
}
