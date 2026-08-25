use crate::event_bus::{
    AgentCompletePayload, AgentEvent, AgentHandoffPayload, AgentSpawnPayload, ChatMessagePayload,
};
use crate::types::{ActionMeta, MessageKind};
use zen_db::queries;
use anyhow::Result;
use sqlx::SqlitePool;
use zen_core::ports::EventSink;

impl std::fmt::Display for MessageKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MessageKind::Text => write!(f, "text"),
            MessageKind::ToolCall => write!(f, "tool_call"),
            MessageKind::ToolResult => write!(f, "tool_result"),
            MessageKind::AgentHandoff => write!(f, "agent_handoff"),
            MessageKind::AgentSpawn => write!(f, "agent_spawn"),
            MessageKind::AgentComplete => write!(f, "agent_complete"),
            MessageKind::ApprovalRequest => write!(f, "approval_request"),
            MessageKind::ClarificationRequest => write!(f, "clarification_request"),
        }
    }
}

/// Parameters for persisting and emitting an action to the frontend.
pub struct ActionPersistParams<'a> {
    pub events: &'a dyn EventSink,
    pub db_pool: &'a SqlitePool,
    pub chat_id: &'a str,
    pub id: Option<String>,
    pub kind: MessageKind,
    pub content: String,
    pub meta: ActionMeta,
    pub role: Option<&'a str>,
    pub tool_call_id: Option<String>,
}

/// Persist an action message to DB and emit it to the frontend.
pub async fn persist_and_emit_action(params: ActionPersistParams<'_>) -> Result<String> {
    let metadata_json = serde_json::to_string(&params.meta)?;
    let role = params.role.unwrap_or("assistant");

    let msg = match queries::add_message(
        params.db_pool,
        &queries::NewMessage {
            chat_id: params.chat_id,
            id: params.id.as_deref(),
            role,
            content: &params.content,
            is_complete: true,
            tool_calls: None,
            tool_call_id: params.tool_call_id.as_deref(),
            kind: Some(&params.kind.to_string()),
            metadata: Some(&metadata_json),
            ..Default::default()
        },
    )
    .await
    {
        Ok(m) => m,
        Err(e) => {
            tracing::warn!(
                "Failed to persist action to DB (chat_id: {}): {}",
                params.chat_id,
                e
            );
            return Err(e.into());
        }
    };

    let msg_id = msg.id.clone();
    let msg_ts = msg.created_at;

    AgentEvent::ChatMessage(ChatMessagePayload {
        chat_id: params.chat_id.to_string(),
        id: msg_id.clone(),
        timestamp: msg_ts.clone(),
        role: role.to_string(),
        kind: Some(params.kind.to_string()),
        content: params.content.clone(),
        metadata: Some(serde_json::to_value(params.meta.clone())?),
    })
    .emit_to(params.events);

    bridge_lifecycle_events(BridgeContext {
        events: params.events,
        kind: &params.kind,
        meta: &params.meta,
        msg_id: &msg_id,
        msg_ts: &msg_ts,
        chat_id: params.chat_id,
        content: params.content,
    });

    Ok(msg_id)
}

/// Parameters for emitting an action-only event (no DB persist).
pub struct ActionEmitParams<'a> {
    pub events: &'a dyn EventSink,
    pub chat_id: &'a str,
    pub id: Option<String>,
    pub kind: MessageKind,
    pub content: String,
    pub meta: ActionMeta,
}

/// Emit action event to frontend without persisting to DB (fallback when no db_pool)
pub fn emit_action_only(params: ActionEmitParams<'_>) -> Result<String> {
    let msg_id = params
        .id
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let msg_ts = chrono::Utc::now().to_rfc3339();

    AgentEvent::ChatMessage(ChatMessagePayload {
        chat_id: params.chat_id.to_string(),
        id: msg_id.clone(),
        timestamp: msg_ts.clone(),
        role: "assistant".to_string(),
        kind: Some(params.kind.to_string()),
        content: params.content.clone(),
        metadata: Some(serde_json::to_value(params.meta.clone())?),
    })
    .emit_to(params.events);

    bridge_lifecycle_events(BridgeContext {
        events: params.events,
        kind: &params.kind,
        meta: &params.meta,
        msg_id: &msg_id,
        msg_ts: &msg_ts,
        chat_id: params.chat_id,
        content: params.content,
    });

    Ok(msg_id)
}

/// Context for bridging lifecycle events.
pub struct BridgeContext<'a> {
    pub events: &'a dyn EventSink,
    pub kind: &'a MessageKind,
    pub meta: &'a ActionMeta,
    pub msg_id: &'a str,
    pub msg_ts: &'a str,
    pub chat_id: &'a str,
    pub content: String,
}

/// Bridge specific agent lifecycle events to dedicated AgentEvent variants
/// (so the Task Board and Graph stay in sync).
fn bridge_lifecycle_events(ctx: BridgeContext<'_>) {
    match ctx.kind {
        MessageKind::AgentSpawn => {
            if let Some(ref spawn) = ctx.meta.spawn {
                AgentEvent::AgentSpawn(AgentSpawnPayload {
                    spawn_id: spawn
                        .spawn_id
                        .clone()
                        .unwrap_or_else(|| ctx.msg_id.to_string()),
                    parent_agent: spawn.parent_agent.clone(),
                    child_agent_id: ctx.meta.agent_id.clone(),
                    child_agent_name: ctx.meta.agent_name.clone(),
                    task: spawn.task.clone(),
                    chat_id: ctx.chat_id.to_string(),
                    timestamp: ctx.msg_ts.to_string(),
                })
                .emit_to(ctx.events);
            }
        }
        MessageKind::AgentComplete => {
            if let Some(ref spawn) = ctx.meta.spawn {
                let status = spawn.status.clone();
                let target_spawn_id = spawn
                    .spawn_id
                    .clone()
                    .unwrap_or_else(|| ctx.msg_id.to_string());
                AgentEvent::AgentComplete(AgentCompletePayload {
                    spawn_id: Some(target_spawn_id),
                    agent_id: ctx.meta.agent_id.clone(),
                    chat_id: ctx.chat_id.to_string(),
                    status: status.clone(),
                    result: if status == "completed" {
                        Some(serde_json::Value::String(ctx.content.clone()))
                    } else {
                        None
                    },
                    error: if status == "failed" {
                        Some(ctx.content)
                    } else {
                        None
                    },
                    duration_ms: spawn.duration_ms.unwrap_or(0),
                    timestamp: ctx.msg_ts.to_string(),
                })
                .emit_to(ctx.events);
            }
        }
        MessageKind::AgentHandoff => {
            if let Some(ref handoff) = ctx.meta.handoff {
                AgentEvent::AgentHandoff(AgentHandoffPayload {
                    from_agent: handoff.from_agent.clone(),
                    to_agent: handoff.to_agent.clone(),
                    reason: handoff.reason.clone(),
                    chat_id: ctx.chat_id.to_string(),
                    timestamp: ctx.msg_ts.to_string(),
                })
                .emit_to(ctx.events);
            }
        }
        _ => {}
    }
}
