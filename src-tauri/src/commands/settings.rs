use crate::commands::AppState;
use zen_db::models::{ModelInfo, ProviderConfig};
use zen_core::error::{AppResult, ZenResult};
use crate::services::{is_secret_key, data_cleanup};
use crate::tools::ToolManager;
use zen_tools::manager::ToolMetadata;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use tauri::{Manager, State};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCatalogEntry {
    pub id: String,
    pub display_name: String,
    pub description: String,
    pub category: String,
    pub requires_key: bool,
    pub api_key_key: Option<String>,
    pub base_url_key: String,
    pub default_base_url: String,
    pub base_url: String,
    pub is_local: bool,
    pub configured: bool,
    pub api_key_present: bool,
    pub enabled: bool,
}

/// Keep the global model getter deterministic. Providers and gateways can
/// expose the same model more than once, but identity is scoped to the
/// provider rather than the display name alone.
fn normalize_model_catalog(mut models: Vec<ModelInfo>) -> Vec<ModelInfo> {
    let mut seen = HashSet::new();
    models.retain(|model| {
        let provider = model.provider.as_deref().unwrap_or("unknown");
        seen.insert(format!("{provider}\u{0}{}", model.id))
    });
    models.sort_by(|left, right| {
        left.provider
            .as_deref()
            .unwrap_or("unknown")
            .cmp(right.provider.as_deref().unwrap_or("unknown"))
            .then_with(|| left.name.cmp(&right.name))
            .then_with(|| left.id.cmp(&right.id))
    });
    models
}

fn custom_models_from_settings(
    settings: &HashMap<String, String>,
    provider_id: &str,
) -> Vec<ModelInfo> {
    let Some(raw_custom) = settings.get("custom_providers") else {
        return Vec::new();
    };
    let Ok(custom_providers) = serde_json::from_str::<Vec<serde_json::Value>>(raw_custom) else {
        return Vec::new();
    };
    let Some(provider) = custom_providers
        .into_iter()
        .find(|provider| provider.get("id").and_then(|value| value.as_str()) == Some(provider_id))
    else {
        return Vec::new();
    };
    let Some(raw_models) = provider.get("customModels") else {
        return Vec::new();
    };
    let Ok(mut models) = serde_json::from_value::<Vec<ModelInfo>>(raw_models.clone()) else {
        return Vec::new();
    };
    for model in &mut models {
        if model.provider.is_none() {
            model.provider = Some(provider_id.to_string());
        }
        if model.name.trim().is_empty() {
            model.name = model.id.clone();
        }
    }
    models
}

