use super::types::{WeatherGridPoint, WeatherPoint};
use anyhow::Result;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct OpenMeteoResponse {
    current: Option<CurrentWeather>,
}

#[derive(Debug, Deserialize)]
struct CurrentWeather {
    temperature_2m: Option<f64>,
    wind_speed_10m: Option<f64>,
    wind_direction_10m: Option<f64>,
    relative_humidity_2m: Option<f64>,
    precipitation: Option<f64>,
    cloud_cover: Option<f64>,
    weather_code: Option<i32>,
}

/// Fetch current weather for a coordinate (Open-Meteo, free, no API key)
pub async fn fetch_weather(lat: f64, lon: f64) -> Result<WeatherPoint> {
    let url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={}&longitude={}&current=temperature_2m,relative_humidity_2m,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,weather_code",
        lat, lon
    );

    let client = reqwest::Client::builder()
        .user_agent("ZenGTSM/0.1")
        .build()?;

    let response: OpenMeteoResponse = client.get(&url).send().await?.json().await?;

    let current = response.current.unwrap_or(CurrentWeather {
        temperature_2m: Some(0.0),
        wind_speed_10m: Some(0.0),
        wind_direction_10m: Some(0.0),
        relative_humidity_2m: Some(0.0),
        precipitation: Some(0.0),
        cloud_cover: Some(0.0),
        weather_code: Some(0),
    });

    let code = current.weather_code.unwrap_or(0);

    Ok(WeatherPoint {
        lat,
        lon,
        temperature: current.temperature_2m.unwrap_or(0.0),
        wind_speed: current.wind_speed_10m.unwrap_or(0.0),
        wind_direction: current.wind_direction_10m.unwrap_or(0.0),
        humidity: current.relative_humidity_2m.unwrap_or(0.0),
        precipitation: current.precipitation.unwrap_or(0.0),
        cloud_cover: current.cloud_cover.unwrap_or(0.0),
        weather_code: code,
        description: wmo_code_to_description(code),
    })
}

/// Fetch a grid of temperature data points within a bounding box.
/// `step` controls density — smaller = more points (e.g., 2.0° = sparse, 0.5° = dense).
/// Open-Meteo is free with no API key; we batch multiple lat/lon pairs per request.
pub async fn fetch_weather_grid(
    lat_min: f64,
    lat_max: f64,
    lon_min: f64,
    lon_max: f64,
    step: f64,
) -> Result<Vec<WeatherGridPoint>> {
    // Generate grid coordinates
    let mut coords: Vec<(f64, f64)> = Vec::new();
    let mut lat = lat_min;
    while lat <= lat_max {
        let mut lon = lon_min;
        while lon <= lon_max {
            coords.push((lat, lon));
            lon += step;
        }
        lat += step;
    }

    // Cap at 200 points to be respectful to the free API
    if coords.len() > 200 {
        let ratio = coords.len() as f64 / 200.0;
        coords = coords
            .into_iter()
            .enumerate()
            .filter(|(i, _)| (*i as f64 / ratio).fract() < (1.0 / ratio))
            .map(|(_, c)| c)
            .take(200)
            .collect();
    }

    if coords.is_empty() {
        return Ok(vec![]);
    }

    let client = reqwest::Client::builder()
        .user_agent("ZenGTSM/0.1")
        .timeout(std::time::Duration::from_secs(15))
        .build()?;

    // Open-Meteo supports comma-separated lat/lon for multi-point queries
    // But it's limited, so we batch in groups of 50
    let mut results: Vec<WeatherGridPoint> = Vec::new();

    for chunk in coords.chunks(50) {
        let lats: Vec<String> = chunk.iter().map(|(lat, _)| format!("{:.2}", lat)).collect();
        let lons: Vec<String> = chunk.iter().map(|(_, lon)| format!("{:.2}", lon)).collect();

        let url = format!(
            "https://api.open-meteo.com/v1/forecast?latitude={}&longitude={}&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m",
            lats.join(","),
            lons.join(","),
        );

        match client.get(&url).send().await {
            Ok(resp) => {
                if let Ok(text) = resp.text().await {
                    // Open-Meteo returns either a single object or an array for multi-point
                    if let Ok(multi) = serde_json::from_str::<Vec<OpenMeteoResponse>>(&text) {
                        for (i, item) in multi.into_iter().enumerate() {
                            if i < chunk.len() {
                                let (lat, lon) = chunk[i];
                                if let Some(current) = item.current {
                                    results.push(WeatherGridPoint {
                                        lat,
                                        lon,
                                        temperature: current.temperature_2m.unwrap_or(0.0),
                                        weather_code: current.weather_code.unwrap_or(0),
                                        cloud_cover: current.cloud_cover.unwrap_or(0.0),
                                        wind_speed: current.wind_speed_10m.unwrap_or(0.0),
                                    });
                                }
                            }
                        }
                    } else if let Ok(single) = serde_json::from_str::<OpenMeteoResponse>(&text) {
                        // Single point response
                        if let Some(current) = single.current {
                            let (lat, lon) = chunk[0];
                            results.push(WeatherGridPoint {
                                lat,
                                lon,
                                temperature: current.temperature_2m.unwrap_or(0.0),
                                weather_code: current.weather_code.unwrap_or(0),
                                cloud_cover: current.cloud_cover.unwrap_or(0.0),
                                wind_speed: current.wind_speed_10m.unwrap_or(0.0),
                            });
                        }
                    }
                }
            }
            Err(e) => {
                tracing::debug!("Weather grid batch failed: {}", e);
            }
        }

        // Small delay between batches to respect rate limits
        if coords.len() > 50 {
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }
    }

    Ok(results)
}

fn wmo_code_to_description(code: i32) -> String {
    match code {
        0 => "Clear sky",
        1 => "Mainly clear",
        2 => "Partly cloudy",
        3 => "Overcast",
        45 => "Fog",
        48 => "Depositing rime fog",
        51 => "Light drizzle",
        53 => "Moderate drizzle",
        55 => "Dense drizzle",
        56 => "Light freezing drizzle",
        57 => "Dense freezing drizzle",
        61 => "Slight rain",
        63 => "Moderate rain",
        65 => "Heavy rain",
        66 => "Light freezing rain",
        67 => "Heavy freezing rain",
        71 => "Slight snowfall",
        73 => "Moderate snowfall",
        75 => "Heavy snowfall",
        77 => "Snow grains",
        80 => "Slight rain showers",
        81 => "Moderate rain showers",
        82 => "Violent rain showers",
        85 => "Slight snow showers",
        86 => "Heavy snow showers",
        95 => "Thunderstorm",
        96 => "Thunderstorm with slight hail",
        99 => "Thunderstorm with heavy hail",
        _ => "Unknown",
    }
    .to_string()
}
