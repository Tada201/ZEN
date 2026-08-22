use super::types::*;

/// Detect satellite overflight events near earthquake epicenters
pub fn correlate_satellites_earthquakes(
    satellites: &[Satellite],
    earthquakes: &[Earthquake],
    radius_km: f64,
) -> Vec<FusionEvent> {
    let mut events = Vec::new();
    let now = chrono::Utc::now().timestamp();

    for eq in earthquakes {
        for sat in satellites {
            let dist = haversine(sat.lat, sat.lon, eq.lat, eq.lon);
            if dist <= radius_km {
                events.push(FusionEvent {
                    id: format!("fuse-{}-{}", sat.id, eq.id),
                    event_type: "satellite_over_earthquake".to_string(),
                    description: format!(
                        "{} overflying M{:.1} earthquake at {} (distance: {:.0} km)",
                        sat.name, eq.magnitude, eq.place, dist
                    ),
                    timestamp: now,
                    entities: vec![
                        FusionEntity {
                            source: "satellite".to_string(),
                            id: sat.id.clone(),
                            name: sat.name.clone(),
                        },
                        FusionEntity {
                            source: "earthquake".to_string(),
                            id: eq.id.clone(),
                            name: eq.title.clone(),
                        },
                    ],
                    lat: eq.lat,
                    lon: eq.lon,
                    confidence: 1.0 - (dist / radius_km).min(1.0),
                });
            }
        }
    }

    events
}

/// Detect military aircraft near earthquake zones
pub fn correlate_military_earthquakes(
    military: &[MilitaryAircraft],
    earthquakes: &[Earthquake],
    radius_km: f64,
) -> Vec<FusionEvent> {
    let mut events = Vec::new();
    let now = chrono::Utc::now().timestamp();

    for eq in earthquakes {
        for ac in military {
            let dist = haversine(ac.lat, ac.lon, eq.lat, eq.lon);
            if dist <= radius_km {
                let name = ac.flight.clone().unwrap_or_else(|| ac.hex.clone());
                events.push(FusionEvent {
                    id: format!("fuse-mil-{}-{}", ac.hex, eq.id),
                    event_type: "military_near_earthquake".to_string(),
                    description: format!(
                        "Military aircraft {} near M{:.1} earthquake at {} (distance: {:.0} km)",
                        name, eq.magnitude, eq.place, dist
                    ),
                    timestamp: now,
                    entities: vec![
                        FusionEntity {
                            source: "military".to_string(),
                            id: ac.hex.clone(),
                            name,
                        },
                        FusionEntity {
                            source: "earthquake".to_string(),
                            id: eq.id.clone(),
                            name: eq.title.clone(),
                        },
                    ],
                    lat: eq.lat,
                    lon: eq.lon,
                    confidence: 1.0 - (dist / radius_km).min(1.0),
                });
            }
        }
    }

    events
}

/// Detect flights and military aircraft in same airspace
pub fn correlate_flights_military(
    flights: &[Flight],
    military: &[MilitaryAircraft],
    radius_km: f64,
) -> Vec<FusionEvent> {
    let mut events = Vec::new();
    let now = chrono::Utc::now().timestamp();

    for ac in military {
        for flight in flights {
            let dist = haversine(flight.lat, flight.lon, ac.lat, ac.lon);
            if dist <= radius_km {
                let mil_name = ac.flight.clone().unwrap_or_else(|| ac.hex.clone());
                let civ_name = flight
                    .callsign
                    .clone()
                    .unwrap_or_else(|| flight.icao24.clone());
                events.push(FusionEvent {
                    id: format!("fuse-prox-{}-{}", ac.hex, flight.icao24),
                    event_type: "military_civilian_proximity".to_string(),
                    description: format!(
                        "Military {} and civilian {} within {:.0} km",
                        mil_name, civ_name, dist
                    ),
                    timestamp: now,
                    entities: vec![
                        FusionEntity {
                            source: "military".to_string(),
                            id: ac.hex.clone(),
                            name: mil_name,
                        },
                        FusionEntity {
                            source: "flight".to_string(),
                            id: flight.icao24.clone(),
                            name: civ_name,
                        },
                    ],
                    lat: (flight.lat + ac.lat) / 2.0,
                    lon: (flight.lon + ac.lon) / 2.0,
                    confidence: 1.0 - (dist / radius_km).min(1.0),
                });
            }
        }
    }

    events
}

fn haversine(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let r = 6371.0;
    let d_lat = (lat2 - lat1).to_radians();
    let d_lon = (lon2 - lon1).to_radians();
    let a = (d_lat / 2.0).sin().powi(2)
        + lat1.to_radians().cos() * lat2.to_radians().cos() * (d_lon / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().asin();
    r * c
}
