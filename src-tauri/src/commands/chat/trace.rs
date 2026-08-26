use crate::commands::AppState;
use zen_db::queries::{self, ExecutionTraceSnapshot};
use zen_core::error::ZenResult;
use tauri::State;

/// Replace the normalized event projection for one assistant run.
///
/// The frontend sends only its bounded/redacted projection. The backend owns
/// the trace identity, version, lifecycle status, event rows, and retention.
#[tauri::command]
pub async fn upsert_execution_trace(
    state: State<'_, AppState>,
    chat_id: String,
    message_id: String,
    trace_json: String,
    trace_status: Option<String>,
) -> ZenResult<ExecutionTraceSnapshot> {
    let db = state.db().await?;
    queries::upsert_execution_trace(
        &db,
        &chat_id,
        &message_id,
        &trace_json,
        trace_status.as_deref(),
    )
    .await
}

/// Hydrate one normalized execution trace for Run Inspector or recovery UI.
#[tauri::command]
pub async fn get_execution_trace(
    state: State<'_, AppState>,
    chat_id: String,
    message_id: String,
) -> ZenResult<Option<ExecutionTraceSnapshot>> {
    let db = state.db().await?;
    queries::get_execution_trace(&db, &chat_id, &message_id).await
}

/// Hydrate all normalized traces for a chat in one typed IPC call.
#[tauri::command]
pub async fn list_execution_traces(
    state: State<'_, AppState>,
    chat_id: String,
) -> ZenResult<Vec<ExecutionTraceSnapshot>> {
    let db = state.db().await?;
    queries::list_execution_traces(&db, &chat_id).await
}
