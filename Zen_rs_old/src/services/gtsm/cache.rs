use std::collections::HashMap;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

struct CacheEntry<T> {
    data: T,
    inserted_at: Instant,
    ttl: Duration,
}

impl<T: Clone> CacheEntry<T> {
    fn is_valid(&self) -> bool {
        self.inserted_at.elapsed() < self.ttl
    }
}

/// Generic typed cache with configurable TTL per key
pub struct GtsmCache {
    satellites: RwLock<Option<CacheEntry<Vec<super::types::Satellite>>>>,
    flights: RwLock<Option<CacheEntry<Vec<super::types::Flight>>>>,
    earthquakes: RwLock<Option<CacheEntry<Vec<super::types::Earthquake>>>>,
    military: RwLock<Option<CacheEntry<Vec<super::types::MilitaryAircraft>>>>,
    vessels: RwLock<Option<CacheEntry<Vec<super::types::Vessel>>>>,
    natural_events: RwLock<Option<CacheEntry<Vec<super::types::NaturalEvent>>>>,
    weather: RwLock<HashMap<String, CacheEntry<super::types::WeatherPoint>>>,
    geocoding: RwLock<HashMap<String, CacheEntry<Vec<super::types::GeocodingResult>>>>,
    routes: RwLock<HashMap<String, CacheEntry<super::types::Route>>>,
}

impl GtsmCache {
    pub fn new() -> Self {
        Self {
            satellites: RwLock::new(None),
            flights: RwLock::new(None),
            earthquakes: RwLock::new(None),
            military: RwLock::new(None),
            vessels: RwLock::new(None),
            natural_events: RwLock::new(None),
            weather: RwLock::new(HashMap::new()),
            geocoding: RwLock::new(HashMap::new()),
            routes: RwLock::new(HashMap::new()),
        }
    }

    // ── Satellites ──
    pub async fn get_satellites(&self) -> Option<Vec<super::types::Satellite>> {
        let guard = self.satellites.read().await;
        guard.as_ref().and_then(|e| {
            if e.is_valid() {
                Some(e.data.clone())
            } else {
                None
            }
        })
    }

    pub async fn set_satellites(&self, data: Vec<super::types::Satellite>, ttl_secs: u64) {
        let mut guard = self.satellites.write().await;
        *guard = Some(CacheEntry {
            data,
            inserted_at: Instant::now(),
            ttl: Duration::from_secs(ttl_secs),
        });
    }

    // ── Flights ──
    pub async fn get_flights(&self) -> Option<Vec<super::types::Flight>> {
        let guard = self.flights.read().await;
        guard.as_ref().and_then(|e| {
            if e.is_valid() {
                Some(e.data.clone())
            } else {
                None
            }
        })
    }

    pub async fn set_flights(&self, data: Vec<super::types::Flight>, ttl_secs: u64) {
        let mut guard = self.flights.write().await;
        *guard = Some(CacheEntry {
            data,
            inserted_at: Instant::now(),
            ttl: Duration::from_secs(ttl_secs),
        });
    }

    // ── Earthquakes ──
    pub async fn get_earthquakes(&self) -> Option<Vec<super::types::Earthquake>> {
        let guard = self.earthquakes.read().await;
        guard.as_ref().and_then(|e| {
            if e.is_valid() {
                Some(e.data.clone())
            } else {
                None
            }
        })
    }

    pub async fn set_earthquakes(&self, data: Vec<super::types::Earthquake>, ttl_secs: u64) {
        let mut guard = self.earthquakes.write().await;
        *guard = Some(CacheEntry {
            data,
            inserted_at: Instant::now(),
            ttl: Duration::from_secs(ttl_secs),
        });
    }

    // ── Military ──
    pub async fn get_military(&self) -> Option<Vec<super::types::MilitaryAircraft>> {
        let guard = self.military.read().await;
        guard.as_ref().and_then(|e| {
            if e.is_valid() {
                Some(e.data.clone())
            } else {
                None
            }
        })
    }

