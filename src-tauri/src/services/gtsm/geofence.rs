use super::types::{GeofenceZone, GeofenceType, GeofenceAlert};
use std::collections::{HashMap, HashSet};
use tokio::sync::RwLock;

pub struct GeofenceEngine {
    zones: RwLock<HashMap<String, GeofenceZone>>,
    /// Tracks which entities are currently inside each zone
    inside: RwLock<HashMap<String, HashSet<String>>>,
}

impl GeofenceEngine {
    pub fn new() -> Self {
        Self {
            zones: RwLock::new(HashMap::new()),
            inside: RwLock::new(HashMap::new()),
        }
    }

    pub async fn add_zone(&self, zone: GeofenceZone) {
        let id = zone.id.clone();
        self.zones.write().await.insert(id.clone(), zone);
        self.inside.write().await.entry(id).or_insert_with(HashSet::new);
    }

    pub async fn remove_zone(&self, zone_id: &str) {
        self.zones.write().await.remove(zone_id);
        self.inside.write().await.remove(zone_id);
    }

    pub async fn list_zones(&self) -> Vec<GeofenceZone> {
        self.zones.read().await.values().cloned().collect()
    }

    /// Check a point against all zones, returning alerts for enter/exit events
    pub async fn check_point(
        &self,
        entity_type: &str,
        entity_id: &str,
        lat: f64,
        lon: f64,
    ) -> Vec<GeofenceAlert> {
        let zones = self.zones.read().await;
        let mut inside_map = self.inside.write().await;
        let mut alerts = Vec::new();
        let now = chrono::Utc::now().timestamp();
        let entity_key = format!("{}:{}", entity_type, entity_id);

        for (zone_id, zone) in zones.iter() {
            let is_inside = match &zone.zone_type {
                GeofenceType::Polygon => point_in_polygon(lat, lon, &zone.vertices),
                GeofenceType::Circle => {
                    if let (Some(center), Some(radius)) = (&zone.center, &zone.radius) {
                        haversine_distance(lat, lon, center[0], center[1]) <= *radius
                    } else {
                        false
                    }
                }
            };

            let was_inside = inside_map
                .get(zone_id)
                .map(|s| s.contains(&entity_key))
                .unwrap_or(false);

            if is_inside && !was_inside {
                inside_map.entry(zone_id.clone()).or_default().insert(entity_key.clone());
                alerts.push(GeofenceAlert {
                    zone_id: zone_id.clone(),
                    zone_name: zone.name.clone(),
                    entity_type: entity_type.to_string(),
                    entity_id: entity_id.to_string(),
                    event: "ENTER".to_string(),
                    timestamp: now,
                    lat,
                    lon,
                });
            } else if !is_inside && was_inside {
                if let Some(set) = inside_map.get_mut(zone_id) {
                    set.remove(&entity_key);
                }
                alerts.push(GeofenceAlert {
                    zone_id: zone_id.clone(),
                    zone_name: zone.name.clone(),
                    entity_type: entity_type.to_string(),
                    entity_id: entity_id.to_string(),
                    event: "EXIT".to_string(),
                    timestamp: now,
                    lat,
                    lon,
                });
            }
        }

        alerts
    }
}

/// Ray-casting algorithm for point-in-polygon
fn point_in_polygon(lat: f64, lon: f64, vertices: &[[f64; 2]]) -> bool {
    let n = vertices.len();
    if n < 3 { return false; }

    let mut inside = false;
    let mut j = n - 1;

    for i in 0..n {
        let yi = vertices[i][0];
        let xi = vertices[i][1];
        let yj = vertices[j][0];
        let xj = vertices[j][1];

        if ((yi > lat) != (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
        j = i;
    }

    inside
}

/// Haversine distance in kilometers
fn haversine_distance(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let r = 6371.0;
    let d_lat = (lat2 - lat1).to_radians();
    let d_lon = (lon2 - lon1).to_radians();
    let a = (d_lat / 2.0).sin().powi(2)
        + lat1.to_radians().cos() * lat2.to_radians().cos() * (d_lon / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().asin();
    r * c
}
