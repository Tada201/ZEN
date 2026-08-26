use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use zen_core::error::{AppResult, ZenError};
use crate::services::{
    AuditEvent, PermissionDecision, PrivilegedOperation, SecretService, SettingsService,
};

const CAMERA_CATALOG_URL_KEY: &str = "maps.camera_catalog_url";
const CAMERA_CATALOG_TOKEN_KEY: &str = "maps_camera_catalog_token";
const MAX_CATALOG_BYTES: usize = 512 * 1024;
const MAX_LOCAL_CATALOG_BYTES: usize = 5 * 1024 * 1024;
const MAX_CAMERA_ENTRIES: usize = 250;
const LOCAL_CATALOG_FILE: &str = "map-camera-catalog.json";

fn validate_https_public_url(value: &str) -> AppResult<String> {
    let validated = crate::tools::url_safety::validate_public_http_url(value)
        .map_err(ZenError::Custom)?;
    if !validated.as_str().to_ascii_lowercase().starts_with("https://") {
        return Err(ZenError::Custom("Camera catalog sources must use HTTPS".to_string()));
    }
    Ok(validated.to_string())
}

/// A catalog entry is only accepted from a configured backend-owned source.
/// `stream_url` is intentionally omitted from catalog responses and is resolved
/// only when the user explicitly starts a preview.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraCatalogEntry {
    pub id: String,
    pub label: String,
    pub operator: String,
    pub latitude: f64,
    pub longitude: f64,
    pub source_url: String,
    #[serde(skip_serializing, default)]
    pub stream_url: Option<String>,
    pub stream_format: String,
    pub status: String,
    pub is_demo: bool,
    #[serde(default)]
    pub attribution: Option<String>,
    #[serde(default)]
    pub terms_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraCatalogSourceStatus {
    pub id: String,
    pub label: String,
    pub configured: bool,
    pub status: String,
    pub entry_count: usize,
    pub checked_at: u64,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraCatalogSnapshot {
    pub entries: Vec<CameraCatalogEntry>,
    pub sources: Vec<CameraCatalogSourceStatus>,
    pub fetched_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraPlaybackDescriptor {
    pub camera_id: String,
    pub label: String,
    pub stream_url: Option<String>,
    pub stream_format: String,
    pub source_url: String,
    pub direct_preview_supported: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalCameraCatalogImportReport {
    pub accepted: usize,
    pub rejected: usize,
    pub source_name: String,
}

impl CameraCatalogEntry {
    fn validate(self) -> AppResult<Self> {
        if self.id.trim().is_empty() || self.label.trim().is_empty() || self.operator.trim().is_empty() {
            return Err(ZenError::Custom("Camera catalog entries require id, label, and operator".to_string()));
        }
        if !(-90.0..=90.0).contains(&self.latitude) || !(-180.0..=180.0).contains(&self.longitude) {
            return Err(ZenError::Custom("Camera catalog entry coordinates are outside valid bounds".to_string()));
        }
        validate_https_public_url(&self.source_url)?;
        if let Some(stream_url) = &self.stream_url {
            validate_https_public_url(stream_url)?;
        }
        if let Some(terms_url) = &self.terms_url {
            validate_https_public_url(terms_url)?;
        }
        if !matches!(self.stream_format.as_str(), "hls" | "mp4" | "external") {
            return Err(ZenError::Custom("Camera stream format must be hls, mp4, or external".to_string()));
        }
        if !matches!(self.status.as_str(), "available" | "unavailable" | "maintenance") {
            return Err(ZenError::Custom("Camera status must be available, unavailable, or maintenance".to_string()));
        }
        Ok(self)
    }
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn built_in_camera_catalog() -> Vec<CameraCatalogEntry> {
    vec![CameraCatalogEntry {
        id: "hls-playback-diagnostic".to_string(),
        label: "HLS playback diagnostic".to_string(),
        operator: "Mux test streams".to_string(),
        latitude: 0.0,
        longitude: 0.0,
        source_url: "https://test-streams.mux.dev/".to_string(),
        stream_url: Some("https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8".to_string()),
        stream_format: "hls".to_string(),
        status: "available".to_string(),
        is_demo: true,
        attribution: Some("Mux test streams".to_string()),
        terms_url: None,
    }]
}

fn local_catalog_path(app_data_dir: &Path) -> std::path::PathBuf {
    app_data_dir.join(LOCAL_CATALOG_FILE)
}

fn validate_entries(entries: Vec<CameraCatalogEntry>) -> AppResult<Vec<CameraCatalogEntry>> {
    let entries = entries
        .into_iter()
        .take(MAX_CAMERA_ENTRIES)
        .map(CameraCatalogEntry::validate)
        .collect::<AppResult<Vec<_>>>()?;
    let mut ids = std::collections::HashSet::with_capacity(entries.len());
    for entry in &entries {
        if !ids.insert(entry.id.as_str()) {
            return Err(ZenError::Custom(format!("Camera catalog contains duplicate id '{}'", entry.id)));
        }
    }
    Ok(entries)
}

fn value_as_string(value: &serde_json::Value, key: &str) -> Option<String> {
    value.get(key).and_then(serde_json::Value::as_str).map(str::to_owned)
}

fn legacy_feature_entry(feature: &serde_json::Value, index: usize) -> Result<CameraCatalogEntry, String> {
    let coordinates = feature
        .get("geometry")
        .and_then(|geometry| geometry.get("coordinates"))
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "missing Point coordinates".to_string())?;
    let longitude = coordinates.first().and_then(serde_json::Value::as_f64).ok_or_else(|| "invalid longitude".to_string())?;
    let latitude = coordinates.get(1).and_then(serde_json::Value::as_f64).ok_or_else(|| "invalid latitude".to_string())?;
    let empty_properties = serde_json::Value::Null;
    let properties = feature.get("properties").unwrap_or(&empty_properties);
    let stream_url = value_as_string(properties, "stream")
        .or_else(|| value_as_string(properties, "stream_url"))
        .ok_or_else(|| "missing stream URL".to_string())?;
    let label = value_as_string(properties, "label")
        .or_else(|| value_as_string(properties, "name"))
        .or_else(|| value_as_string(properties, "city"))
        .unwrap_or_else(|| format!("Imported camera {}", index + 1));
    let operator = value_as_string(properties, "operator")
        .or_else(|| value_as_string(properties, "source"))
        .unwrap_or_else(|| "Imported local catalog".to_string());
    let stream_format = if stream_url.to_ascii_lowercase().contains(".m3u8") { "hls" } else { "external" };
    Ok(CameraCatalogEntry {
        id: format!("local-camera-{}", index + 1), label, operator, latitude, longitude,
        source_url: stream_url.clone(), stream_url: Some(stream_url), stream_format: stream_format.to_string(),
        status: "available".to_string(), is_demo: false, attribution: value_as_string(properties, "attribution"),
        terms_url: value_as_string(properties, "terms_url"),
    })
}

fn parse_local_catalog(bytes: &[u8]) -> AppResult<(Vec<CameraCatalogEntry>, usize)> {
    if bytes.len() > MAX_LOCAL_CATALOG_BYTES {
        return Err(ZenError::Custom("Local camera catalogs are limited to 5 MB".to_string()));
    }
    let root: serde_json::Value = serde_json::from_slice(bytes)
        .map_err(|error| ZenError::Custom(format!("Camera catalog JSON is invalid: {error}")))?;
    if let Some(entries) = root.as_array() {
        let parsed = serde_json::from_value(serde_json::Value::Array(entries.clone()))
            .map_err(|error| ZenError::Custom(format!("Camera catalog entries are invalid: {error}")))?;
        return Ok((validate_entries(parsed)?, 0));
    }
    let features = root.get("features").and_then(serde_json::Value::as_array)
        .ok_or_else(|| ZenError::Custom("Camera catalog must be a Zen entry array or a GeoJSON FeatureCollection".to_string()))?;
    let mut accepted = Vec::new();
    let mut rejected = 0;
    for (index, feature) in features.iter().enumerate() {
        match legacy_feature_entry(feature, index).and_then(|entry| entry.validate().map_err(|error| error.to_string())) {
            Ok(entry) if accepted.len() < MAX_CAMERA_ENTRIES => accepted.push(entry),
            _ => rejected += 1,
        }
    }
    if accepted.is_empty() {
        return Err(ZenError::Custom(format!("No compatible HTTPS camera sources were found; {rejected} entries were rejected. Legacy HTTP/IP camera feeds cannot be imported.")));
    }
    Ok((validate_entries(accepted)?, rejected))
}

pub async fn import_local_camera_catalog(app_data_dir: &Path, source_name: String, bytes: Vec<u8>, security: &crate::services::SecurityService) -> AppResult<LocalCameraCatalogImportReport> {
    let result = (|| {
        let (entries, rejected) = parse_local_catalog(&bytes)?;
        std::fs::create_dir_all(app_data_dir).map_err(|error| ZenError::Internal(format!("Could not prepare local catalog storage: {error}")))?;
        let destination = local_catalog_path(app_data_dir);
        let temporary = destination.with_extension("part");
        std::fs::write(&temporary, serde_json::to_vec(&entries).map_err(|error| ZenError::Internal(format!("Could not encode local camera catalog: {error}")))?)
            .map_err(|error| ZenError::Internal(format!("Could not save local camera catalog: {error}")))?;
        if destination.exists() { std::fs::remove_file(&destination).map_err(|error| ZenError::Internal(format!("Could not replace local camera catalog: {error}")))?; }
        std::fs::rename(&temporary, destination).map_err(|error| ZenError::Internal(format!("Could not finalize local camera catalog: {error}")))?;
        Ok(LocalCameraCatalogImportReport { accepted: entries.len(), rejected, source_name })
    })();
    security.record_audit(AuditEvent { operation: PrivilegedOperation::FileWrite, decision: if result.is_ok() { PermissionDecision::Allow } else { PermissionDecision::Deny }, caller: "map_camera_catalog".to_string(), target: Some(LOCAL_CATALOG_FILE.to_string()), reason: Some("user imported a local camera catalog".to_string()) }).await;
    result
}

fn load_local_catalog(app_data_dir: &Path) -> AppResult<Option<Vec<CameraCatalogEntry>>> {
    let path = local_catalog_path(app_data_dir);
    if !path.exists() { return Ok(None); }
    let bytes = std::fs::read(&path).map_err(|error| ZenError::Internal(format!("Could not read local camera catalog: {error}")))?;
    if bytes.len() > MAX_LOCAL_CATALOG_BYTES { return Err(ZenError::Custom("Saved local camera catalog exceeds the 5 MB limit".to_string())); }
    let entries = serde_json::from_slice(&bytes).map_err(|error| ZenError::Custom(format!("Saved local camera catalog is invalid: {error}")))?;
    Ok(Some(validate_entries(entries)?))
}

async fn fetch_configured_catalog(
    settings: &SettingsService,
    secrets: &SecretService,
    security: &crate::services::SecurityService,
) -> AppResult<Option<Vec<CameraCatalogEntry>>> {
    let Some(catalog_url) = settings.get(CAMERA_CATALOG_URL_KEY).await? else {
        return Ok(None);
    };
    if catalog_url.trim().is_empty() {
        return Ok(None);
    }

    let validated_url = validate_https_public_url(&catalog_url)?;
    let token = secrets.get_secret(CAMERA_CATALOG_TOKEN_KEY).await?;
    let mut request = crate::utils::public_no_redirect_http_client().get(validated_url);
    if let Some(token) = token.filter(|value| !value.is_empty()) {
        request = request.bearer_auth(token);
    }

    let result = async {
        let mut response = request
            .send()
            .await
            .map_err(|error| ZenError::Internal(format!("Camera catalog request failed: {error}")))?;
        if !response.status().is_success() {
            return Err(ZenError::Custom(format!("Camera catalog returned HTTP {}", response.status())));
        }
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();
        if !content_type.contains("application/json") && !content_type.ends_with("+json") {
            return Err(ZenError::Custom("Camera catalog must return JSON content".to_string()));
        }
        if response.content_length().is_some_and(|size| size > MAX_CATALOG_BYTES as u64) {
            return Err(ZenError::Custom("Camera catalog exceeds the 512 KB limit".to_string()));
        }

        let mut body = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| ZenError::Internal(format!("Camera catalog body failed: {error}")))?
        {
            if body.len() + chunk.len() > MAX_CATALOG_BYTES {
                return Err(ZenError::Custom("Camera catalog exceeds the 512 KB limit".to_string()));
            }
            body.extend_from_slice(&chunk);
        }

        let configured: Vec<CameraCatalogEntry> = serde_json::from_slice(&body)
            .map_err(|error| ZenError::Custom(format!("Camera catalog JSON is invalid: {error}")))?;
        validate_entries(configured)
    }
    .await;

    security
        .record_audit(AuditEvent {
            operation: PrivilegedOperation::NetworkFetch,
            decision: if result.is_ok() { PermissionDecision::Allow } else { PermissionDecision::Deny },
            caller: "map_camera_catalog".to_string(),
            target: Some(CAMERA_CATALOG_URL_KEY.to_string()),
            reason: Some("user-configured camera catalog refresh".to_string()),
        })
        .await;

    result.map(Some)
}

/// Returns the built-in diagnostic and the configured source independently so a
/// configuration failure remains visible without taking the map layer down.
pub async fn get_camera_catalog_snapshot(
    app_data_dir: &Path,
    settings: &SettingsService,
    secrets: &SecretService,
    security: &crate::services::SecurityService,
) -> AppResult<CameraCatalogSnapshot> {
    let checked_at = now_millis();
    let mut entries = built_in_camera_catalog();
    let mut sources = vec![CameraCatalogSourceStatus {
        id: "mux-diagnostic".to_string(),
        label: "Mux playback diagnostic".to_string(),
        configured: true,
        status: "available".to_string(),
        entry_count: entries.len(),
        checked_at,
        detail: Some("Development diagnostic only. It is not a public camera feed.".to_string()),
    }];

    match load_local_catalog(app_data_dir) {
        Ok(Some(local)) => {
            let count = local.len();
            entries.extend(local);
            sources.push(CameraCatalogSourceStatus { id: "local-catalog".to_string(), label: "Local camera catalog".to_string(), configured: true, status: "available".to_string(), entry_count: count, checked_at, detail: Some("Imported and validated locally. Only HTTPS sources are retained.".to_string()) });
        }
        Ok(None) => sources.push(CameraCatalogSourceStatus { id: "local-catalog".to_string(), label: "Local camera catalog".to_string(), configured: false, status: "not_configured".to_string(), entry_count: 0, checked_at, detail: Some("Import a camera JSON or GeoJSON file from Map settings to enable this source.".to_string()) }),
        Err(error) => sources.push(CameraCatalogSourceStatus { id: "local-catalog".to_string(), label: "Local camera catalog".to_string(), configured: true, status: "unavailable".to_string(), entry_count: 0, checked_at, detail: Some(error.to_string()) }),
    }

    match fetch_configured_catalog(settings, secrets, security).await {
        Ok(Some(configured)) => {
            let count = configured.len();
            entries.extend(configured);
            sources.push(CameraCatalogSourceStatus {
                id: "configured-catalog".to_string(),
                label: "Configured camera catalog".to_string(),
                configured: true,
                status: "available".to_string(),
                entry_count: count,
                checked_at,
                detail: None,
            });
        }
        Ok(None) => sources.push(CameraCatalogSourceStatus {
            id: "configured-catalog".to_string(),
            label: "Configured camera catalog".to_string(),
            configured: false,
            status: "not_configured".to_string(),
            entry_count: 0,
            checked_at,
            detail: Some("Add a vetted catalog URL in Settings > Maps to enable this source.".to_string()),
        }),
        Err(error) => sources.push(CameraCatalogSourceStatus {
            id: "configured-catalog".to_string(),
            label: "Configured camera catalog".to_string(),
            configured: true,
            status: "unavailable".to_string(),
            entry_count: 0,
            checked_at,
            detail: Some(error.to_string()),
        }),
    }

    Ok(CameraCatalogSnapshot { entries, sources, fetched_at: checked_at })
}

pub async fn list_camera_catalog(
    app_data_dir: &Path,
    settings: &SettingsService,
    secrets: &SecretService,
    security: &crate::services::SecurityService,
) -> AppResult<Vec<CameraCatalogEntry>> {
    Ok(get_camera_catalog_snapshot(app_data_dir, settings, secrets, security).await?.entries)
}

/// Resolves a preview only after a user selects a catalog entry. It prevents the
/// renderer from inventing or modifying a stream endpoint.
pub async fn resolve_camera_playback(
    camera_id: &str,
    app_data_dir: &Path,
    settings: &SettingsService,
    secrets: &SecretService,
    security: &crate::services::SecurityService,
) -> AppResult<CameraPlaybackDescriptor> {
    let snapshot = get_camera_catalog_snapshot(app_data_dir, settings, secrets, security).await?;
    let camera = snapshot
        .entries
        .into_iter()
        .find(|entry| entry.id == camera_id)
        .ok_or_else(|| ZenError::Custom("Camera source is no longer available in the catalog".to_string()))?;

    security
        .record_audit(AuditEvent {
            operation: PrivilegedOperation::NetworkFetch,
            decision: PermissionDecision::Allow,
            caller: "map_camera_preview".to_string(),
            target: Some(camera.id.clone()),
            reason: Some("user started a catalog-owned camera preview".to_string()),
        })
        .await;

    Ok(CameraPlaybackDescriptor {
        camera_id: camera.id,
        label: camera.label,
        stream_url: camera.stream_url,
        stream_format: camera.stream_format.clone(),
        source_url: camera.source_url,
        direct_preview_supported: matches!(camera.stream_format.as_str(), "hls" | "mp4"),
    })
}

pub async fn test_camera_catalog(
    app_data_dir: &Path,
    settings: &SettingsService,
    secrets: &SecretService,
    security: &crate::services::SecurityService,
) -> AppResult<usize> {
    let snapshot = get_camera_catalog_snapshot(app_data_dir, settings, secrets, security).await?;
    let configured = snapshot
        .sources
        .iter()
        .find(|source| source.id == "configured-catalog");
    if let Some(source) = configured.filter(|source| source.configured && source.status == "unavailable") {
        return Err(ZenError::Custom(
            source.detail.clone().unwrap_or_else(|| "Camera catalog is unavailable".to_string()),
        ));
    }
    Ok(snapshot.entries.len())
}
