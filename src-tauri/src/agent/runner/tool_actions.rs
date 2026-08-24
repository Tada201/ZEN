use super::actions::{
    emit_action_only, persist_and_emit_action, ActionEmitParams, ActionPersistParams,
};
use super::helpers::parse_file_changes;
use crate::agent::types::{ActionMeta, MessageKind, ToolCall, ToolCallMeta, ToolResultMeta};
use serde_json::Value;
use sqlx::SqlitePool;
use zen_core::ports::EventSink;

pub(super) struct ToolActionParams<'a> {
    pub events: &'a dyn EventSink,
    pub db_pool: Option<&'a SqlitePool>,
    pub chat_id: &'a str,
    pub tool_call: &'a ToolCall,
    pub agent_id: &'a str,
    pub agent_name: &'a str,
    pub iteration: usize,
    pub depth: u32,
}

pub(super) async fn emit_tool_call_action(params: ToolActionParams<'_>) {
    let ToolActionParams {
        events,
        db_pool,
        chat_id,
        tool_call,
        agent_id,
        agent_name,
        iteration,
        depth,
    } = params;
    let action_meta = ActionMeta {
        agent_id: agent_id.to_string(),
        agent_name: agent_name.to_string(),
        iteration,
        depth,
        progress_percent: None,
        tool_call: Some(ToolCallMeta {
            tool_name: tool_call.name.clone(),
            args: tool_call.args.clone(),
            status: "running".to_string(),
            tool_call_id: Some(tool_call.id.clone()),
        }),
        tool_result: None,
        handoff: None,
        spawn: None,
        approval_request: None,
        ..Default::default()
    };

    let content = format!("{} calling {}...", agent_name, tool_call.name);
    if let Some(db) = db_pool {
        let _ = persist_and_emit_action(ActionPersistParams {
            events,
            db_pool: db,
            chat_id,
            id: None,
            kind: MessageKind::ToolCall,
            content,
            meta: action_meta,
            role: None,
            tool_call_id: None,
        })
        .await;
    } else {
        let _ = emit_action_only(ActionEmitParams {
            events,
            chat_id,
            id: None,
            kind: MessageKind::ToolCall,
            content,
            meta: action_meta,
        });
    }
}

pub(super) struct CachedResultParams<'a> {
    pub events: &'a dyn EventSink,
    pub db_pool: Option<&'a SqlitePool>,
    pub chat_id: &'a str,
    pub tool_call: &'a ToolCall,
    pub cached_result: &'a Value,
    pub agent_id: &'a str,
    pub agent_name: &'a str,
    pub iteration: usize,
    pub depth: u32,
}

pub(super) async fn emit_cached_tool_result_action(params: CachedResultParams<'_>) {
    let CachedResultParams {
        events,
        db_pool,
        chat_id,
        tool_call,
        cached_result,
        agent_id,
        agent_name,
        iteration,
        depth,
    } = params;
    let tool_result_meta = ToolResultMeta {
        tool_name: tool_call.name.clone(),
        status: "ok".to_string(),
        duration_ms: 0,
        content_summary: cached_result.to_string().chars().take(200).collect(),
        args: tool_call.args.clone(),
        files: parse_file_changes(cached_result),
        raw_result: Some(cached_result.clone()),
        tool_call_id: Some(tool_call.id.clone()),
    };

    let action_meta = ActionMeta {
        agent_id: agent_id.to_string(),
        agent_name: agent_name.to_string(),
        iteration,
        depth,
        progress_percent: None,
        tool_call: Some(ToolCallMeta {
            tool_name: tool_call.name.clone(),
            args: tool_call.args.clone(),
            status: "completed".to_string(),
            tool_call_id: Some(tool_call.id.clone()),
        }),
        tool_result: Some(tool_result_meta),
        handoff: None,
        spawn: None,
        approval_request: None,
        ..Default::default()
    };

    let content = format!("{}: Success (cached)", tool_call.name);
    if let Some(db) = db_pool {
        let _ = persist_and_emit_action(ActionPersistParams {
            events,
            db_pool: db,
            chat_id,
            id: None,
            kind: MessageKind::ToolResult,
            content,
            meta: action_meta,
            role: Some("tool"),
            tool_call_id: Some(tool_call.id.clone()),
        })
        .await;
    } else {
        let _ = emit_action_only(ActionEmitParams {
            events,
            chat_id,
            id: None,
            kind: MessageKind::ToolResult,
            content,
            meta: action_meta,
        });
    }
}