/// Return the backend's provider catalog and current non-secret connection
/// state. This is the runtime source for discovery; raw credentials never
/// cross the IPC boundary.
#[tauri::command]
pub async fn get_provider_catalog(state: State<'_, AppState>) -> ZenResult<Vec<ProviderCatalogEntry>> {
    let settings = state.settings_manager.get_all().await?;
    let mut entries = Vec::new();

    for provider_id in zen_llm::provider_meta::catalog_names() {
        let Some(meta) = zen_llm::provider_meta::PROVIDER_CATALOG
            .iter()
            .find(|provider| provider.name == provider_id)
        else {
            continue;
        };
        let api_key_key = meta
            .api_key_key
            .map(str::to_string)
            .unwrap_or_else(|| format!("{provider_id}_api_key"));
        let api_key_present = state
            .secret_manager
            .has_secret(&api_key_key)
            .await
            .unwrap_or(false);
        let base_url = settings
            .get(&format!("{provider_id}_base_url"))
            .filter(|value| !value.is_empty())
            .cloned()
            .unwrap_or_else(|| meta.default_base_url.to_string());
        let is_local = base_url.starts_with("http://localhost")
            || base_url.starts_with("http://127.0.0.1")
            || matches!(provider_id, "ollama" | "lmstudio" | "nine_router" | "vx");
        let configured = api_key_present
            || settings.contains_key(&format!("{provider_id}_base_url"))
            || meta.api_key_key.is_none();

        entries.push(ProviderCatalogEntry {
            id: provider_id.to_string(),
            display_name: meta.display_name.to_string(),
            description: meta.description.to_string(),
            category: meta.category.to_string(),
            requires_key: meta.api_key_key.is_some(),
            api_key_key: meta.api_key_key.map(str::to_string),
            base_url_key: format!("{provider_id}_base_url"),
            default_base_url: meta.default_base_url.to_string(),
            base_url,
            is_local,
            configured,
            api_key_present,
            enabled: true,
        });
    }

    // Custom provider definitions are public metadata; their API keys are
    // stored separately under <provider-id>_api_key in the OS keyring.
    if let Some(raw_custom) = settings.get("custom_providers") {
        if let Ok(custom_providers) = serde_json::from_str::<Vec<serde_json::Value>>(raw_custom) {
            for provider in custom_providers {
                let Some(id) = provider.get("id").and_then(|value| value.as_str()) else {
                    continue;
                };
                let base_url = provider
                    .get("baseUrl")
                    .and_then(|value| value.as_str())
                    .unwrap_or_default()
                    .to_string();
                let api_key_present = state
                    .secret_manager
                    .has_secret(&format!("{id}_api_key"))
                    .await
                    .unwrap_or(false);
                entries.push(ProviderCatalogEntry {
                    id: id.to_string(),
                    display_name: provider
                        .get("displayName")
                        .and_then(|value| value.as_str())
                        .unwrap_or(id)
                        .to_string(),
                    description: "OpenAI-compatible custom connection.".to_string(),
                    category: "custom".to_string(),
                    requires_key: provider
                        .get("requiresKey")
                        .and_then(|value| value.as_bool())
                        .unwrap_or(false),
                    api_key_key: Some(format!("{id}_api_key")),
                    base_url_key: format!("{id}_base_url"),
                    default_base_url: base_url.clone(),
                    base_url,
                    is_local: false,
                    configured: api_key_present
                        || provider
                            .get("baseUrl")
                            .and_then(|value| value.as_str())
                            .is_some_and(|value| !value.trim().is_empty()),
                    api_key_present,
                    enabled: provider
                        .get("enabled")
                        .and_then(|value| value.as_bool())
                        .unwrap_or(true),
                });
            }
        }
    }

    Ok(entries)
}

/// Get the canonical tool list with metadata for the Tools settings tab.
/// Reads from the live registry so stale manual lists cannot drift.
#[tauri::command]
pub async fn list_tool_metadata(state: State<'_, AppState>) -> ZenResult<Vec<ToolMetadata>> {
    Ok(state.tool_manager.list_metadata().await)
}

#[tauri::command]
pub async fn get_setting(state: State<'_, AppState>, key: String) -> AppResult<Option<String>> {
    state.settings_manager.get_public(&key).await
}

#[tauri::command]
pub async fn set_setting(state: State<'_, AppState>, key: String, value: String) -> AppResult<()> {
    if is_workspace_root_key(&key) {
        crate::workspace::canonicalize_workspace_root(std::path::Path::new(&value)).map_err(
            |e| zen_core::error::ZenError::Custom(format!("Invalid workspace root: {e}")),
        )?;
    }

    if is_secret_key(&key) {
        state
            .secret_manager
            .set_secret(key.clone(), value.clone())
            .await?;
    } else {
        state
            .settings_manager
            .set(key.clone(), value.clone())
            .await?;
    }

    if is_workspace_root_key(&key) {
        state.set_workspace_folder(value).await?;
    }

    invalidate_provider_cache_if_needed(&state, std::iter::once(key.as_str())).await;
    maybe_sync_tool_permissions(&state, std::iter::once(key.as_str())).await;

    Ok(())
}

async fn custom_provider_ids(state: &AppState) -> Vec<String> {
    let Ok(Some(raw)) = state.settings_manager.get("custom_providers").await else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return Vec::new();
    };

    if let Some(providers) = value.as_array() {
        return providers
            .iter()
            .filter_map(|provider| provider.get("id").and_then(|id| id.as_str()))
            .map(ToOwned::to_owned)
            .collect();
    }

    // Accept the legacy object shape so reset remains safe for older installs.
    value
        .as_object()
        .map(|providers| providers.keys().cloned().collect())
        .unwrap_or_default()
}

#[tauri::command]
pub async fn get_data_cleanup_status(app: tauri::AppHandle) -> AppResult<data_cleanup::ZenDataStatus> {
    let app_data_dir = app.path()
        .app_data_dir()
        .map_err(|error| zen_core::error::ZenError::Custom(format!("Could not resolve app data directory: {error}")))?;
    Ok(data_cleanup::inspect(&app_data_dir))
}

