use super::types::{Route, RouteStep};
use anyhow::{anyhow, Result};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct OsrmResponse {
    code: String,
    routes: Option<Vec<OsrmRoute>>,
}

#[derive(Debug, Deserialize)]
struct OsrmRoute {
    distance: f64,
    duration: f64,
    geometry: OsrmGeometry,
    legs: Vec<OsrmLeg>,
}

#[derive(Debug, Deserialize)]
struct OsrmGeometry {
    coordinates: Vec<Vec<f64>>,
}

#[derive(Debug, Deserialize)]
struct OsrmLeg {
    steps: Vec<OsrmStep>,
    summary: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OsrmStep {
    distance: f64,
    duration: f64,
    maneuver: OsrmManeuver,
    name: String,
}

#[derive(Debug, Deserialize)]
struct OsrmManeuver {
    location: Vec<f64>,
    #[serde(rename = "type")]
    maneuver_type: String,
    modifier: Option<String>,
}

/// Calculate a driving route between two points (OSRM public demo, free)
pub async fn calculate_route(
    start_lat: f64,
    start_lon: f64,
    end_lat: f64,
    end_lon: f64,
) -> Result<Route> {
    let url = format!(
        "https://router.project-osrm.org/route/v1/driving/{start_lon},{start_lat};{end_lon},{end_lat}?overview=full&geometries=geojson&steps=true"
    );

    let client = crate::utils::gtsm_http_client();

    let response: OsrmResponse = client.get(&url).send().await?.json().await?;

    if response.code != "Ok" {
        return Err(anyhow!("OSRM error: {}", response.code));
    }

    let osrm_route = response
        .routes
        .and_then(|r| r.into_iter().next())
        .ok_or_else(|| anyhow!("No route found"))?;

    let geometry: Vec<[f64; 2]> = osrm_route
        .geometry
        .coordinates
        .into_iter()
        .map(|c| {
            let lon = c.first().copied().unwrap_or(0.0);
            let lat = c.get(1).copied().unwrap_or(0.0);
            [lat, lon]
        })
        .collect();

    let mut steps = Vec::new();
    let mut summary = String::new();

    for leg in &osrm_route.legs {
        if let Some(s) = &leg.summary {
            if !summary.is_empty() {
                summary.push_str(" → ");
            }
            summary.push_str(s);
        }
        for step in &leg.steps {
            let instruction = if let Some(modifier) = &step.maneuver.modifier {
                format!(
                    "{} {} onto {}",
                    step.maneuver.maneuver_type, modifier, step.name
                )
            } else {
                format!("{} on {}", step.maneuver.maneuver_type, step.name)
            };

            steps.push(RouteStep {
                lat: step.maneuver.location.get(1).copied().unwrap_or(0.0),
                lon: step.maneuver.location.first().copied().unwrap_or(0.0),
                instruction,
                distance: step.distance,
                duration: step.duration,
            });
        }
    }

    Ok(Route {
        distance: osrm_route.distance,
        duration: osrm_route.duration,
        geometry,
        steps,
        summary,
    })
}

/// Calculate route with multiple waypoints
pub async fn calculate_route_waypoints(waypoints: &[[f64; 2]]) -> Result<Route> {
    if waypoints.len() < 2 {
        return Err(anyhow!("Need at least 2 waypoints"));
    }

    let coords: Vec<String> = waypoints
        .iter()
        .map(|[lat, lon]| format!("{lon},{lat}"))
        .collect();

    let url = format!(
        "https://router.project-osrm.org/route/v1/driving/{}?overview=full&geometries=geojson&steps=true",
        coords.join(";")
    );

    let client = crate::utils::gtsm_http_client();

    let response: OsrmResponse = client.get(&url).send().await?.json().await?;

    if response.code != "Ok" {
        return Err(anyhow!("OSRM error: {}", response.code));
    }

    let osrm_route = response
        .routes
        .and_then(|r| r.into_iter().next())
        .ok_or_else(|| anyhow!("No route found"))?;

    let geometry: Vec<[f64; 2]> = osrm_route
        .geometry
        .coordinates
        .into_iter()
        .map(|c| {
            let lon = c.first().copied().unwrap_or(0.0);
            let lat = c.get(1).copied().unwrap_or(0.0);
            [lat, lon]
        })
        .collect();

    let mut steps = Vec::new();
    let mut summary = String::new();

    for leg in &osrm_route.legs {
        if let Some(s) = &leg.summary {
            if !summary.is_empty() {
                summary.push_str(" → ");
            }
            summary.push_str(s);
        }
        for step in &leg.steps {
            let instruction = if let Some(modifier) = &step.maneuver.modifier {
                format!(
                    "{} {} onto {}",
                    step.maneuver.maneuver_type, modifier, step.name
                )
            } else {
                format!("{} on {}", step.maneuver.maneuver_type, step.name)
            };
            steps.push(RouteStep {
                lat: step.maneuver.location.get(1).copied().unwrap_or(0.0),
                lon: step.maneuver.location.first().copied().unwrap_or(0.0),
                instruction,
                distance: step.distance,
                duration: step.duration,
            });
        }
    }

    Ok(Route {
        distance: osrm_route.distance,
        duration: osrm_route.duration,
        geometry,
        steps,
        summary,
    })
}
