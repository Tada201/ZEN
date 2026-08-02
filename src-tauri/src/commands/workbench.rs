use tauri::State;
use crate::commands::AppState;
use crate::db::models::WorkbenchTab;
use crate::db::queries;
use crate::error::{ZenError, ZenResult};

fn validate_tab(tab: &WorkbenchTab) -> ZenResult<()> {
    if tab.id.trim().is_empty() || tab.chat_id.trim().is_empty() || tab.view_id.trim().is_empty() {
        return Err(ZenError::Custom("workbench tab requires id, chat_id, and view_id".into()));
    }
    if tab.label.len() > 200 || tab.state_json.as_ref().map(|s| s.len()).unwrap_or(0) > 256 * 1024 {
        return Err(ZenError::Custom("workbench tab payload is too large".into()));
    }
    Ok(())
}

#[tauri::command]
pub async fn list_workbench_tabs(state: State<'_, AppState>, chat_id: String) -> ZenResult<Vec<WorkbenchTab>> {
    let db = state.db().await?;
    queries::get_chat(&db, &chat_id).await?;
    queries::list_workbench_tabs(&db, &chat_id).await
}

#[tauri::command]
pub async fn upsert_workbench_tab(state: State<'_, AppState>, tab: WorkbenchTab) -> ZenResult<()> {
    validate_tab(&tab)?;
    let db = state.db().await?;
    queries::get_chat(&db, &tab.chat_id).await?;
    queries::upsert_workbench_tab(&db, &tab).await
}

#[tauri::command]
pub async fn delete_workbench_tab(state: State<'_, AppState>, chat_id: String, tab_id: String) -> ZenResult<()> {
    let db = state.db().await?;
    queries::get_chat(&db, &chat_id).await?;
    queries::delete_workbench_tab(&db, &chat_id, &tab_id).await
}
