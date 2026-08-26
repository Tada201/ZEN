//! Sub-agent inbox delivery and commentary collection.

use anyhow::Result;
use serde_json::Value;
use std::sync::Arc;
use tauri::Manager;

use crate::commands::AppState;

use super::model_select::{optional_string, optional_string_list};

/// Send a message to a running sub-agent identified by its `spawn_id`.
/// The message is appended to the sub-agent's inbox and will be drained
/// into its conversation at the start of the next iteration.
/// Returns an error if no sub-agent with that `spawn_id` is running.
pub async fn send_message_to_subagent(
    app: &tauri::AppHandle,
    spawn_id: &str,
    message: zen_db::models::ChatMessage,
) -> Result<()> {
    let state = app.state::<AppState>();
    let queues = state.subagent_message_queues.lock().await;
    if let Some(queue) = queues.get(spawn_id) {
        let mut q = queue.lock().await;
        q.push_back(message);
        Ok(())
    } else {
        Err(anyhow::anyhow!(
            "No running sub-agent with spawn_id {spawn_id}"
        ))
    }
}

pub(super) fn handoff_fields_from_input(input: &Value) -> (Option<String>, Vec<String>, Vec<String>) {
    (
        optional_string(input.get("success_criteria")).map(str::to_string),
        optional_string_list(input.get("constraints")),
        optional_string_list(input.get("relevant_files")),
    )
}

/// Drain the child's recorded commentary into bounded, sequence-ordered
/// segments for the completion event. Returns None when the child produced no
/// interleaved text so the payload field stays absent.
pub(super) async fn collect_intermediate_segments(
    commentary: &Arc<tokio::sync::Mutex<Vec<(u64, String)>>>,
) -> Option<Vec<zen_agent::event_bus::SubagentCommentarySegment>> {
    let raw = commentary.lock().await;
    zen_agent::event_bus::SubagentCommentarySegment::snapshot(&raw)
}
