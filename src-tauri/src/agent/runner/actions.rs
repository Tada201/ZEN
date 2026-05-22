use anyhow::Result;
use tauri::AppHandle;
use sqlx::SqlitePool;
use crate::db::queries;
use crate::agent::types::{MessageKind, ActionMeta};
use crate::agent::event_bus::{
    AgentEvent, ChatMessagePayload, AgentSpawnPayload, AgentCompletePayload, AgentHandoffPayload,
};

impl std::fmt::Display for MessageKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MessageKind::Text               => write!(f, "text"),
            MessageKind::ToolCall           => write!(f, "tool_call"),
            MessageKind::ToolResult         => write!(f, "tool_result"),
            MessageKind::AgentHandoff       => write!(f, "agent_handoff"),
            MessageKind::AgentSpawn         => write!(f, "agent_spawn"),
            MessageKind::AgentComplete      => write!(f, "agent_complete"),
            MessageKind::ApprovalRequest    => write!(f, "approval_request"),
            MessageKind::ClarificationRequest => write!(f, "clarification_request"),
        }
    }
}

/// Persist an action message to DB and emit it to the frontend.
pub async fn persist_and_emit_action(
    app: &AppHandle,
    db_pool: &SqlitePool,
    chat_id: &str,
    id: Option<String>,
    kind: MessageKind,
    content: String,
    meta: ActionMeta,
    role: Option<&str>,
    tool_call_id: Option<String>,
    channel: &Option<tauri::ipc::Channel<serde_json::Value>>,
) -> Result<String> {
    let metadata_json = serde_json::to_string(&meta)?;
    let role = role.unwrap_or("assistant");

    let msg = match queries::add_message(
        db_pool,
        chat_id,
        id.as_deref(),
        role,
        &content,
        None,                    // model
        true,                    // is_complete
        None,                    // tool_calls
        tool_call_id.as_deref(), // tool_call_id
        None,                    // images
        None,                    // attachments
        None,                    // tokens_in
        None,                    // tokens_out
        Some(&kind.to_string()),
        Some(&metadata_json),
    ).await {
        Ok(m) => m,
        Err(e) => {
            tracing::warn!("Failed to persist action to DB (chat_id: {}): {}", chat_id, e);
            return Err(e.into());
        }
    };

    let msg_id = msg.id.clone();
    let msg_ts = msg.created_at;

    AgentEvent::ChatMessage(ChatMessagePayload {
        chat_id: chat_id.to_string(),
        id: msg_id.clone(),
        timestamp: msg_ts.clone(),
        role: role.to_string(),
        kind: Some(kind.to_string()),
        content: content.clone(),
        metadata: Some(serde_json::to_value(meta.clone())?),
    }).emit_via(app, channel);

    bridge_lifecycle_events(app, channel, &kind, &meta, &msg_id, &msg_ts, chat_id, content);

    Ok(msg_id)
}

/// Emit action event to frontend without persisting to DB (fallback when no db_pool)
pub fn emit_action_only(
    app: &AppHandle,
    chat_id: &str,
    id: Option<String>,
    kind: MessageKind,
    content: String,
    meta: ActionMeta,
    channel: &Option<tauri::ipc::Channel<serde_json::Value>>,
) -> Result<String> {
    let msg_id = id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let msg_ts = chrono::Utc::now().to_rfc3339();

    AgentEvent::ChatMessage(ChatMessagePayload {
        chat_id: chat_id.to_string(),
        id: msg_id.clone(),
        timestamp: msg_ts.clone(),
        role: "assistant".to_string(),
        kind: Some(kind.to_string()),
        content: content.clone(),
        metadata: Some(serde_json::to_value(meta.clone())?),
    }).emit_via(app, channel);

    bridge_lifecycle_events(app, channel, &kind, &meta, &msg_id, &msg_ts, chat_id, content);

    Ok(msg_id)
}

/// Bridge specific agent lifecycle events to dedicated AgentEvent variants
/// (so the Task Board and Graph stay in sync).
fn bridge_lifecycle_events(
    app: &AppHandle,
    channel: &Option<tauri::ipc::Channel<serde_json::Value>>,
    kind: &MessageKind,
    meta: &ActionMeta,
    msg_id: &str,
    msg_ts: &str,
    chat_id: &str,
    content: String,
) {
    match kind {
        MessageKind::AgentSpawn => {
            if let Some(ref spawn) = meta.spawn {
                AgentEvent::AgentSpawn(AgentSpawnPayload {
                    spawn_id: msg_id.to_string(),
                    parent_agent: spawn.parent_agent.clone(),
                    child_agent_id: meta.agent_id.clone(),
                    child_agent_name: meta.agent_name.clone(),
                    task: spawn.task.clone(),
                    chat_id: chat_id.to_string(),
                    timestamp: msg_ts.to_string(),
                }).emit_via(app, channel);
            }
        }
        MessageKind::AgentComplete => {
            if let Some(ref spawn) = meta.spawn {
                let status = spawn.status.clone();
                let target_spawn_id = spawn.spawn_id.clone().unwrap_or_else(|| msg_id.to_string());
                AgentEvent::AgentComplete(AgentCompletePayload {
                    spawn_id: Some(target_spawn_id),
                    agent_id: meta.agent_id.clone(),
                    chat_id: chat_id.to_string(),
                    status: status.clone(),
                    result: if status == "completed" { Some(serde_json::Value::String(content.clone())) } else { None },
                    error: if status == "failed" { Some(content) } else { None },
                    duration_ms: spawn.duration_ms.unwrap_or(0),
                    timestamp: msg_ts.to_string(),
                }).emit_via(app, channel);
            }
        }
        MessageKind::AgentHandoff => {
            if let Some(ref handoff) = meta.handoff {
                AgentEvent::AgentHandoff(AgentHandoffPayload {
                    from_agent: handoff.from_agent.clone(),
                    to_agent: handoff.to_agent.clone(),
                    reason: handoff.reason.clone(),
                    chat_id: chat_id.to_string(),
                    timestamp: msg_ts.to_string(),
                }).emit_via(app, channel);
            }
        }
        _ => {}
    }
}