#[tauri::command]
pub async fn reset_settings_and_secrets(state: State<'_, AppState>) -> AppResult<data_cleanup::ZenCleanupResult> {
    let custom_provider_ids = custom_provider_ids(&state).await;
    data_cleanup::reset_settings_and_secrets(
        &state.settings_manager,
        state.secret_manager.clone(),
        &custom_provider_ids,
    )
    .await
}

#[tauri::command]
pub async fn reset_all_zen_data(app: tauri::AppHandle, state: State<'_, AppState>, confirmation: String) -> AppResult<data_cleanup::ZenCleanupResult> {
    if confirmation != "DELETE ALL ZEN DATA" {
        return Err(zen_core::error::ZenError::Custom("Explicit confirmation is required".to_string()));
    }
    let app_data_dir = app.path()
        .app_data_dir()
        .map_err(|error| zen_core::error::ZenError::Custom(format!("Could not resolve app data directory: {error}")))?;
    let custom_provider_ids = custom_provider_ids(&state).await;
    data_cleanup::request_full_reset(
        &app_data_dir,
        state.secret_manager.clone(),
        &custom_provider_ids,
    )
    .await
}

/// Remove a provider credential from the OS keyring and clear its redacted
/// presence marker. This is intentionally separate from normal settings writes
/// so the frontend can expose an explicit, auditable credential action.
#[tauri::command]
pub async fn delete_secret(state: State<'_, AppState>, key: String) -> AppResult<()> {
    if !is_secret_key(&key) {
        return Err(zen_core::error::ZenError::Custom(
            "Only credential keys can be removed through this command".to_string(),
        ));
    }

    state.secret_manager.delete_secret(&key).await?;
    invalidate_provider_cache_if_needed(&state, std::iter::once(key.as_str())).await;
    Ok(())
}

#[tauri::command]
pub async fn set_settings(
    state: State<'_, AppState>,
    settings: HashMap<String, String>,
) -> AppResult<()> {
    let should_invalidate_provider_cache = settings.keys().any(|key| is_provider_setting_key(key));
    // Snapshot owned keys so we can iterate them after `settings` is moved
    // into the secret/public partition below.
    let changed_keys: Vec<String> = settings.keys().cloned().collect();
    let workspace_root = settings
        .get("workspace.root")
        .or_else(|| settings.get("workspace_path"))
        .cloned();
    if let Some(workspace_root) = workspace_root.as_deref() {
        crate::workspace::canonicalize_workspace_root(std::path::Path::new(workspace_root))
            .map_err(|e| {
                zen_core::error::ZenError::Custom(format!("Invalid workspace root: {e}"))
            })?;
    }
    let (secret_settings, public_settings): (HashMap<_, _>, HashMap<_, _>) = settings
        .into_iter()
        .partition(|(key, _)| is_secret_key(key));

    state.settings_manager.set_many(public_settings).await?;
    state.secret_manager.set_secrets(secret_settings).await?;

    if let Some(workspace_root) = workspace_root {
        state.set_workspace_folder(workspace_root).await?;
    }

    if should_invalidate_provider_cache {
        clear_provider_cache(&state).await;
    }

    maybe_sync_tool_permissions(&state, changed_keys.iter().map(String::as_str)).await;

    Ok(())
}

#[tauri::command]
pub async fn get_all_settings(state: State<'_, AppState>) -> AppResult<HashMap<String, String>> {
    state.settings_manager.get_all_public().await
}

/// Discover available models from a provider by calling its live API.
///
/// - **Ollama**: GET /api/tags
/// - **LM Studio**: GET /v1/models (with fallbacks)
/// - **OpenAI-compatible**: GET /v1/models with Bearer auth
/// - **Anthropic**: GET /v1/models with x-api-key header
#[tauri::command]
pub async fn discover_models(
    _state: State<'_, AppState>,
    provider: String,
    base_url: Option<String>,
    api_key: Option<String>,
) -> ZenResult<Vec<ModelInfo>> {
    let p_type = provider.to_lowercase();
    let target_base_url = base_url.unwrap_or_else(|| zen_llm::default_base_url(&p_type));
    let target_api_key = api_key.unwrap_or_default();

    // Prevent transmitting bearer credentials over plain HTTP
    crate::utils::validate_remote_auth_safety(&target_base_url, !target_api_key.is_empty())
        .map_err(|e| zen_core::error::ZenError::Custom(e.to_string()))?;

    let config = ProviderConfig {
        provider_type: p_type.clone(),
        base_url: target_base_url,
        api_key: target_api_key,
        display_name: provider.clone(),
        headers: None,
        api_format: None,
    };

    let provider_instance = zen_llm::make_provider(&config);
    provider_instance.list_models().await
}

