use super::types::{NavigationRoute, NavigationStep, RoutingProfile};
use anyhow::{anyhow, Result};
use reqwest::Client;
use serde::Deserialize;
use std::time::Duration;

pub enum RoutingProvider {
    Here,
    Google,
    Osrm,
}

/// Compute a route, prioritizing HERE, then Google, falling back to OSRM.
pub async fn compute_route(
    origin: [f64; 2],
    dest: [f64; 2],
    profile: RoutingProfile,
    here_api_key: Option<String>,
    google_api_key: Option<String>,
    pool: Option<&sqlx::SqlitePool>,
) -> Result<NavigationRoute> {
    if let Some(key) = here_api_key {
        if !key.is_empty() {
            match here_route(origin, dest, &profile, &key).await {
                Ok(route) => return Ok(route),
                Err(e) => tracing::warn!("HERE routing failed: {}", e),
            }
        }
    }

    if let Some(key) = google_api_key {
        if !key.is_empty() {
            match google_route(origin, dest, &profile, &key).await {
                Ok(route) => {
                    if let Some(p) = pool {
                        let _ = zen_db::queries::increment_setting(p, "google_maps_usage_count")
                            .await;
                    }
                    return Ok(route);
                }
                Err(e) => tracing::warn!("Google routing failed: {}", e),
            }
        }
    }

    osrm_route(origin, dest, &profile).await
}

