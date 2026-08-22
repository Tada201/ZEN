use crate::agent::cache::ToolCache;
use crate::agent::types::{ToolCall, ToolResult};
use crate::services::permissions::{
    enforce_tool_allowlist, from_agent_tool_ids, AllowlistDecision,
};
use crate::tools::manager::ToolManager;
use serde_json::{json, Value};
use std::sync::Arc;

#[derive(Clone)]
pub(super) struct PipelineCall {
    pub index: usize,
    pub original: ToolCall,
    pub resolved: ToolCall,
}

fn normalize_direct_tool_args(tool_name: &str, args: &Value) -> Value {
    let mut normalized = if args.get("tool_id").and_then(Value::as_str) == Some(tool_name) {
        args.get("arguments")
            .filter(|value| value.is_object())
            .cloned()
            .unwrap_or_else(|| args.clone())
    } else {
        args.clone()
    };

    if tool_name == "spawn_agent" {
        if let Some(object) = normalized.as_object_mut() {
            if !object.contains_key("agent_id") {
                if let Some(role) = object.remove("role") {
                    object.insert("agent_id".to_string(), role);
                }
            }
        }
    } else if tool_name == "write_todos" && normalized.get("todos").is_none() {
        // A model may emit a single bare item ({task}/{step}/{content}) or use
        // an alternate list key ("plan"/"steps"/"items") instead of "todos".
        // Rewrap so the tolerant parser in task_tools sees a "todos" array.
        if let Some(list) = ["plan", "steps", "items", "tasks"]
            .iter()
            .find_map(|key| normalized.get(*key).filter(|v| v.is_array()).cloned())
        {
            normalized = json!({ "todos": list });
        } else if normalized.get("task").is_some()
            || normalized.get("step").is_some()
            || normalized.get("content").is_some()
        {
            normalized = json!({ "todos": [normalized] });
        }
    } else if tool_name == "manage_board" {
        normalized = super::voice_display::normalize_board_operation(normalized)
            .unwrap_or_else(|| args.clone());
    }

    normalized
}

pub(super) fn nested_delegation_denied(tool_name: &str, delegation_allowed: bool) -> bool {
    tool_name == "spawn_agent" && !delegation_allowed
}