/// Fetches all available models for a specific provider or all configured providers.
#[tauri::command]
pub async fn get_all_available_models(
    state: State<'_, AppState>,
    provider: Option<String>,
) -> ZenResult<Vec<ModelInfo>> {
    let db = state.db.get().await?;

    if let Some(p_name) = provider {
        // Fetch from specific provider
        let provider_instance = state.provider_by_name(&p_name, &db).await?;
        let settings = state.settings_manager.get_all().await?;
        let manual_models = custom_models_from_settings(&settings, &p_name);
        match provider_instance.list_models().await {
            Ok(mut models) => {
                models.extend(manual_models);
                Ok(normalize_model_catalog(models))
            }
            Err(error) if !manual_models.is_empty() => {
                eprintln!("Using saved manual models for {p_name} after discovery failed: {error}");
                Ok(normalize_model_catalog(manual_models))
            }
            Err(error) => Err(error),
        }
    } else {
        // Enumerate the canonical backend catalog so model discovery cannot
        // silently drift from provider construction and settings metadata.
        let mut all_models = Vec::new();
        let all_settings = state.settings_manager.get_all().await?;
        for p_name in zen_llm::provider_meta::catalog_names() {
            // Settings keys use snake_case (frontend camelCase is mapped via
            // settingsMapper.ts → mapStateToSqlite before persist).
            let api_key_key = zen_llm::provider_meta::PROVIDER_CATALOG
                .iter()
                .find(|meta| meta.name == p_name)
                .and_then(|meta| meta.api_key_key)
                .map(str::to_string)
                .unwrap_or_else(|| format!("{p_name}_api_key"));
            let base_url_key = format!("{p_name}_base_url");

            let has_key = state
                .secret_manager
                .has_secret(&api_key_key)
                .await
                .unwrap_or(false);
            let has_url = all_settings
                .get(&base_url_key)
                .map(|v| !v.is_empty())
                .unwrap_or(false);
            let is_local_runtime = p_name == "ollama" || p_name == "lmstudio";
            let is_local_gateway = p_name == "nine_router";
            let is_no_key_builtin = zen_llm::provider_meta::PROVIDER_CATALOG
                .iter()
                .find(|meta| meta.name == p_name)
                .is_some_and(|meta| meta.api_key_key.is_none());
            let is_active = all_settings
                .get("active_provider")
                .map(|v| v == p_name)
                .unwrap_or(false);

            // Global catalog refreshes are used by the chat UI and can happen on
            // mount. Do not wake local servers unless the user selected that
            // local provider. Explicit provider refreshes still call the branch
            // above with provider=Some(...), so Settings/manual checks work.
            let should_fetch = if is_local_runtime {
                is_active
            } else if is_local_gateway {
                // 9Router is the configured local gateway, not an optional model
                // runtime. Probe it once during catalog hydration so its cached
                // models are available before the user selects the provider.
                true
            } else {
                is_no_key_builtin || is_active || has_key || has_url
            };
            if should_fetch {
                if let Ok(provider_instance) = state.provider_by_name(p_name, &db).await {
                    match provider_instance.list_models().await {
                        Ok(models) => all_models.extend(models),
                        Err(e) => {
                            eprintln!("Failed to fetch models from {p_name}: {e}");
                        }
                    }
                }
            }
        }

        // Custom providers use the same registry path as built-ins after
        // registration: their endpoint, headers, and credential are stored
        // under the provider id. Include enabled custom nodes in the global
        // catalog so the chat picker and provider settings share one source
        // of truth instead of relying only on the frontend's cached models.
        if let Some(raw_custom) = all_settings.get("custom_providers") {
            if let Ok(custom_providers) = serde_json::from_str::<Vec<serde_json::Value>>(raw_custom) {
                for custom_provider in custom_providers {
                    let Some(custom_id) = custom_provider.get("id").and_then(|value| value.as_str()) else {
                        continue;
                    };
                    let enabled = custom_provider
                        .get("enabled")
                        .and_then(|value| value.as_bool())
                        .unwrap_or(true);
                    if !enabled {
                        continue;
                    }
                    let manual_models = custom_models_from_settings(&all_settings, custom_id);
                    if let Ok(provider_instance) = state.provider_by_name(custom_id, &db).await {
                        match provider_instance.list_models().await {
                            Ok(mut models) => {
                                models.extend(manual_models);
                                all_models.extend(models);
                            }
                            Err(e) if !manual_models.is_empty() => {
                                eprintln!("Using saved manual models for {custom_id} after discovery failed: {e}");
                                all_models.extend(manual_models);
                            }
                            Err(e) => eprintln!("Failed to fetch models from custom provider {custom_id}: {e}"),
                        }
                    }
                }
            }
        }
        Ok(normalize_model_catalog(all_models))
    }
}

