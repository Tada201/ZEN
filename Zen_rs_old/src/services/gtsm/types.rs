use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Satellite {
    pub id: String,
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    pub alt: f64,
    pub velocity: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Flight {
    pub icao24: String,
    pub callsign: Option<String>,
    pub lat: f64,
    pub lon: f64,
    pub alt: f64,
    pub velocity: f64,
    pub heading: f64,
    pub on_ground: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Earthquake {
    pub id: String,
    pub title: String,
    pub lat: f64,
    pub lon: f64,
    pub depth: f64,
    pub magnitude: f64,
    pub time: i64,
    pub place: String,
    pub tsunami: bool,
    pub alert: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeatherPoint {
    pub lat: f64,
    pub lon: f64,
    pub temperature: f64,
    pub wind_speed: f64,
    pub wind_direction: f64,
    pub humidity: f64,
    pub precipitation: f64,
    pub cloud_cover: f64,
    pub weather_code: i32,
    pub description: String,
}

/// Lightweight temperature grid point for heatmap rendering
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeatherGridPoint {
    pub lat: f64,
    pub lon: f64,
    pub temperature: f64,
    pub weather_code: i32,
    pub cloud_cover: f64,
    pub wind_speed: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MilitaryAircraft {
    pub hex: String,
    pub flight: Option<String>,
    pub lat: f64,
    pub lon: f64,
    pub alt_baro: f64,
    pub ground_speed: f64,
    pub track: f64,
    pub squawk: Option<String>,
    pub aircraft_type: Option<String>,
    pub registration: Option<String>,
    pub category: Option<String>,
    pub db_flags: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteStep {
    pub lat: f64,
    pub lon: f64,
    pub instruction: String,
    pub distance: f64,
    pub duration: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Route {
    pub distance: f64,
    pub duration: f64,
    pub geometry: Vec<[f64; 2]>,
    pub steps: Vec<RouteStep>,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeocodingResult {
    pub lat: f64,
    pub lon: f64,
    pub display_name: String,
    pub place_type: String,
    pub importance: f64,
    pub bounding_box: Option<[f64; 4]>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeofenceZone {
    pub id: String,
    pub name: String,
    pub zone_type: GeofenceType,
    pub vertices: Vec<[f64; 2]>,
    pub radius: Option<f64>,
    pub center: Option<[f64; 2]>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GeofenceType {
    Polygon,
    Circle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeofenceAlert {
    pub zone_id: String,
    pub zone_name: String,
    pub entity_type: String,
    pub entity_id: String,
    pub event: String,
    pub timestamp: i64,
    pub lat: f64,
    pub lon: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FusionEvent {
    pub id: String,
    pub event_type: String,
    pub description: String,
    pub timestamp: i64,
    pub entities: Vec<FusionEntity>,
    pub lat: f64,
    pub lon: f64,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FusionEntity {
    pub source: String,
    pub id: String,
    pub name: String,
}

/// AIS vessel data from aisstream.io
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Vessel {
    pub mmsi: String,
    pub name: String,
    pub ship_type: String,
    pub lat: f64,
    pub lon: f64,
    pub speed: f64,
    pub heading: f64,
    pub destination: Option<String>,
    pub flag: Option<String>,
}

/// Natural event from NASA EONET
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NaturalEvent {
    pub id: String,
    pub title: String,
    pub event_type: String,
    pub lat: f64,
    pub lon: f64,
    pub date: String,
    pub source_url: Option<String>,
    pub magnitude: Option<f64>,
    pub magnitude_unit: Option<String>,
}

/// Real-time stream message sent over WebSocket
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum GtsmStreamMessage {
    Satellites(Vec<Satellite>),
    SatelliteBatch(Vec<Satellite>),
    ClearSatellites,
    Flights(Vec<Flight>),
    Earthquakes(Vec<Earthquake>),
    Military(Vec<MilitaryAircraft>),
    Weather(WeatherPoint),
    Vessels(Vec<Vessel>),
    NaturalEvents(Vec<NaturalEvent>),
    GeofenceAlert(GeofenceAlert),
    FusionEvent(FusionEvent),
}

// ==========================================
// NAVIGATION SYSTEM (A->B Routing)
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RoutingProfile {
    #[serde(rename = "car")]
    Car,
    #[serde(rename = "bicycle")]
    Bicycle,
    #[serde(rename = "pedestrian")]
    Pedestrian,
    #[serde(rename = "truck")]
    Truck,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrafficIncident {
    pub id: String,
    pub lat: f64,
    pub lon: f64,
    pub type_code: String,
    pub description: String,
    pub severity: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NavigationStep {
    pub lat: f64,
    pub lon: f64,
    pub instruction: String,
    pub distance_m: f64,
    pub duration_s: f64,
    pub action: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NavigationRoute {
    pub provider: String,
    pub geometry: Vec<[f64; 2]>,
    pub polyline: String,
    pub distance_m: f64,
    pub duration_s: f64,
    pub traffic_duration_s: Option<f64>,
    pub steps: Vec<NavigationStep>,
    pub incidents: Vec<TrafficIncident>,
    pub summary: String,
}
