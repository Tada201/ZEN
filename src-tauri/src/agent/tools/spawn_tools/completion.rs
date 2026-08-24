//! Completion-event emission shared by the spawn and delegate paths.

use anyhow::Result;
use serde_json::json;
use tauri::{AppHandle, Emitter};

/// Parameters for emitting spawn completion events.
pub(super) struct CompletionParams<'a> {
    pub(super) app: &'a AppHandle,
    pub(super) chat_id: &'a str,
    pub(super) agent_id: &'a str,
    pub(super) agent_name: &'a str,
    pub(super) task: &'a str,
    pub(super) spawn_id: &'a str,
    pub(super) label: &'a str,
    pub(super) status: &'a str,
    pub(super) error: Option<&'a str>,
    pub(super) result_summary: Option<&'a str>,
    pub(super) duration_ms: u64,
}

/// Shared helper to emit completion events for spawn/delegate tools.
pub(super) fn emit_completion_events(params: CompletionParams<'_>) -> Result<()> {
    let CompletionParams {
        app,
        chat_id,
        agent_id,
        agent_name,
        task,
        spawn_id,
        label,
        status,
        error,
        result_summary,
        duration_ms,
    } = params;

    // `agent:complete` stays a raw app emit: its payload is richer than the
    // typed `AgentCompletePayload` (spawn_id, parent/child identity, task,
    // result summary) and the frontend's `appendAgentActionStep` reads those
    // fields directly. Migrating it requires extending the typed payload
    // first; the spawn side already went through the event bus.
    let _ = app.emit(
        "agent:complete",
        json!({
            "spawn_id": spawn_id,
            "agent_id": agent_id,
            "chat_id": chat_id,
            "parent_agent": label,
            "child_agent_id": agent_id,
            "child_agent_name": agent_name,
            "task": task,
            "status": status,
            "error": error,
            "result": result_summary.map(|summary| json!({ "summary": summary })),
            "duration_ms": duration_ms,
        }),
    );

    Ok(())
}
