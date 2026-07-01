use crate::commands::AppState;
use crate::db::models::{ModelInfo, ProviderConfig};
use crate::error::{AppResult, ZenResult};
use crate::services::is_secret_key;
use crate::tools::manager::{ToolManager, ToolMetadata};
use std::collections::HashMap;
use tauri::State;

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
            |e| crate::error::ZenError::Custom(format!("Invalid workspace root: {}", e)),
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
                crate::error::ZenError::Custom(format!("Invalid workspace root: {}", e))
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
    let target_base_url = base_url.unwrap_or_else(|| crate::llm::default_base_url(&p_type));
    let target_api_key = api_key.unwrap_or_default();

    // Prevent transmitting bearer credentials over plain HTTP
    crate::utils::validate_remote_auth_safety(&target_base_url, !target_api_key.is_empty())
        .map_err(|e| crate::error::ZenError::Custom(e.to_string()))?;

    let config = ProviderConfig {
        provider_type: p_type.clone(),
        base_url: target_base_url,
        api_key: target_api_key,
        display_name: provider.clone(),
        headers: None,
    };

    let provider_instance = crate::llm::make_provider(&config);
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
        provider_instance.list_models().await
    } else {
        // Enumerate all configured providers — canonical names match providerOrder
        // and the crate::llm::create_provider / ProviderRegistry naming contract.
        let mut all_models = Vec::new();
        let all_settings = state.settings_manager.get_all().await?;

        let known_providers: Vec<&str> = vec![
            "ollama",
            "lmstudio",
            "nine_router",
            "opencode",
            "openai",
            "anthropic",
            "google",
            "groq",
            "mistral",
            "deepseek",
            "openrouter",
            "together",
            "perplexity",
            "qwen",
            "xai",
            "kilocode",
            "nvidia",
            "aihubmix",
        ];

        for p_name in known_providers {
            // Settings keys use snake_case (frontend camelCase is mapped via
            // settingsMapper.ts → mapStateToSqlite before persist).
            let api_key_key: String = match p_name {
                "google" | "gemini" => "gemini_api_key".to_string(),
                other => format!("{}_api_key", other),
            };
            let base_url_key = format!("{}_base_url", p_name);

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
            let is_no_key_builtin = p_name == "opencode";
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
                            eprintln!("Failed to fetch models from {}: {}", p_name, e);
                        }
                    }
                }
            }
        }
        Ok(all_models)
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
) -> ZenResult<crate::db::queries::ProviderUsageSnapshot> {
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
        format!("{}/models/image", base)
    } else {
        format!("{}/v1/models/image", base)
    };

    // Validate security boundary: prevent leaking API key over remote plain HTTP
    crate::utils::validate_remote_auth_safety(&endpoint, !api_key.is_empty())
        .map_err(|e| crate::error::ZenError::Custom(e.to_string()))?;

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
        crate::error::ZenError::Custom("9Router image models request timed out".to_string())
    })?
    .map_err(|e| {
        crate::error::ZenError::Custom(format!("Failed to connect to 9Router: {}", e))
    })?;

    if !response.status().is_success() {
        return Err(crate::error::ZenError::Custom(format!(
            "9Router returned status {} for image models",
            response.status()
        )));
    }

    let body: serde_json::Value = response.json().await.map_err(|e| {
        crate::error::ZenError::Custom(format!("Failed to parse 9Router response: {}", e))
    })?;

    let data_arr = body.get("data").and_then(|d| d.as_array()).ok_or_else(|| {
        crate::error::ZenError::Custom("No data field in 9Router models response".to_string())
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
    let permissions = ToolManager::build_permissions(&all_settings);
    state
        .tool_manager
        .update_permissions(permissions)
        .await
        .map_err(crate::error::ZenError::Internal)?;
    Ok(())
}

/// Returns true if `key` participates in the ToolManager permission policy.
/// The backend auto-syncs after these keys change so the frontend never has
/// to issue a separate sync command.
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
    let permissions = ToolManager::build_permissions(&all_settings);
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
        crate::error::ZenError::Custom(format!("Invalid provider endpoint: {error}"))
    })?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(crate::error::ZenError::Custom(
            "Provider endpoint must use HTTP or HTTPS".to_string(),
        ));
    }
    config.base_url = config
        .base_url
        .trim_end_matches('/')
        .trim_end_matches("/models")
        .trim_end_matches("/chat/completions")
        .trim_end_matches('/')
        .to_string();
    let provider_instance = crate::llm::make_provider(&config);

    let healthy = tokio::time::timeout(
        std::time::Duration::from_secs(12),
        provider_instance.health_check(),
    )
    .await
    .map_err(|_| {
        crate::error::ZenError::Custom("Provider connection timed out after 12 seconds".to_string())
    })?;
    if !healthy {
        return Err(crate::error::ZenError::Internal(format!(
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
        crate::error::ZenError::Custom(
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
        || key == "active_provider"
}

fn is_workspace_root_key(key: &str) -> bool {
    key == "workspace.root" || key == "workspace_path"
}
