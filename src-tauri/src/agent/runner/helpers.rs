use crate::db::models::ChatMessage;
use lazy_static::lazy_static;

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
    conversation
        .iter()
        .map(|m| {
            let content_tokens = estimate_tokens(&m.content);
            let tool_call_tokens = m
                .tool_calls
                .as_ref()
                .map(|tc| {
                    tc.iter()
                        .map(|t| estimate_tokens(&t.args.to_string()))
                        .sum::<usize>()
                })
                .unwrap_or(0);
            content_tokens + tool_call_tokens
        })
        .sum()
}

/// Parse file change data from tool result (for write_file, edit_file)
pub fn parse_file_changes(
    result: &serde_json::Value,
) -> Option<Vec<crate::agent::types::FileChange>> {
    if let Some(obj) = result.as_object() {
        let change_type = obj.get("change_type")?.as_str()?;
        let path = obj.get("file_path")?.as_str()?;

        let lines_added = obj
            .get("lines_added")
            .and_then(|v| v.as_u64())
            .map(|n| n as usize);
        let lines_removed = obj
            .get("lines_removed")
            .and_then(|v| v.as_u64())
            .map(|n| n as usize);
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
            let truncated = format!(
                "{}... [truncated, {} bytes total]",
                &msg.content[..500],
                msg.content.len()
            );
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
        let current_tokens =
            estimate_conversation_tokens(&conversation[removable_start..removable_end]);
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

/// Parse text-mode tool calls from LLM response content.
/// Only looks inside fenced code blocks marked ```json or ```tool.
pub fn parse_text_tool_calls(content: &str) -> Option<Vec<crate::db::models::ToolCall>> {
    let mut calls = Vec::new();
    let mut search = content;
    while let Some(start) = search.find("```") {
        let after_fence = &search[start + 3..];
        let tag_end = after_fence.find('\n').unwrap_or(after_fence.len());
        let tag = after_fence[..tag_end].trim().to_lowercase();
        let json_start = if after_fence.starts_with('\n') {
            1
        } else {
            tag_end + 1
        };
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
    if calls.is_empty() {
        None
    } else {
        Some(calls)
    }
}

/// Remove only fenced blocks that are valid text-mode tool calls. Ordinary
/// JSON/code blocks remain visible to the user.
pub fn strip_text_tool_call_blocks(content: &str) -> String {
    let mut visible = String::with_capacity(content.len());
    let mut cursor = 0;

    while let Some(relative_start) = content[cursor..].find("```") {
        let start = cursor + relative_start;
        visible.push_str(&content[cursor..start]);

        let after_fence = &content[start + 3..];
        let Some(tag_end) = after_fence.find('\n') else {
            visible.push_str(&content[start..]);
            return visible;
        };
        let block_content = &after_fence[tag_end + 1..];
        let Some(relative_end) = block_content.find("```") else {
            visible.push_str(&content[start..]);
            return visible;
        };
        let end = start + 3 + tag_end + 1 + relative_end + 3;
        let tag = after_fence[..tag_end].trim().to_lowercase();
        let json_str = block_content[..relative_end].trim();
        let is_tool_call = (tag.is_empty() || tag == "json" || tag == "tool")
            && try_parse_tool_json(json_str).is_some();

        if !is_tool_call {
            visible.push_str(&content[start..end]);
        }
        cursor = end;
    }

    visible.push_str(&content[cursor..]);
    visible.trim().to_string()
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

#[cfg(test)]
mod text_tool_call_tests {
    use super::{parse_text_tool_calls, strip_text_tool_call_blocks};

    #[test]
    fn strips_tool_protocol_but_keeps_commentary() {
        let input = "I will inspect the board.\n```json\n{\"tool\":\"tool_list\",\"args\":{\"query\":\"board\"}}\n```\nContinuing now.";
        assert_eq!(
            strip_text_tool_call_blocks(input),
            "I will inspect the board.\n\nContinuing now."
        );
        assert_eq!(parse_text_tool_calls(input).unwrap().len(), 1);
    }

    #[test]
    fn preserves_normal_json_code_blocks() {
        let input = "```json\n{\"name\":\"Zen\"}\n```";
        assert_eq!(strip_text_tool_call_blocks(input), input);
    }
}
