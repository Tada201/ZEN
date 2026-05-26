use super::actions::{emit_action_only, persist_and_emit_action};
use super::helpers::parse_file_changes;
use crate::agent::types::{ActionMeta, MessageKind, ToolCall, ToolCallMeta, ToolResultMeta};
use serde_json::Value;
use sqlx::SqlitePool;
use tauri::AppHandle;

pub(super) async fn emit_tool_call_action(
    app: &AppHandle,
    db_pool: Option<&SqlitePool>,
    channel: &Option<tauri::ipc::Channel<Value>>,
    chat_id: &str,
    tool_call: &ToolCall,
    agent_id: &str,
    agent_name: &str,
    iteration: usize,
    depth: u32,
) {
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
        let _ = persist_and_emit_action(
            app,
            db,
            chat_id,
            None,
            MessageKind::ToolCall,
            content,
            action_meta,
            None,
            None,
            channel,
        )
        .await;
    } else {
        let _ = emit_action_only(
            app,
            chat_id,
            None,
            MessageKind::ToolCall,
            content,
            action_meta,
            channel,
        );
    }
}

pub(super) async fn emit_cached_tool_result_action(
    app: &AppHandle,
    db_pool: Option<&SqlitePool>,
    channel: &Option<tauri::ipc::Channel<Value>>,
    chat_id: &str,
    tool_call: &ToolCall,
    cached_result: &Value,
    agent_id: &str,
    agent_name: &str,
    iteration: usize,
    depth: u32,
) {
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
        let _ = persist_and_emit_action(
            app,
            db,
            chat_id,
            None,
            MessageKind::ToolResult,
            content,
            action_meta,
            Some("tool"),
            Some(tool_call.id.clone()),
            channel,
        )
        .await;
    } else {
        let _ = emit_action_only(
            app,
            chat_id,
            None,
            MessageKind::ToolResult,
            content,
            action_meta,
            channel,
        );
    }
}
