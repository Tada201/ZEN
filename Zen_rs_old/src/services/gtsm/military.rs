use super::types::MilitaryAircraft;
use anyhow::Result;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct AdsbLolResponse {
    ac: Option<Vec<AdsbAircraft>>,
}

#[derive(Debug, Deserialize)]
struct AdsbAircraft {
    hex: Option<String>,
    flight: Option<String>,
    lat: Option<f64>,
    lon: Option<f64>,
    alt_baro: Option<serde_json::Value>,
    gs: Option<f64>,
    track: Option<f64>,
    squawk: Option<String>,
    #[serde(rename = "t")]
    aircraft_type: Option<String>,
    #[serde(rename = "r")]
    registration: Option<String>,
    category: Option<String>,
    #[serde(rename = "dbFlags")]
    db_flags: Option<i32>,
}

/// Fetch military aircraft from adsb.lol (free, community-run, no API key)
pub async fn fetch_military() -> Result<Vec<MilitaryAircraft>> {
    let url = "https://api.adsb.lol/v2/mil";

    let client = crate::utils::gtsm_http_client();

    let response: AdsbLolResponse = client.get(url).send().await?.json().await?;

    let aircraft = response
        .ac
        .unwrap_or_default()
        .into_iter()
        .filter_map(|ac| {
            let lat = ac.lat?;
            let lon = ac.lon?;
            let alt_baro = match ac.alt_baro {
                Some(serde_json::Value::Number(n)) => n.as_f64().unwrap_or(0.0),
                Some(serde_json::Value::String(ref s)) if s == "ground" => 0.0,
                _ => 0.0,
            };

            Some(MilitaryAircraft {
                hex: ac.hex.unwrap_or_default(),
                flight: ac.flight.map(|s| s.trim().to_string()),
                lat,
                lon,
                alt_baro,
                ground_speed: ac.gs.unwrap_or(0.0),
                track: ac.track.unwrap_or(0.0),
                squawk: ac.squawk,
                aircraft_type: ac.aircraft_type,
                registration: ac.registration,
                category: ac.category,
                db_flags: ac.db_flags,
            })
        })
        .collect();

    Ok(aircraft)
}

/// Fetch military aircraft within a bounding box
pub async fn fetch_military_in_area(
    lat1: f64,
    lon1: f64,
    lat2: f64,
    lon2: f64,
) -> Result<Vec<MilitaryAircraft>> {
    let all = fetch_military().await?;
    let filtered = all
        .into_iter()
        .filter(|ac| {
            let min_lat = lat1.min(lat2);
            let max_lat = lat1.max(lat2);
            let min_lon = lon1.min(lon2);
            let max_lon = lon1.max(lon2);
            ac.lat >= min_lat && ac.lat <= max_lat && ac.lon >= min_lon && ac.lon <= max_lon
        })
        .collect();
    Ok(filtered)
}
