use tauri::State;
use crate::error::{AppResult, ZenResult};
use crate::commands::AppState;
use std::collections::HashMap;
use crate::db::models::{ModelInfo, ProviderConfig};
use crate::tools::manager::ToolManager;
use crate::tools::permission::ToolPermissions;

#[tauri::command]
pub async fn get_setting(state: State<'_, AppState>, key: String) -> AppResult<Option<String>> {
    state.settings_manager.get(&key).await
}

#[tauri::command]
pub async fn set_setting(state: State<'_, AppState>, key: String, value: String) -> AppResult<()> {
    state.settings_manager.set(key.clone(), value).await?;
    
    // Invalidate provider cache if a provider config setting changes
    if key.ends_with("_base_url") || key.ends_with("_api_key") || key == "active_provider" {
        let mut cache = state.provider_cache.lock().await;
        cache.clear();
        state.provider_registry.invalidate_all().await;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn get_all_settings(state: State<'_, AppState>) -> AppResult<HashMap<String, String>> {
    state.settings_manager.get_all().await
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
        let provider_instance = crate::llm::create_provider(&db, &p_name).await?;
        provider_instance.list_models().await
    } else {
        // Enumerate all configured providers — canonical names match providerOrder
        // and the crate::llm::create_provider / ProviderRegistry naming contract.
        let mut all_models = Vec::new();
        let all_settings = state.settings_manager.get_all().await?;

        let known_providers: Vec<&str> = vec![
            "ollama", "lmstudio", "nine_router",
            "openai", "anthropic", "google",
            "groq", "mistral", "deepseek", "openrouter",
            "together", "perplexity", "qwen", "xai",
            "kilocode", "nvidia", "aihubmix",
        ];

        for p_name in known_providers {
            // Settings keys use snake_case (frontend camelCase is mapped via
            // settingsMapper.ts → mapStateToSqlite before persist).
            let api_key_key: String = match p_name {
                "google" | "gemini" => "gemini_api_key".to_string(),
                other => format!("{}_api_key", other),
            };
            let base_url_key = format!("{}_base_url", p_name);

            let has_key = all_settings.get(&api_key_key).map(|v| !v.is_empty()).unwrap_or(false);
            let has_url = all_settings.get(&base_url_key).map(|v| !v.is_empty()).unwrap_or(false);
            let is_local = p_name == "ollama" || p_name == "lmstudio";
            let is_active = all_settings.get("active_provider").map(|v| v == p_name).unwrap_or(false);

            if is_local || is_active || has_key || has_url {
                if let Ok(provider_instance) = crate::llm::create_provider(&db, p_name).await {
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
pub async fn sync_tool_permissions(
    state: State<'_, AppState>,
) -> AppResult<()> {
    let all_settings = state.settings_manager.get_all().await?;
    let permissions = ToolManager::build_permissions(&all_settings);
    state.tool_manager.update_permissions(permissions);
    Ok(())
}

/// Tests connection to a provider and returns discovered models on success.
#[tauri::command]
pub async fn test_provider_connection(
    _state: State<'_, AppState>,
    config: ProviderConfig,
) -> ZenResult<Vec<ModelInfo>> {
    let provider_instance = crate::llm::make_provider(&config);
    
    // Check health first
    if !provider_instance.health_check().await {
        return Err(crate::error::ZenError::Internal(format!("Node {} is unreachable", config.display_name)));
    }
    
    // Return model list on success
    provider_instance.list_models().await
}