// ==========================================
// GOOGLE ROUTES API (v2)
// ==========================================

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleRoutesResponse {
    routes: Option<Vec<GoogleRoute>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleRoute {
    distance_meters: f64,
    duration: String, // format "123s"
    static_duration: Option<String>,
    polyline: GooglePolyline,
    legs: Vec<GoogleLeg>,
}

#[derive(Debug, Deserialize)]
struct GooglePolyline {
    encoded_polyline: String,
}

#[derive(Debug, Deserialize)]
struct GoogleLeg {
    steps: Vec<GoogleStep>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleStep {
    distance_meters: f64,
    static_duration: String,
    navigation_instruction: Option<GoogleInstruction>,
    start_location: GoogleLatLng,
}

#[derive(Debug, Deserialize)]
struct GoogleInstruction {
    instructions: String,
}

#[derive(Debug, Deserialize)]
struct GoogleLatLng {
    lat_lng: HereLatLng,
}

async fn google_route(
    start: [f64; 2],
    end: [f64; 2],
    profile: &RoutingProfile,
    api_key: &str,
) -> Result<NavigationRoute> {
    let mode = match profile {
        RoutingProfile::Car | RoutingProfile::Truck => "DRIVE",
        RoutingProfile::Bicycle => "BICYCLE",
        RoutingProfile::Pedestrian => "WALK",
    };

    let url = "https://routes.googleapis.com/directions/v2:computeRoutes";
    let payload = serde_json::json!({
        "origin": { "location": { "latLng": { "latitude": start[0], "longitude": start[1] } } },
        "destination": { "location": { "latLng": { "latitude": end[0], "longitude": end[1] } } },
        "travelMode": mode,
        "routingPreference": "TRAFFIC_AWARE",
        "computeAlternativeRoutes": false,
        "languageCode": "en-US",
        "units": "METRIC"
    });

    let client = Client::builder().timeout(Duration::from_secs(10)).build()?;
    let response = client.post(url)
        .header("X-Goog-Api-Key", api_key)
        .header("X-Goog-FieldMask", "routes.duration,routes.staticDuration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps")
        .json(&payload)
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(anyhow!("Google API error: {}", response.status()));
    }

    let res: GoogleRoutesResponse = response.json().await?;
    let g_route = res
        .routes
        .and_then(|mut r| r.pop())
        .ok_or_else(|| anyhow!("No Google route found"))?;

    let dur_s = g_route
        .duration
        .trim_end_matches('s')
        .parse::<f64>()
        .unwrap_or(0.0);
    let static_dur_s = g_route
        .static_duration
        .as_ref()
        .map(|s| s.trim_end_matches('s').parse::<f64>().unwrap_or(dur_s))
        .unwrap_or(dur_s);

    let mut steps = Vec::new();
    for leg in g_route.legs {
        for step in leg.steps {
            steps.push(NavigationStep {
                lat: step.start_location.lat_lng.lat,
                lon: step.start_location.lat_lng.lng,
                instruction: step
                    .navigation_instruction
                    .map(|i| i.instructions)
                    .unwrap_or_default(),
                distance_m: step.distance_meters,
                duration_s: step
                    .static_duration
                    .trim_end_matches('s')
                    .parse::<f64>()
                    .unwrap_or(0.0),
                action: "move".into(),
            });
        }
    }

    Ok(NavigationRoute {
        provider: "Google".into(),
        geometry: vec![],
        polyline: g_route.polyline.encoded_polyline,
        distance_m: g_route.distance_meters,
        duration_s: static_dur_s,
        traffic_duration_s: Some(dur_s),
        steps,
        incidents: vec![],
        summary: format!(
            "Traffic delay: {:.0} min",
            (dur_s - static_dur_s).max(0.0) / 60.0
        ),
    })
}

// ==========================================
// HERE TECHNOLOGIES ROUTING (v8)
// ==========================================

#[derive(Debug, Deserialize)]
struct HereResponse {
    routes: Option<Vec<HereRoute>>,
}

#[derive(Debug, Deserialize)]
struct HereRoute {
    #[serde(rename = "id")]
    _id: Option<String>,
    sections: Vec<HereSection>,
}

#[derive(Debug, Deserialize)]
struct HereSection {
    #[serde(rename = "departure")]
    _departure: HerePlace,
    #[serde(rename = "arrival")]
    _arrival: HerePlace,
    summary: HereSummary,
    polyline: String,
    #[serde(rename = "turnByTurnActions")]
    turn_by_turn_actions: Option<Vec<HereAction>>,
}

#[derive(Debug, Deserialize)]
struct HerePlace {
    #[serde(rename = "place")]
    _place: HereLocation,
}

#[derive(Debug, Deserialize)]
struct HereLocation {
    #[serde(rename = "location")]
    _location: HereLatLng,
}

#[derive(Debug, Deserialize)]
struct HereLatLng {
    lat: f64,
    lng: f64,
}

#[derive(Debug, Deserialize)]
struct HereSummary {
    duration: f64,
    length: f64,
    #[serde(rename = "baseDuration")]
    base_duration: f64,
}

#[derive(Debug, Deserialize)]
struct HereAction {
    action: String,
    duration: f64,
    length: f64,
    instruction: String,
    #[serde(rename = "offset")]
    _offset: usize,
}

async fn here_route(
    start: [f64; 2],
    end: [f64; 2],
    profile: &RoutingProfile,
    api_key: &str,
) -> Result<NavigationRoute> {
    let transport_mode = match profile {
        RoutingProfile::Car => "car",
        RoutingProfile::Bicycle => "bicycle",
        RoutingProfile::Pedestrian => "pedestrian",
        RoutingProfile::Truck => "truck",
    };

    let url = format!(
        "https://router.hereapi.com/v8/routes?transportMode={}&origin={},{}&destination={},{}&return=polyline,summary,turnByTurnActions,elevation&routingMode=fast&apikey={}",
        transport_mode, start[0], start[1], end[0], end[1], api_key
    );

    let client = Client::builder().timeout(Duration::from_secs(10)).build()?;
    let response = client.get(&url).send().await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(anyhow!("HERE API error {status}: {body}"));
    }

    let res: HereResponse = response.json().await?;

    let route = res
        .routes
        .and_then(|mut rs| rs.pop())
        .ok_or_else(|| anyhow!("No route found from HERE"))?;

    let section = route
        .sections
        .into_iter()
        .next()
        .ok_or_else(|| anyhow!("No sections in HERE route"))?;

    let summary = format!(
        "Traffic delay: {} min",
        ((section.summary.duration - section.summary.base_duration) / 60.0)
            .max(0.0)
            .round()
    );

    let mut steps = Vec::new();
    if let Some(actions) = section.turn_by_turn_actions {
        for action in actions {
            // Approximation: HERE steps don't include lat/lon directly in the action object in summary-only responses.
            // Client side MapLibre handles the flexible polyline decoding to match offsets.
            // We just pass the step instructions.
            steps.push(NavigationStep {
                lat: 0.0, // Decoupled: decoded on client
                lon: 0.0,
                instruction: action.instruction,
                distance_m: action.length,
                duration_s: action.duration,
                action: action.action,
            });
        }
    }

    Ok(NavigationRoute {
        provider: "HERE".into(),
        geometry: vec![],           // Not used; polyline passed to MapTiler
        polyline: section.polyline, // Flexible Polyline format (MapLibre handles decoding or we use a JS flex-polyline decoder)
        distance_m: section.summary.length,
        duration_s: section.summary.base_duration,
        traffic_duration_s: Some(section.summary.duration),
        steps,
        incidents: vec![], // Requires Traffic API separately or incident return flags
        summary,
    })
}

