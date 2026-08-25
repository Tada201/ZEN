//! Text-mode tool-call parsing, handoff summaries, and stale-read pruning.

use zen_db::models::ChatMessage;


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
pub fn parse_text_tool_calls(content: &str) -> Option<Vec<zen_db::models::ToolCall>> {
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
pub fn try_parse_tool_json(json_str: &str) -> Option<zen_db::models::ToolCall> {
    let val: serde_json::Value = serde_json::from_str(json_str).ok()?;
    let obj = val.as_object()?;

    let is_tool_format = obj.contains_key("tool");
    let is_name_format = obj.contains_key("name") && obj.contains_key("arguments");

    if !is_tool_format && !is_name_format {
        return None;
    }

    let name = obj
        .get("tool")
        .and_then(|v| v.as_str())
        .or_else(|| obj.get("name").and_then(|v| v.as_str()))?;

    let args = obj
        .get("args")
        .or_else(|| obj.get("arguments"))
        .cloned()
        .unwrap_or(serde_json::json!({}));

    Some(zen_db::models::ToolCall {
        id: format!("call_{}", uuid::Uuid::new_v4()),
        name: name.to_string(),
        args,
    })
}

/// Scans the conversation backward, identifies files modified by mutating tool calls
/// (like write_file, edit_file, apply_patch), and rewrites previous read contents for those
/// files to elide stale code blocks from the prompt context.
pub fn prune_stale_reads(conversation: &mut [zen_db::models::ChatMessage]) {
    use std::collections::HashSet;

    let mut mutated_paths = HashSet::new();

    // 1. Gather all mutated paths from newest to oldest
    for msg in conversation.iter().rev() {
        if msg.role == "assistant" {
            if let Some(ref tool_calls) = msg.tool_calls {
                for tc in tool_calls {
                    match tc.name.as_str() {
                        "write_file" | "edit_file" => {
                            if let Some(path_val) = tc.args.get("file_path").and_then(|v| v.as_str()) {
                                mutated_paths.insert(path_val.to_string());
                            }
                        }
                        "apply_patch" => {
                            if let Some(patch_str) = tc.args.get("patch").and_then(|v| v.as_str()) {
                                if let Ok(hunks) = crate::patch_parser::parse_patches(patch_str) {
                                    for hunk in hunks {
                                        mutated_paths.insert(hunk.path().to_string_lossy().to_string());
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    if mutated_paths.is_empty() {
        return;
    }

    // 2. Iterate and elide stale read blocks
    for i in 0..conversation.len() {
        let is_tool_msg = conversation[i].role == "tool";
        if !is_tool_msg {
            continue;
        }

        let Some(ref tool_call_id) = conversation[i].tool_call_id else {
            continue;
        };

        // Find the corresponding tool call in previous messages
        let mut target_file_path = None;
        for prev_msg in conversation[..i].iter().rev() {
            if prev_msg.role == "assistant" {
                if let Some(ref tool_calls) = prev_msg.tool_calls {
                    if let Some(tc) = tool_calls.iter().find(|c| c.id == *tool_call_id) {
                        if tc.name == "read_document_content" || tc.name == "grep_documents" {
                            target_file_path = tc.args.get("file_path")
                                .or_else(|| tc.args.get("path"))
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                        }
                        break;
                    }
                }
            }
        }

        if let Some(ref path) = target_file_path {
            if mutated_paths.contains(path) {
                conversation[i].content = format!(
                    "[stale read output for '{}' elided — file has been subsequently modified by agent]",
                    path
                );
            }
        }
    }
}

#[cfg(test)]
mod text_tool_call_tests {
    use super::super::compact::compact_tool_result_for_context;
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

    #[test]
    fn compacts_duplicate_lines_without_losing_the_summary() {
        let input = format!("{}\nsummary: completed", "progress: waiting\n".repeat(80));
        let compacted = compact_tool_result_for_context(&input);
        assert!(compacted.contains("repeated lines removed"));
        assert!(compacted.contains("summary: completed"));
    }

    #[test]
    fn test_prune_stale_reads() {
        use zen_db::models::{ChatMessage, ToolCall};
        use serde_json::json;

        let mut conversation = vec![
            ChatMessage {
                role: "assistant".to_string(),
                content: "".to_string(),
                reasoning_details: None,
                images: None,
                tool_calls: Some(vec![ToolCall {
                    id: "call_1".to_string(),
                    name: "read_document_content".to_string(),
                    args: json!({ "file_path": "src/main.rs" }),
                }]),
                tool_call_id: None,
            },
            ChatMessage {
                role: "tool".to_string(),
                content: "fn original() {}".to_string(),
                reasoning_details: None,
                images: None,
                tool_calls: None,
                tool_call_id: Some("call_1".to_string()),
            },
            ChatMessage {
                role: "assistant".to_string(),
                content: "".to_string(),
                reasoning_details: None,
                images: None,
                tool_calls: Some(vec![ToolCall {
                    id: "call_2".to_string(),
                    name: "edit_file".to_string(),
                    args: json!({ "file_path": "src/main.rs", "old_text": "original", "new_text": "modified" }),
                }]),
                tool_call_id: None,
            },
            ChatMessage {
                role: "tool".to_string(),
                content: "success".to_string(),
                reasoning_details: None,
                images: None,
                tool_calls: None,
                tool_call_id: Some("call_2".to_string()),
            },
        ];

        super::prune_stale_reads(&mut conversation);

        assert!(conversation[1].content.contains("elided"));
        assert!(conversation[1].content.contains("src/main.rs"));
        assert_eq!(conversation[3].content, "success"); // Mutating output remains untouched
    }
}
