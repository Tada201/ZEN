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

    Ok(())
}

#[tauri::command]
pub async fn set_settings(
    state: State<'_, AppState>,
    settings: HashMap<String, String>,
) -> AppResult<()> {
    let should_invalidate_provider_cache = settings.keys().any(|key| is_provider_setting_key(key));
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

    let config = ProviderConfig {
        provider_type: p_type.clone(),
        base_url: base_url.unwrap_or_else(|| crate::llm::default_base_url(&p_type)),
        api_key: api_key.unwrap_or_default(),
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

/// Synchronize tool permissions from flat key-value settings into the ToolManager
/// and the v2 ToolRegistry. Should be called after any `tools.*` setting is changed.
#[tauri::command]
pub async fn sync_tool_permissions(state: State<'_, AppState>) -> AppResult<()> {
    let all_settings = state.settings_manager.get_all().await?;
    let permissions = ToolManager::build_permissions(&all_settings);
    state.tool_manager.update_permissions(permissions);
    Ok(())
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
    .map_err(|_| crate::error::ZenError::Custom("Provider connection timed out after 12 seconds".to_string()))?;
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
    .map_err(|_| crate::error::ZenError::Custom("Reading the provider model catalog timed out after 12 seconds".to_string()))?
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