/// Returns local, completed-message usage for the supplied provider model ids.
/// Provider credit/quota APIs are intentionally separate from this reliable
/// local token history and can be added per provider without altering the UI contract.
#[tauri::command]
pub async fn get_provider_usage(
    state: State<'_, AppState>,
    model_ids: Vec<String>,
    period_days: Option<u16>,
) -> ZenResult<zen_db::queries::ProviderUsageSnapshot> {
    let db = state.db().await?;
    state
        .usage
        .provider_snapshot(&db, &model_ids, period_days)
        .await
}

/// Fetch available image generation models from a running 9Router instance.
/// Calls GET {base_url}/v1/models/image and returns a list of { id, name } pairs.
#[tauri::command]
pub async fn fetch_9router_image_models(
    state: State<'_, AppState>,
) -> ZenResult<Vec<ModelInfo>> {
    let base_url = state
        .settings_manager
        .get("nine_router_base_url")
        .await
        .unwrap_or_default()
        .unwrap_or_else(|| "http://localhost:20128/v1".to_string());

    let api_key = state
        .secret_manager
        .get_secret("nine_router_api_key")
        .await
        .unwrap_or_default()
        .unwrap_or_default();

    let base = base_url.trim_end_matches('/');
    let endpoint = if base.ends_with("/v1") {
        format!("{base}/models/image")
    } else {
        format!("{base}/v1/models/image")
    };

    // Validate security boundary: prevent leaking API key over remote plain HTTP
    crate::utils::validate_remote_auth_safety(&endpoint, !api_key.is_empty())
        .map_err(|e| zen_core::error::ZenError::Custom(e.to_string()))?;

    let client = crate::utils::default_http_client();
    let mut request = client.get(&endpoint);
    if !api_key.is_empty() {
        request = request.bearer_auth(&api_key);
    }

    let response = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        request.send(),
    )
    .await
    .map_err(|_| {
        zen_core::error::ZenError::Custom("9Router image models request timed out".to_string())
    })?
    .map_err(|e| {
        zen_core::error::ZenError::Custom(format!("Failed to connect to 9Router: {e}"))
    })?;

    if !response.status().is_success() {
        return Err(zen_core::error::ZenError::Custom(format!(
            "9Router returned status {} for image models",
            response.status()
        )));
    }

    let body: serde_json::Value = response.json().await.map_err(|e| {
        zen_core::error::ZenError::Custom(format!("Failed to parse 9Router response: {e}"))
    })?;

    let data_arr = body.get("data").and_then(|d| d.as_array()).ok_or_else(|| {
        zen_core::error::ZenError::Custom("No data field in 9Router models response".to_string())
    })?;

    let models: Vec<ModelInfo> = data_arr
        .iter()
        .filter_map(|item| {
            let id = item.get("id")?.as_str()?.to_string();
            let name = item
                .get("name")
                .and_then(|n| n.as_str())
                .unwrap_or(&id)
                .to_string();
            Some(ModelInfo {
                id,
                name,
                ..Default::default()
            })
        })
        .collect();

    Ok(models)
}

/// Synchronize tool permissions from flat key-value settings into the ToolManager
/// and the v2 ToolRegistry. Should be called after any `tools.*` setting is changed.
#[tauri::command]
pub async fn sync_tool_permissions(state: State<'_, AppState>) -> AppResult<()> {
    let all_settings = state.settings_manager.get_all().await?;
    let workspace_root = state.workspace_folder.read().await.clone();
    let permissions = ToolManager::build_permissions(&all_settings, Some(workspace_root));
    state
        .tool_manager
        .update_permissions(permissions)
        .await
        .map_err(zen_core::error::ZenError::Internal)?;
    Ok(())
}

