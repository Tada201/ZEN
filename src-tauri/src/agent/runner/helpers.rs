use crate::db::models::ChatMessage;
use lazy_static::lazy_static;
use serde_json::json;
use std::collections::HashSet;
use std::sync::Arc;
use tauri::AppHandle;
use tokio_util::sync::CancellationToken;

lazy_static! {
    pub static ref BPE: Option<tiktoken_rs::CoreBPE> = tiktoken_rs::cl100k_base().ok();
}

/// Accurate token estimation using tiktoken (cl100k_base)
pub fn estimate_tokens(text: &str) -> usize {
    if let Some(bpe) = &*BPE {
        bpe.encode_with_special_tokens(text).len()
    } else {
        // Fallback: 1 token â‰ˆ 4 chars
        text.len() / 4
    }
}

/// Estimate total tokens in a conversation (simplified heuristic)
pub fn estimate_conversation_tokens(conversation: &[ChatMessage]) -> usize {
    conversation.iter().map(|m| {
        let content_tokens = estimate_tokens(&m.content);
        let tool_call_tokens = m.tool_calls.as_ref().map(|tc| {
            tc.iter().map(|t| estimate_tokens(&t.args.to_string())).sum::<usize>()
        }).unwrap_or(0);
        content_tokens + tool_call_tokens
    }).sum()
}

/// Parse file change data from tool result (for write_file, edit_file)
pub fn parse_file_changes(result: &serde_json::Value) -> Option<Vec<crate::agent::types::FileChange>> {
    if let Some(obj) = result.as_object() {
        let change_type = obj.get("change_type")?.as_str()?;
        let path = obj.get("file_path")?.as_str()?;

        let lines_added = obj.get("lines_added").and_then(|v| v.as_u64()).map(|n| n as usize);
        let lines_removed = obj.get("lines_removed").and_then(|v| v.as_u64()).map(|n| n as usize);
        let diff = obj.get("diff").and_then(|v| v.as_str()).map(String::from);

        Some(vec![crate::agent::types::FileChange {
            path: path.to_string(),
            change_type: change_type.to_string(),
            lines_added,
            lines_removed,
            diff,
        }])
    } else {
        None
    }
}

/// Detect whether an error is caused by the model lacking tool-call support.
pub fn is_tool_capability_error(error: &str) -> bool {
    let lower = error.to_lowercase();
    lower.contains("no endpoints found that support tool use")
        || lower.contains("does not support tool use")
        || lower.contains("function calling") && lower.contains("not supported")
        || lower.contains("tools are not supported")
        || lower.contains("tool use is not supported")
        || lower.contains("this model does not support")
        || lower.contains("disable") && lower.contains("web_search")
}

/// Compact old tool results in conversation to reduce context size.
pub fn compact_conversation(conversation: &mut Vec<ChatMessage>, keep_recent: usize) {
    if conversation.len() <= keep_recent {
        return;
    }
    let split_point = conversation.len().saturating_sub(keep_recent);
    for msg in conversation[..split_point].iter_mut() {
        if msg.role == "tool" && msg.content.len() > 500 {
            let truncated = format!("{}... [truncated, {} bytes total]", &msg.content[..500], msg.content.len());
            msg.content = truncated;
        }
    }
}

/// Token-aware conversation compaction (fixes #23)
/// Removes oldest tool result pairs first until under target token limit
pub fn compact_conversation_token_aware(
    conversation: &mut Vec<ChatMessage>,
    min_keep: usize,
    target_tokens: usize,
) {
    // Always keep system prompt and first user message
    let removable_start = 2;
    let mut removable_end = conversation.len();

    while removable_end - removable_start > min_keep {
        let current_tokens = estimate_conversation_tokens(&conversation[removable_start..removable_end]);
        if current_tokens <= target_tokens {
            break;
        }

        let mut removed_any = false;
        for i in removable_start..removable_end.saturating_sub(1) {
            if conversation[i].tool_calls.is_some() && conversation[i].role == "assistant" {
                if i + 1 < removable_end && conversation[i + 1].role == "tool" {
                    conversation.remove(i);
                    conversation.remove(i);
                    removable_end -= 2;
                    removed_any = true;
                    break;
                }
            }
        }

        if !removed_any {
            if removable_end - removable_start > min_keep {
                conversation.remove(removable_start);
                removable_end -= 1;
            } else {
                break;
            }
        }
    }
}

/// Generate a concise summary of what the outgoing agent accomplished
pub fn generate_handoff_summary(
    conversation: &[ChatMessage],
    _agent_name: &str,
    _handoff_args: &serde_json::Value,
) -> String {
    let mut tools_used = Vec::new();
    let mut last_content = String::new();

    for msg in conversation.iter().rev().take(10) {
        if msg.role == "assistant" {
            if let Some(ref tool_calls) = msg.tool_calls {
                for tc in tool_calls {
                    if !tools_used.contains(&tc.name) {
                        tools_used.push(tc.name.clone());
                    }
                }
            }
            if last_content.is_empty() && !msg.content.trim().is_empty() {
                last_content = msg.content.chars().take(100).collect();
            }
        }
    }

    let mut summary_parts = Vec::new();
    if !tools_used.is_empty() {
        summary_parts.push(format!("Used: {}", tools_used.join(", ")));
    }
    if !last_content.is_empty() {
        summary_parts.push(format!("Found: {}", last_content));
    }
    if summary_parts.is_empty() {
        summary_parts.push("No actions taken".to_string());
    }

    summary_parts.join(" | ")
}

