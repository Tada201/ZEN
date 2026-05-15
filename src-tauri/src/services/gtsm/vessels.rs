use super::types::{Vessel, GtsmStreamMessage};
use super::cache::GtsmCache;
use anyhow::Result;
use serde::Deserialize;
use std::sync::Arc;
use tokio::sync::broadcast;
use futures_util::{StreamExt, SinkExt};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};

/// Vessel type code from AIS to human-readable string
fn ais_ship_type(code: Option<i32>) -> String {
    match code.unwrap_or(0) {
        30 => "fishing".to_string(),
        31..=32 => "towing".to_string(),
        33 => "dredging".to_string(),
        34 => "diving".to_string(),
        35 => "military".to_string(),
        36 => "sailing".to_string(),
        37 => "pleasure".to_string(),
        40..=49 => "high_speed".to_string(),
        50 => "pilot".to_string(),
        51 => "sar".to_string(),
        52 => "tug".to_string(),
        53 => "port_tender".to_string(),
        55 => "law_enforcement".to_string(),
        60..=69 => "passenger".to_string(),
        70..=79 => "cargo".to_string(),
        80..=89 => "tanker".to_string(),
        _ => "other".to_string(),
    }
}

// ─── REST Fallback approach using a public AIS aggregator ─────────

/// Response from a public AIS data source
#[derive(Debug, Deserialize)]
struct AisResponse {
    #[serde(default)]
    data: Vec<AisVessel>,
}

#[derive(Debug, Deserialize)]
struct AisVessel {
    #[serde(rename = "MMSI")]
    mmsi: Option<i64>,
    #[serde(rename = "SHIPNAME")]
    ship_name: Option<String>,
    #[serde(rename = "LAT")]
    lat: Option<f64>,
    #[serde(rename = "LON")]
    lon: Option<f64>,
    #[serde(rename = "SPEED")]
    speed: Option<f64>,
    #[serde(rename = "HEADING")]
    heading: Option<f64>,
    #[serde(rename = "DESTINATION")]
    destination: Option<String>,
    #[serde(rename = "FLAG")]
    flag: Option<String>,
    #[serde(rename = "SHIPTYPE")]
    ship_type: Option<i32>,
}

/// Spawn a background task to connect to aisstream.io and stream vessels.
/// Vessels are batched and broadcast every few seconds to avoid flooding the
/// internal WebSocket channel with thousands of tiny per-message updates.
pub fn spawn_ais_stream(
    api_key: String,
    tx: broadcast::Sender<String>,
    cache: Arc<GtsmCache>,
) {
    tokio::spawn(async move {
        if api_key.is_empty() {
            tracing::debug!("No AIS API key configured, skipping vessel stream");
            return;
        }

        let url = "wss://stream.aisstream.io/v0/stream";
        tracing::info!("Connecting to AIS stream at {}", url);

        loop {
            match connect_async(url).await {
                Ok((ws_stream, _)) => {
                    tracing::info!("Connected to AIS stream!");
                    let (mut write, mut read) = ws_stream.split();

                    // 1. Subscription with filters to reduce noise
                    let sub_msg = serde_json::json!({
                        "APIKey": api_key,
                        "BoundingBoxes": [
                            [[20, -130], [55, -60]],   // North America coasts
                            [[30, -15],  [65,  45]],   // Europe & Med
                            [[-10, 95],  [45, 145]],   // East / SE Asia
                            [[-45, 15],  [5,   55]],   // East Africa / Indian Ocean
                            [[-60, -80], [15, -30]]    // South America coasts
                        ],
                        "FilterMessageTypes": ["PositionReport", "ShipStaticData"]
                    });

                    if let Err(e) = write.send(Message::Text(sub_msg.to_string().into())).await {
                        tracing::error!("Failed to subscribe to AIS stream: {}", e);
                        tokio::time::sleep(std::time::Duration::from_secs(10)).await;
                        continue;
                    }

                    tracing::info!("Subscribed to AIS stream (filtered: PositionReport, ShipStaticData)");

                    // 2. Heartbeat task to keep connection alive
                    let write_arc = Arc::new(tokio::sync::Mutex::new(write));
                    let write_ping = write_arc.clone();
                    let ping_handle = tokio::spawn(async move {
                        let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
                        loop {
                            interval.tick().await;
                            let mut w = write_ping.lock().await;
                            if let Err(e) = w.send(Message::Ping(vec![].into())).await {
                                tracing::warn!("Failed to send AIS ping: {}", e);
                                break;
                            }
                        }
                    });

                    // Batch management
                    let batch: Arc<tokio::sync::Mutex<Vec<Vessel>>> =
                        Arc::new(tokio::sync::Mutex::new(Vec::new()));
                    let batch_flush = batch.clone();
                    let cache_flush = cache.clone();
                    let tx_flush = tx.clone();

                    let flush_handle = tokio::spawn(async move {
                        let mut interval =
                            tokio::time::interval(std::time::Duration::from_secs(5));
                        loop {
                            interval.tick().await;
                            let pending: Vec<Vessel> = {
                                let mut lock = batch_flush.lock().await;
                                std::mem::take(&mut *lock)
                            };
                            if pending.is_empty() {
                                continue;
                            }

                            // Merge into cache
                            let mut existing =
                                cache_flush.get_vessels().await.unwrap_or_default();
                            for v in &pending {
                                if let Some(idx) =
                                    existing.iter().position(|e| e.mmsi == v.mmsi)
                                {
                                    // Combine message data if possible
                                    let mut updated = v.clone();
                                    // If new msg is position report and we had metadata, keep metadata
                                    if updated.ship_type == "other" && existing[idx].ship_type != "other" {
                                        updated.ship_type = existing[idx].ship_type.clone();
                                    }
                                    if updated.destination.is_none() {
                                        updated.destination = existing[idx].destination.clone();
                                    }
                                    existing[idx] = updated;
                                } else {
                                    existing.push(v.clone());
                                }
                            }
                            if existing.len() > 10_000 {
                                existing.drain(0..(existing.len() - 10_000));
                            }
                            cache_flush.set_vessels(existing, 600).await;

                            // Broadcast
                            if let Ok(json) =
                                serde_json::to_string(&GtsmStreamMessage::Vessels(pending))
                            {
                                let _ = tx_flush.send(json);
                            }
                        }
                    });

                    while let Some(msg_res) = read.next().await {
                        match msg_res {
                            Ok(Message::Text(text)) => {
                                let json_str = text.to_string();
                                if let Ok(parsed) = parse_ais_message(&json_str) {
                                    if !parsed.is_empty() {
                                        batch.lock().await.extend(parsed);
                                    }
                                }
                            }
                            Ok(Message::Close(_)) => {
                                tracing::warn!("AIS stream server closed the connection");
                                break;
                            }
                            Ok(Message::Pong(_)) => { /* ignore */ }
                            Err(e) => {
                                tracing::error!("Error reading AIS stream: {}", e);
                                break;
                            }
                            _ => {}
                        }
                    }

                    flush_handle.abort();
                    ping_handle.abort();
                }
                Err(e) => {
                    tracing::error!("Failed to connect to AIS stream: {}", e);
                }
            }
            
            tracing::info!("Reconnecting to AIS stream in 15 seconds...");
            tokio::time::sleep(std::time::Duration::from_secs(15)).await;
        }
    });
}

