use anyhow::{bail, Context, Result};
use serde_json::Value;

const CABLES_URL: &str = "https://www.submarinecablemap.com/api/v3/cable/cable-geo.json";
const MAX_CABLE_DATA_BYTES: usize = 12 * 1024 * 1024;

/// Fetches the fixed public cable dataset. The URL is not renderer controlled.
pub async fn fetch_undersea_cables() -> Result<Value> {
    let response = crate::utils::public_no_redirect_http_client()
        .get(CABLES_URL)
        .send()
        .await
        .context("Unable to request the undersea cable dataset")?
        .error_for_status()
        .context("Undersea cable dataset returned an error status")?;

    let bytes = response
        .bytes()
        .await
        .context("Unable to read the undersea cable dataset")?;
    if bytes.len() > MAX_CABLE_DATA_BYTES {
        bail!("Undersea cable dataset exceeds the 12 MiB limit");
    }

    let data: Value = serde_json::from_slice(&bytes).context("Undersea cable dataset is not valid JSON")?;
    if data.get("type").and_then(Value::as_str) != Some("FeatureCollection") {
        bail!("Undersea cable dataset is not a GeoJSON FeatureCollection");
    }
    Ok(data)
}