    pub async fn set_military(&self, data: Vec<super::types::MilitaryAircraft>, ttl_secs: u64) {
        let mut guard = self.military.write().await;
        *guard = Some(CacheEntry {
            data,
            inserted_at: Instant::now(),
            ttl: Duration::from_secs(ttl_secs),
        });
    }

    // ── Vessels ──
    pub async fn get_vessels(&self) -> Option<Vec<super::types::Vessel>> {
        let guard = self.vessels.read().await;
        guard.as_ref().and_then(|e| {
            if e.is_valid() {
                Some(e.data.clone())
            } else {
                None
            }
        })
    }

    pub async fn set_vessels(&self, data: Vec<super::types::Vessel>, ttl_secs: u64) {
        let mut guard = self.vessels.write().await;
        *guard = Some(CacheEntry {
            data,
            inserted_at: Instant::now(),
            ttl: Duration::from_secs(ttl_secs),
        });
    }

    // ── Natural Events ──
    pub async fn get_natural_events(&self) -> Option<Vec<super::types::NaturalEvent>> {
        let guard = self.natural_events.read().await;
        guard.as_ref().and_then(|e| {
            if e.is_valid() {
                Some(e.data.clone())
            } else {
                None
            }
        })
    }

    pub async fn set_natural_events(&self, data: Vec<super::types::NaturalEvent>, ttl_secs: u64) {
        let mut guard = self.natural_events.write().await;
        *guard = Some(CacheEntry {
            data,
            inserted_at: Instant::now(),
            ttl: Duration::from_secs(ttl_secs),
        });
    }

    // ── Weather (keyed by lat,lon) ──
    pub async fn get_weather(&self, lat: f64, lon: f64) -> Option<super::types::WeatherPoint> {
        let key = format!("{:.2},{:.2}", lat, lon);
        let guard = self.weather.read().await;
        guard.get(&key).and_then(|e| {
            if e.is_valid() {
                Some(e.data.clone())
            } else {
                None
            }
        })
    }

    pub async fn set_weather(&self, data: super::types::WeatherPoint, ttl_secs: u64) {
        let key = format!("{:.2},{:.2}", data.lat, data.lon);
        let mut guard = self.weather.write().await;
        guard.insert(
            key,
            CacheEntry {
                data,
                inserted_at: Instant::now(),
                ttl: Duration::from_secs(ttl_secs),
            },
        );
    }

    // ── Geocoding (keyed by query string) ──
    pub async fn get_geocoding(&self, query: &str) -> Option<Vec<super::types::GeocodingResult>> {
        let guard = self.geocoding.read().await;
        guard.get(query).and_then(|e| {
            if e.is_valid() {
                Some(e.data.clone())
            } else {
                None
            }
        })
    }

    pub async fn set_geocoding(
        &self,
        query: &str,
        data: Vec<super::types::GeocodingResult>,
        ttl_secs: u64,
    ) {
        let mut guard = self.geocoding.write().await;
        guard.insert(
            query.to_string(),
            CacheEntry {
                data,
                inserted_at: Instant::now(),
                ttl: Duration::from_secs(ttl_secs),
            },
        );
    }

    // ── Routes (keyed by origin+dest) ──
    pub async fn get_route(&self, key: &str) -> Option<super::types::Route> {
        let guard = self.routes.read().await;
        guard.get(key).and_then(|e| {
            if e.is_valid() {
                Some(e.data.clone())
            } else {
                None
            }
        })
    }

    pub async fn set_route(&self, key: &str, data: super::types::Route, ttl_secs: u64) {
        let mut guard = self.routes.write().await;
        guard.insert(
            key.to_string(),
            CacheEntry {
                data,
                inserted_at: Instant::now(),
                ttl: Duration::from_secs(ttl_secs),
            },
        );
    }
}

impl Default for GtsmCache {
    fn default() -> Self {
        Self::new()
    }
}
