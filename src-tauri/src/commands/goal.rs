//! Tauri IPC commands for thread goals (`/goal`). Thin adapters over
//! `services::goal`, which owns the lifecycle rules and events.

use tauri::{AppHandle, State};

use crate::commands::AppState;
use zen_db::models::ThreadGoal;
use zen_core::error::ZenResult;
use crate::services::goal as goal_service;

#[tauri::command]
pub async fn get_thread_goal(
    state: State<'_, AppState>,
    chat_id: String,
) -> ZenResult<Option<ThreadGoal>> {
    let db = state.db().await?;
    goal_service::get_goal(&db, &chat_id).await
}

#[tauri::command]
pub async fn set_thread_goal(
    app: AppHandle,
    state: State<'_, AppState>,
    chat_id: String,
    objective: String,
) -> ZenResult<ThreadGoal> {
    let db = state.db().await?;
    goal_service::set_goal(&app, &db, &chat_id, &objective).await
}

/// status: active (resume) | paused | complete | blocked
#[tauri::command]
pub async fn update_thread_goal_status(
    app: AppHandle,
    state: State<'_, AppState>,
    chat_id: String,
    status: String,
) -> ZenResult<Option<ThreadGoal>> {
    let db = state.db().await?;
    goal_service::update_status(&app, &db, &chat_id, &status).await
}

#[tauri::command]
pub async fn clear_thread_goal(
    app: AppHandle,
    state: State<'_, AppState>,
    chat_id: String,
) -> ZenResult<()> {
    let db = state.db().await?;
    goal_service::clear_goal(&app, &db, &chat_id).await
}