pub(super) async fn preprocess_tool_calls(
    tool_manager: &Arc<ToolManager>,
    tool_calls: &[ToolCall],
    authorized_tool_ids: &[String],
    tools_enabled: bool,
    delegation_allowed: bool,
) -> (Vec<Option<ToolResult>>, Vec<PipelineCall>) {
    let mut ordered_results: Vec<Option<ToolResult>> = vec![None; tool_calls.len()];
    let mut pipeline_calls: Vec<PipelineCall> = Vec::new();
    let allowlist = from_agent_tool_ids(authorized_tool_ids);

    for (index, tc) in tool_calls.iter().enumerate() {
        match tc.name.as_str() {
            "tool_list" => {
                let query = tc.args.get("query").and_then(|v| v.as_str());
                let limit = tc
                    .args
                    .get("limit")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(16)
                    .clamp(1, 24) as usize;
                let mut descriptors = tool_manager
                    .list_allowed_matching(authorized_tool_ids, query)
                    .await;
                descriptors.truncate(limit);
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
                if !authorized_tool_ids.is_empty()
                    && matches!(
                        enforce_tool_allowlist(&allowlist, tool_id, "agent"),
                        AllowlistDecision::Deny { .. }
                    )
                {
                    ordered_results[index] = Some(normalize_tool_result(
                        tc.id.clone(),
                        "tool_info",
                        "Tool Info",
                        tc.args.clone(),
                        json!({
                            "error": format!("Tool '{}' is not authorized for the current agent.", tool_id),
                            "hint": "Call tool_list to see the tools available to this agent."
                        }),
                        true,
                        0,
                        chrono::Utc::now(),
                    ));
                    continue;
                }
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
                // Even though authorized_tools_for_agent returns an empty
                // list when tools_enabled is false, that empty list still
                // matches the "skip allowlist check" branch below and lets
                // tool_exec({tool_id: ...}) run any registered tool. Gate
                // the whole branch on tools_enabled so a JSON-only retry
                // runner cannot smuggle in tool calls.
                if !tools_enabled {
                    ordered_results[index] = Some(normalize_tool_result(
                        tc.id.clone(),
                        "tool_exec",
                        "Tool Exec",
                        tc.args.clone(),
                        json!({
                            "error": "Tool execution is disabled for this run.",
                            "hint": "Do not call tool_exec when the runner was started with tools disabled; emit raw JSON instead."
                        }),
                        true,
                        0,
                        chrono::Utc::now(),
                    ));
                    continue;
                }
                if let Some((real_id, real_args)) = tool_manager.resolve_tool_exec(&tc.args).await {
                    if nested_delegation_denied(&real_id, delegation_allowed) {
                        ordered_results[index] = Some(normalize_tool_result(
                            tc.id.clone(), "tool_exec", "Tool Exec", tc.args.clone(),
                            json!({"error": "Nested delegation is disabled for sub-agents."}),
                            true, 0, chrono::Utc::now(),
                        ));
                        continue;
                    }
                    if !authorized_tool_ids.is_empty() {
                        if let AllowlistDecision::Deny { reason } =
                            enforce_tool_allowlist(&allowlist, &real_id, "agent")
                        {
                            ordered_results[index] = Some(normalize_tool_result(
                                tc.id.clone(),
                                "tool_exec",
                                "Tool Exec",
                                tc.args.clone(),
                                json!({
                                    "error": reason,
                                    "hint": "Call tool_list to see the tools available to this agent."
                                }),
                                true,
                                0,
                                chrono::Utc::now(),
                            ));
                            continue;
                        }
                    }
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
                if nested_delegation_denied(&tc.name, delegation_allowed) {
                    ordered_results[index] = Some(normalize_tool_result(
                        tc.id.clone(), "spawn_agent", "Spawn Agent", tc.args.clone(),
                        json!({"error": "Nested delegation is disabled for sub-agents."}),
                        true, 0, chrono::Utc::now(),
                    ));
                    continue;
                }
                let mut resolved = tc.clone();
                resolved.args = normalize_direct_tool_args(&resolved.name, &resolved.args);
                pipeline_calls.push(PipelineCall {
                    index,
                    original: tc.clone(),
                    resolved,
                });
            }
        }
    }

    (ordered_results, pipeline_calls)
}

pub(super) fn cache_key_for(tool_call: &ToolCall) -> String {
    ToolCache::generate_key(&tool_call.name, &tool_call.args)
}

/// Read-side gate. Only deterministic, side-effect-free tools are cached —
/// see `crate::agent::cache::ttl_for_tool` for the allowlist.
pub(super) fn should_read_cache(tool_name: &str) -> bool {
    crate::agent::cache::ttl_for_tool(tool_name).is_some()
}

/// Write-side gate. Errors are never cached so retries can re-execute.
/// Otherwise restricted to the same allowlist as `should_read_cache`.
pub(super) fn should_write_cache(tool_name: &str, is_error: bool) -> bool {
    !is_error && crate::agent::cache::ttl_for_tool(tool_name).is_some()
}

#[allow(clippy::too_many_arguments)]
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

#[cfg(test)]
mod tests {
    use super::nested_delegation_denied;

    #[test]
    fn root_can_delegate() {
        assert!(!nested_delegation_denied("spawn_agent", true));
    }

    #[test]
    fn child_cannot_delegate_directly_or_via_tool_exec_resolution() {
        assert!(nested_delegation_denied("spawn_agent", false));
        assert!(nested_delegation_denied("spawn_agent", false));
        assert!(!nested_delegation_denied("web_search", false));
    }
}
