use super::types::{GtsmStreamMessage, Satellite};
use anyhow::Result;
use chrono::{DateTime, Datelike, Duration, Timelike, Utc};
use sgp4::{Constants, Elements};
use std::sync::OnceLock;
use tokio::sync::broadcast::Sender;
use tokio::sync::RwLock;

struct TleCache {
    last_fetch: DateTime<Utc>,
    elements: Vec<(String, Elements)>,
}

static TLE_CACHE: OnceLock<RwLock<TleCache>> = OnceLock::new();

pub async fn fetch_satellites(tx: &Sender<String>) -> Result<Vec<Satellite>> {
    let cache_lock = TLE_CACHE.get_or_init(|| {
        RwLock::new(TleCache {
            last_fetch: Utc::now() - Duration::hours(24), // force initial fetch
            elements: Vec::new(),
        })
    });

    let mut needs_fetch = false;
    {
        let cache = cache_lock.read().await;
        let minutes_since = (Utc::now() - cache.last_fetch).num_minutes();
        let hours_since = (Utc::now() - cache.last_fetch).num_hours();

        if cache.elements.is_empty() {
            if minutes_since > 5 {
                needs_fetch = true;
            }
        } else if hours_since >= 6 {
            needs_fetch = true;
        }
    }

    if needs_fetch {
        // Primary: CelesTrak stations group
        // If this continues to fail with "error sending request", we check for mirror fallbacks
        let url = "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle";
        let client = reqwest::Client::builder()
            .user_agent("Zen-OSINT/1.0 (Cyber-Terminal)")
            .timeout(std::time::Duration::from_secs(15)) // Reduced timeout to prevent long hangs
            .build()?;

        tracing::info!("Attempting TLE fetch from: {}", url);
        let response_res = match client.get(url).send().await {
            Ok(res) => res,
            Err(e) => {
                tracing::warn!("Primary TLE fetch failed: {}. Trying AMSAT fallback...", e);
                // Fallback to AMSAT if Celestrak is blocked or timing out
                let fallback_url = "https://www.amsat.org/tle/current/nasa.all";
                client.get(fallback_url).send().await?
            }
        };

        let status = response_res.status();
        if !status.is_success() {
            let err_body = response_res
                .text()
                .await
                .unwrap_or_else(|_| "No body".to_string());
            tracing::error!("Sat API Error [{}]: {}", status, err_body);
            // Record failed attempt to trigger backoff
            let mut cache = cache_lock.write().await;
            cache.last_fetch = Utc::now();
            return Err(anyhow::anyhow!("Satellite API error: {}", status));
        }

        let response = response_res.text().await?;
        if response.trim().is_empty() {
            let mut cache = cache_lock.write().await;
            cache.last_fetch = Utc::now();
            return Err(anyhow::anyhow!("Satellite API returned empty TLE data"));
        }

        let line_count = response.lines().count();
        tracing::info!(
            "TLE data received ({} bytes), parsing {} lines...",
            response.len(),
            line_count
        );
        let mut new_elements = Vec::with_capacity(9000);
        let lines: Vec<&str> = response.lines().collect();
        for i in (0..lines.len()).step_by(3) {
            if i + 2 >= lines.len() {
                break;
            }
            let name = lines[i].trim().to_string();
            let line1 = lines[i + 1];
            let line2 = lines[i + 2];
            if let Ok(els) =
                Elements::from_tle(Some(name.clone()), line1.as_bytes(), line2.as_bytes())
            {
                new_elements.push((name, els));
            }
        }
        tracing::info!("Parsed {} satellites from TLE data", new_elements.len());

        let mut cache = cache_lock.write().await;
        cache.elements = new_elements;
        cache.last_fetch = Utc::now();
    }

    let cache = cache_lock.read().await;
    let mut all_results = Vec::with_capacity(cache.elements.len());
    let mut batch = Vec::with_capacity(250); // Increased batch size for efficiency
    let mut sent_count = 0;

    for (name, elements) in &cache.elements {
        if let Ok(constants) = Constants::from_elements(&elements) {
            let now = Utc::now();
            let t_since =
                (now.timestamp() as f64 - elements.datetime.and_utc().timestamp() as f64) / 60.0;

            if let Ok(prediction) = constants.propagate(t_since) {
                let (lat, lon, alt) = eci_to_lla(prediction.position, now);

                let sat = Satellite {
                    id: elements.norad_id.to_string(),
                    name: name.clone(),
                    lat,
                    lon,
                    alt: alt * 1000.0,
                    velocity: prediction
                        .velocity
                        .iter()
                        .map(|&x| x * x)
                        .sum::<f64>()
                        .sqrt(),
                };

                batch.push(sat.clone());
                all_results.push(sat);
                sent_count += 1;

                if batch.len() >= 250 {
                    if let Ok(json) =
                        serde_json::to_string(&GtsmStreamMessage::SatelliteBatch(batch.clone()))
                    {
                        let _ = tx.send(json);
                    }
                    batch.clear();

                    tokio::task::yield_now().await;
                }
            }
        }
    }

    // Flush remaining
    if !batch.is_empty() {
        if let Ok(json) = serde_json::to_string(&GtsmStreamMessage::SatelliteBatch(batch)) {
            let _ = tx.send(json);
        }
    }

    tracing::info!(
        "Satellite broadcast complete. Sent {} satellites",
        sent_count
    );
    Ok(all_results)
}

fn eci_to_lla(position: [f64; 3], time: DateTime<Utc>) -> (f64, f64, f64) {
    let x = position[0];
    let y = position[1];
    let z = position[2];

    let jd = julian_date(time);
    let t = (jd - 2451545.0) / 36525.0;
    let mut gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * t * t
        - t * t * t / 38710000.0;
    gmst %= 360.0;
    if gmst < 0.0 {
        gmst += 360.0;
    }

    let lon_rad = f64::atan2(y, x) - gmst.to_radians();
    let mut lon_deg = lon_rad.to_degrees() % 360.0;
    if lon_deg > 180.0 {
        lon_deg -= 360.0;
    }
    if lon_deg < -180.0 {
        lon_deg += 360.0;
    }

    let r = (x * x + y * y + z * z).sqrt();
    let lat_rad = f64::asin(z / r);
    let lat_deg = lat_rad.to_degrees();
    let alt = r - 6371.0;

    (lat_deg, lon_deg, alt)
}

fn julian_date(time: DateTime<Utc>) -> f64 {
    let year = time.year() as f64;
    let month = time.month() as f64;
    let day = time.day() as f64;
    let hour = time.hour() as f64;
    let min = time.minute() as f64;
    let sec = time.second() as f64;

    let (y, m) = if month <= 2.0 {
        (year - 1.0, month + 12.0)
    } else {
        (year, month)
    };

    let a = (y / 100.0).floor();
    let b = 2.0 - a + (a / 4.0).floor();

    let jd = (365.25 * (y + 4716.0)).floor() + (30.6001 * (m + 1.0)).floor() + day + b - 1524.5;
    jd + (hour + min / 60.0 + sec / 3600.0) / 24.0
}