// ==========================================
// OSRM FALLBACK ROUTING
// ==========================================

#[derive(Debug, Deserialize)]
struct OsrmResponse {
    code: String,
    routes: Option<Vec<OsrmRoute>>,
}

#[derive(Debug, Deserialize)]
struct OsrmRoute {
    distance: f64,
    duration: f64,
    geometry: String, // Polyline string
    legs: Vec<OsrmLeg>,
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

async fn osrm_route(
    start: [f64; 2],
    end: [f64; 2],
    profile: &RoutingProfile,
) -> Result<NavigationRoute> {
    // OSRM public demo only supports driving ("car"), bike, and foot.
    let transport_mode = match profile {
        RoutingProfile::Car | RoutingProfile::Truck => "driving",
        RoutingProfile::Bicycle => "cycling",
        RoutingProfile::Pedestrian => "foot",
    };

    let url = format!(
        "https://router.project-osrm.org/route/v1/{}/{},{};{},{}?overview=full&steps=true",
        transport_mode,
        start[1],
        start[0],
        end[1],
        end[0] // OSRM is lon,lat
    );

    let client = Client::builder()
        .user_agent("ZenGTSM/0.1")
        .timeout(Duration::from_secs(10))
        .build()?;

    let res: OsrmResponse = client.get(&url).send().await?.json().await?;

    if res.code != "Ok" {
        return Err(anyhow!("OSRM error: {}", res.code));
    }

    let route = res
        .routes
        .and_then(|mut rs| rs.pop())
        .ok_or_else(|| anyhow!("No route found from OSRM"))?;

    let mut steps = Vec::new();
    let mut summary = String::new();

    for leg in &route.legs {
        if let Some(s) = &leg.summary {
            summary = s.clone();
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

            steps.push(NavigationStep {
                lat: step.maneuver.location.get(1).copied().unwrap_or(0.0),
                lon: step.maneuver.location.first().copied().unwrap_or(0.0),
                instruction,
                distance_m: step.distance,
                duration_s: step.duration,
                action: step.maneuver.maneuver_type.clone(),
            });
        }
    }

    Ok(NavigationRoute {
        provider: "OSRM".into(),
        geometry: vec![],
        polyline: route.geometry, // Google polyline format
        distance_m: route.distance,
        duration_s: route.duration,
        traffic_duration_s: None, // No traffic in free OSRM
        steps,
        incidents: vec![],
        summary: if summary.is_empty() {
            "OSRM Route".into()
        } else {
            summary
        },
    })
}