/// Returns true if `key` participates in the ToolManager permission policy.
/// The backend auto-syncs after these keys change so the frontend never has
/// to issue a separate sync command.
///
/// NOTE: The frontend formats `toolPermissionMode` under two equivalent
/// string keys — `tool_permission_mode` (the legacy flat form written by
/// the persistence mapper) and `tools.permission-mode` (the typed bridge
/// form written by `SettingsModal`). Both must trigger an auto-sync so
/// switching modes from either surface rebuilds `ToolPermissions` immediately.
fn is_tool_permission_key(key: &str) -> bool {
    matches!(
        key,
        "tool_settings"
            | "tool_global_default"
            | "tool_yolo_mode"
            | "tool_auto_approve_low_risk"
            | "tools.yolo-mode"
            | "tools.global-default"
            | "tools.auto-approve-low-risk"
            | "tools.permission-mode"
            | "tool_permission_mode"
    ) || key.starts_with("tools.permission.")
}

/// Rebuild and install the tool permission policy when at least one of the
/// supplied keys participates in it. Failures are logged, never raised —
/// the caller already persisted the setting, so the worst case is a stale
/// ToolManager until the next change.
async fn maybe_sync_tool_permissions<'a, I>(
    state: &State<'_, AppState>,
    keys: I,
) where
    I: IntoIterator<Item = &'a str>,
{
    let needs_sync = keys.into_iter().any(is_tool_permission_key);
    if !needs_sync {
        return;
    }
    let all_settings = match state.settings_manager.get_all().await {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!(error = %e, "Auto-sync of tool permissions: failed to read settings");
            return;
        }
    };
    let workspace_root = state.workspace_folder.read().await.clone();
    let permissions = ToolManager::build_permissions(&all_settings, Some(workspace_root));
    if let Err(e) = state.tool_manager.update_permissions(permissions).await {
        tracing::warn!(error = %e, "Auto-sync of tool permissions: install failed");
    }
}

/// Tests connection to a provider and returns discovered models on success.
#[tauri::command]
pub async fn test_provider_connection(
    _state: State<'_, AppState>,
    mut config: ProviderConfig,
) -> ZenResult<Vec<ModelInfo>> {
    let parsed = url::Url::parse(config.base_url.trim()).map_err(|error| {
        zen_core::error::ZenError::Custom(format!("Invalid provider endpoint: {error}"))
    })?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(zen_core::error::ZenError::Custom(
            "Provider endpoint must use HTTP or HTTPS".to_string(),
        ));
    }
    // Anthropic Messages endpoints live at `/v1/messages`; the OpenAI-style
    // `/chat/completions`+`/models` strip would corrupt them, so skip it.
    if config.api_format.as_deref() == Some("anthropic_messages") {
        config.base_url = config.base_url.trim_end_matches('/').to_string();
    } else {
        config.base_url = config
            .base_url
            .trim_end_matches('/')
            .trim_end_matches("/models")
            .trim_end_matches("/chat/completions")
            .trim_end_matches('/')
            .to_string();
    }
    let provider_instance = zen_llm::make_provider(&config);

    let healthy = tokio::time::timeout(
        std::time::Duration::from_secs(12),
        provider_instance.health_check(),
    )
    .await
    .map_err(|_| {
        zen_core::error::ZenError::Custom("Provider connection timed out after 12 seconds".to_string())
    })?;
    if !healthy {
        return Err(zen_core::error::ZenError::Internal(format!(
            "Node {} is unreachable",
            config.display_name
        )));
    }

    tokio::time::timeout(
        std::time::Duration::from_secs(12),
        provider_instance.list_models(),
    )
    .await
    .map_err(|_| {
        zen_core::error::ZenError::Custom(
            "Reading the provider model catalog timed out after 12 seconds".to_string(),
        )
    })?
}

async fn invalidate_provider_cache_if_needed<'a>(
    state: &State<'_, AppState>,
    keys: impl IntoIterator<Item = &'a str>,
) {
    if keys.into_iter().any(is_provider_setting_key) {
        clear_provider_cache(state).await;
    }
}

async fn clear_provider_cache(state: &State<'_, AppState>) {
    let mut cache = state.provider_cache.lock().await;
    cache.clear();
    state.provider_registry.invalidate_all().await;
}

fn is_provider_setting_key(key: &str) -> bool {
    key.ends_with("_base_url")
        || key.ends_with("_api_key")
        || key.ends_with("_headers")
        || key.ends_with("_api_format")
        || key == "active_provider"
}

fn is_workspace_root_key(key: &str) -> bool {
    key == "workspace.root" || key == "workspace_path"
}
