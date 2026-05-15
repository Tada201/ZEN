use super::types::Flight;
use anyhow::Result;

pub async fn fetch_flights() -> Result<Vec<Flight>> {
    let url = "https://opensky-network.org/api/states/all";
    let client = reqwest::Client::builder()
        .user_agent("ZenGTSM/0.1 (operational-monitor)")
        .timeout(std::time::Duration::from_secs(10))
        .build()?;
        
    let response_res = client.get(url).send().await?;
    let status = response_res.status();
    if !status.is_success() {
        let body = response_res.text().await.unwrap_or_else(|_| "Unavailable".to_string());
        tracing::error!("OpenSky API Error [{}]: {}", status, body);
        return Err(anyhow::anyhow!("OpenSky error: {}", status));
    }
    
    let response: serde_json::Value = response_res.json().await?;
    
    let mut flights = Vec::new();
    
    if let Some(states) = response["states"].as_array() {
        for state in states {
            if let Some(row) = state.as_array() {
                let icao24 = row[0].as_str().unwrap_or("").to_string();
                let callsign = row[1].as_str().map(|s| s.trim().to_string());
                let lon = row[5].as_f64();
                let lat = row[6].as_f64();
                let alt = row[7].as_f64().or(row[13].as_f64()).unwrap_or(0.0);
                let velocity = row[9].as_f64().unwrap_or(0.0);
                let heading = row[10].as_f64().unwrap_or(0.0);
                let on_ground = row[8].as_bool().unwrap_or(false);
                
                if let (Some(lat), Some(lon)) = (lat, lon) {
                    flights.push(Flight {
                        icao24,
                        callsign,
                        lat,
                        lon,
                        alt,
                        velocity,
                        heading,
                        on_ground,
                    });
                }
            }
            if flights.len() >= 100 { break; }
        }
    }
    
    Ok(flights)
}