/// Execute a single tool call (shared by Allow and Modify paths).
pub async fn execute_single_tool(
    tool: Option<Arc<dyn crate::agent::tools::AgentTool>>,
    app: AppHandle,
    chat_id: String,
    tc_id: String,
    tc_name: String,
    args: serde_json::Value,
    token: CancellationToken,
    _agent_id: String,
    _agent_name: String,
    depth: u32,
    allowed_tools: Option<Arc<tokio::sync::Mutex<HashSet<String>>>>,
) -> crate::agent::types::ToolResult {
    if let Some(tool) = tool {
        let tool_run_future = tool.run(app.clone(), chat_id, args, depth, allowed_tools, token.clone());

        let result_outcome = tokio::select! {
            res = tokio::time::timeout(std::time::Duration::from_secs(tool.timeout_seconds()), tool_run_future) => {
                match res {
                    Ok(Ok(mut val)) => {
                        let s = val.to_string();
                        if s.len() > 200 * 1024 {
                            tracing::warn!("Tool output too large ({} bytes), truncating to 200KB", s.len());
                            let suffix = format!("... [TRUNCATED DUE TO SIZE ({} bytes)]", s.len());
                            let max_bytes = 200 * 1024;
                            let max_content_bytes = max_bytes.saturating_sub(suffix.len());
                            let mut truncated = String::new();
                            let mut byte_count = 0;
                            for c in s.chars() {
                                let char_len = c.len_utf8();
                                if byte_count + char_len > max_content_bytes {
                                    break;
                                }
                                truncated.push(c);
                                byte_count += char_len;
                            }
                            val = json!(format!("{}{}", truncated, suffix));
                        }
                        Ok(val)
                    },
                    Ok(Err(e)) => Err(format!("Tool error: {}", e)),
                    Err(_) => Err(format!("Tool execution timed out after {}s", tool.timeout_seconds())),
                }
            },
            _ = token.cancelled() => {
                Err("Tool execution cancelled by user".to_string())
            }
        };

        match result_outcome {
            Ok(val) => crate::agent::types::ToolResult { tool_call_id: tc_id, content: val, is_error: false, duration_ms: 0 },
            Err(e) => crate::agent::types::ToolResult {
                tool_call_id: tc_id.clone(),
                content: json!({
                    "error": e,
                    "tool": tc_name,
                    "hint": "This tool call failed or was interrupted. You may retry with different arguments or approach."
                }),
                is_error: true,
                duration_ms: 0,
            },
        }
    } else {
        crate::agent::types::ToolResult {
            tool_call_id: tc_id,
            content: json!({
                "error": format!("Tool '{}' not found", tc_name),
                "available_tools": "Use handoff_to_agent if you need a specialized expert."
            }),
            is_error: true,
            duration_ms: 0,
        }
    }
}

/// Parse text-mode tool calls from LLM response content.
/// Only looks inside fenced code blocks marked ```json or ```tool.
pub fn parse_text_tool_calls(content: &str) -> Option<Vec<crate::db::models::ToolCall>> {
    let mut calls = Vec::new();
    let mut search = content;
    while let Some(start) = search.find("```") {
        let after_fence = &search[start + 3..];
        let tag_end = after_fence.find('\n').unwrap_or(after_fence.len());
        let tag = after_fence[..tag_end].trim().to_lowercase();
        let json_start = if after_fence.starts_with('\n') { 1 } else { tag_end + 1 };
        let block_content = &after_fence[json_start..];
        if let Some(end) = block_content.find("```") {
            let json_str = block_content[..end].trim();
            if tag.is_empty() || tag == "json" || tag == "tool" {
                if let Some(tc) = try_parse_tool_json(json_str) {
                    calls.push(tc);
                }
            }
            search = &block_content[end + 3..];
        } else {
            break;
        }
    }
    if calls.is_empty() { None } else { Some(calls) }
}

/// Try to parse a JSON string as a tool call with "tool" and "args" keys.
pub fn try_parse_tool_json(json_str: &str) -> Option<crate::db::models::ToolCall> {
    let val: serde_json::Value = serde_json::from_str(json_str).ok()?;
    let obj = val.as_object()?;
    let name = obj.get("tool").and_then(|v| v.as_str())?;
    let args = obj.get("args").cloned().unwrap_or(serde_json::json!({}));
    Some(crate::db::models::ToolCall {
        id: format!("call_{}", uuid::Uuid::new_v4()),
        name: name.to_string(),
        args,
    })
}
