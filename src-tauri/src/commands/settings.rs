use tauri::State;
use crate::error::AppResult;
use crate::commands::AppState;
use std::collections::HashMap;

#[tauri::command]
pub async fn get_setting(state: State<'_, AppState>, key: String) -> AppResult<Option<String>> {
    state.settings_manager.get(&key).await
}

#[tauri::command]
pub async fn set_setting(state: State<'_, AppState>, key: String, value: String) -> AppResult<()> {
    state.settings_manager.set(key, value).await
}

#[tauri::command]
pub async fn get_all_settings(state: State<'_, AppState>) -> AppResult<HashMap<String, String>> {
    state.settings_manager.get_all().await
}