/// Parse AIS WebSocket message into Vessel structs
pub fn parse_ais_message(json: &str) -> Result<Vec<Vessel>> {
    #[derive(Deserialize)]
    struct AisStreamMessage {
        #[serde(rename = "MessageType")]
        message_type: Option<String>,
        #[serde(rename = "MetaData")]
        metadata: Option<AisMetadata>,
        #[serde(rename = "Message")]
        message: Option<serde_json::Value>,
    }

    #[derive(Deserialize)]
    struct AisMetadata {
        #[serde(rename = "MMSI")]
        mmsi: Option<i64>,
        #[serde(rename = "ShipName")]
        ship_name: Option<String>,
        latitude: Option<f64>,
        longitude: Option<f64>,
    }

    let msg: AisStreamMessage = serde_json::from_str(json)?;
    let meta = match msg.metadata {
        Some(m) => m,
        None => return Ok(vec![]),
    };

    let mmsi = meta.mmsi.unwrap_or(0).to_string();
    let name = meta.ship_name.map(|s| s.trim().to_string()).unwrap_or_else(|| "Unknown".to_string());
    
    let mut ship_type = "other".to_string();
    let mut speed = 0.0;
    let mut heading = 0.0;
    let mut destination = None;

    if let Some(inner) = msg.message {
        // --- Handle Position Reports ---
        if let Some(pos) = inner.get("PositionReport") {
            speed = pos.get("Sog").and_then(|v| v.as_f64()).unwrap_or(0.0);
            heading = pos.get("TrueHeading").and_then(|v| v.as_f64()).unwrap_or(0.0);
        }
        
        // --- Handle Static Data (Ship specific info) ---
        if let Some(stat) = inner.get("ShipStaticData") {
            let type_id = stat.get("Type").and_then(|v| v.as_i64()).map(|i| i as i32);
            ship_type = ais_ship_type(type_id);
            
            destination = stat.get("Destination")
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string());
        }
    }

    let lat = meta.latitude.unwrap_or(0.0);
    let lon = meta.longitude.unwrap_or(0.0);
    if lat == 0.0 && lon == 0.0 {
        return Ok(vec![]);
    }

    Ok(vec![Vessel {
        mmsi,
        name,
        ship_type,
        lat,
        lon,
        speed,
        heading,
        destination,
        flag: None,
    }])
}
