use serde::Serialize;

/// Read-only metadata for a compiled-in map data connector.
///
/// Endpoints stay in the owning Rust service. The renderer receives only
/// presentation metadata, never a URL it can redirect or execute itself.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapConnectorMetadata {
    pub id: &'static str,
    pub label: &'static str,
    pub provider: &'static str,
    pub attribution: &'static str,
    pub refresh_seconds: u32,
    pub maturity: &'static str,
}

pub fn built_in_connectors() -> Vec<MapConnectorMetadata> {
    vec![
        MapConnectorMetadata { id: "satellites", label: "Satellites", provider: "Zen spatial service", attribution: "Public orbital telemetry sources", refresh_seconds: 120, maturity: "partial" },
        MapConnectorMetadata { id: "flights", label: "Flights", provider: "Zen spatial service", attribution: "Public ADS-B data sources", refresh_seconds: 15, maturity: "partial" },
        MapConnectorMetadata { id: "earthquakes", label: "Earthquakes", provider: "Zen spatial service", attribution: "USGS earthquake catalog", refresh_seconds: 300, maturity: "partial" },
        MapConnectorMetadata { id: "military", label: "Military aircraft", provider: "Zen spatial service", attribution: "Public ADS-B data sources", refresh_seconds: 30, maturity: "partial" },
        MapConnectorMetadata { id: "vessels", label: "Vessels", provider: "Zen spatial service", attribution: "AIS feed configured by Zen", refresh_seconds: 60, maturity: "partial" },
        MapConnectorMetadata { id: "naturalEvents", label: "Natural events", provider: "NASA EONET via Zen", attribution: "NASA Earth Observatory Natural Event Tracker", refresh_seconds: 900, maturity: "production" },
        MapConnectorMetadata { id: "weather", label: "Weather", provider: "Open-Meteo via Zen", attribution: "Open-Meteo weather API", refresh_seconds: 60, maturity: "partial" },
        MapConnectorMetadata { id: "cables", label: "Undersea cables", provider: "Submarine Cable Map via Zen", attribution: "Submarine Cable Map", refresh_seconds: 86_400, maturity: "partial" },
        MapConnectorMetadata { id: "cameras", label: "Camera catalog", provider: "Zen vetted media registry", attribution: "Per-feed attribution is shown before playback", refresh_seconds: 3_600, maturity: "preview" },
    ]
}
