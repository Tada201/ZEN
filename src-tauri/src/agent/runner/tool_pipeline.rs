use crate::agent::cache::ToolCache;
use crate::agent::types::{ToolCall, ToolResult};
use crate::tools::manager::ToolManager;
use serde_json::{json, Value};
use std::sync::Arc;

#[derive(Clone)]
pub(super) struct PipelineCall {
    pub index: usize,
    pub original: ToolCall,
    pub resolved: ToolCall,
}

pub(super) async fn preprocess_tool_calls(
    tool_manager: &Arc<ToolManager>,
    tool_calls: &[ToolCall],
    authorized_tool_ids: &[String],
) -> (Vec<Option<ToolResult>>, Vec<PipelineCall>) {
    let mut ordered_results: Vec<Option<ToolResult>> = vec![None; tool_calls.len()];
    let mut pipeline_calls: Vec<PipelineCall> = Vec::new();

    for (index, tc) in tool_calls.iter().enumerate() {
        match tc.name.as_str() {
            "tool_list" => {
                let query = tc.args.get("query").and_then(|v| v.as_str());
                let descriptors = tool_manager
                    .list_allowed_matching(authorized_tool_ids, query)
                    .await;
                let content = serde_json::to_value(&descriptors).unwrap_or_default();
                ordered_results[index] = Some(normalize_tool_result(
                    tc.id.clone(),
                    "tool_list",
                    "Tool List",
                    tc.args.clone(),
                    content,
                    false,
                    0,
                    chrono::Utc::now(),
                ));
            }
            "tool_info" => {
                let tool_id = tc
                    .args
                    .get("tool_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let schema = tool_manager.get_info(tool_id).await;
                let started_at = chrono::Utc::now();
                let result = match schema {
                    Some(s) => normalize_tool_result(
                        tc.id.clone(),
                        "tool_info",
                        "Tool Info",
                        tc.args.clone(),
                        serde_json::to_value(&s).unwrap_or_default(),
                        false,
                        0,
                        started_at,
                    ),
                    None => normalize_tool_result(
                        tc.id.clone(),
                        "tool_info",
                        "Tool Info",
                        tc.args.clone(),
                        json!({
                            "error": format!("Tool '{}' not found. Use tool_list to see available tools.", tool_id),
                            "hint": "Check the tool_id spelling or call tool_list first to see all available tools."
                        }),
                        true,
                        0,
                        started_at,
                    ),
                };
                ordered_results[index] = Some(result);
            }
            "tool_exec" => {
                if let Some((real_id, real_args)) = tool_manager.resolve_tool_exec(&tc.args).await {
                    pipeline_calls.push(PipelineCall {
                        index,
                        original: tc.clone(),
                        resolved: ToolCall {
                            id: tc.id.clone(),
                            name: real_id,
                            args: real_args,
                        },
                    });
                } else {
                    ordered_results[index] = Some(normalize_tool_result(
                        tc.id.clone(),
                        "tool_exec",
                        "Tool Exec",
                        tc.args.clone(),
                        json!({
                            "error": "Tool not found or invalid arguments. Use tool_list and tool_info to discover valid tools.",
                            "hint": "Call tool_list() to see available tools, then tool_info({\"tool_id\": \"name\"}) for the schema."
                        }),
                        true,
                        0,
                        chrono::Utc::now(),
                    ));
                }
            }
            _ => {
                pipeline_calls.push(PipelineCall {
                    index,
                    original: tc.clone(),
                    resolved: tc.clone(),
                });
            }
        }
    }

    (ordered_results, pipeline_calls)
}

pub(super) fn cache_key_for(tool_call: &ToolCall) -> String {
    ToolCache::generate_key(&tool_call.name, &tool_call.args)
}

pub(super) fn should_read_cache(tool_name: &str) -> bool {
    tool_name != "write_todos"
}

pub(super) fn should_write_cache(tool_name: &str, is_error: bool) -> bool {
    !is_error && tool_name != "write_todos"
}

pub(super) fn normalize_tool_result(
    tool_call_id: String,
    tool_id: &str,
    display_name: &str,
    input: Value,
    output: Value,
    is_error: bool,
    duration_ms: u64,
    started_at: chrono::DateTime<chrono::Utc>,
) -> ToolResult {
    let status = if is_error { "error" } else { "success" };
    let output = compact_tool_output(output);
    let summary = summarize_tool_output(&output);
    ToolResult {
        tool_call_id: tool_call_id.clone(),
        content: json!({
            "id": tool_call_id,
            "tool_id": tool_id,
            "display_name": display_name,
            "status": status,
            "input": input,
            "output": output,
            "summary": summary,
            "started_at": started_at.to_rfc3339(),
            "completed_at": chrono::Utc::now().to_rfc3339(),
            "duration_ms": duration_ms
        }),
        is_error,
        duration_ms,
    }
}

fn summarize_tool_output(value: &Value) -> String {
    if let Some(summary) = value.get("summary").and_then(|v| v.as_str()) {
        return summary.chars().take(500).collect();
    }
    if let Some(error) = value.get("error").and_then(|v| v.as_str()) {
        return format!("Error: {}", error).chars().take(500).collect();
    }
    if let Some(s) = value.as_str() {
        return s.chars().take(500).collect();
    }
    value.to_string().chars().take(500).collect()
}

fn compact_tool_output(value: Value) -> Value {
    const MAX_STRING_CHARS: usize = 6_000;
    match value {
        Value::String(s) if s.chars().count() > MAX_STRING_CHARS => {
            let excerpt: String = s.chars().take(MAX_STRING_CHARS).collect();
            json!({
                "excerpt": excerpt,
                "truncated": true,
                "original_chars": s.chars().count()
            })
        }
        Value::Array(items) if items.len() > 50 => {
            json!({
                "items": items.into_iter().take(50).collect::<Vec<_>>(),
                "truncated": true
            })
        }
        other => other,
    }
}
