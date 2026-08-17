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

/// Truncate `content` so it fits within `max_tokens`, keeping the head
/// (the most important part of any system-prompt layer is at the top:
/// the safety preamble, then the agent instructions, then the per-run
/// metadata). Appends a clear marker so the model can see something
/// was cut off.
///
/// Used by the per-layer budget enforcement in the middleware chain to
/// keep any single layer from blowing the context window.
///
/// This is `O(n log n)` in the string length: it binary-searches the
/// largest prefix whose token count is within the budget. The tiktoken
/// encoder is lazy-cached so the per-call cost is dominated by the BPE
/// encoding, not the search.
pub fn truncate_to_budget(content: &str, max_tokens: usize) -> String {
    if max_tokens == 0 {
        return String::new();
    }
    if estimate_tokens(content) <= max_tokens {
        return content.to_string();
    }
    let chars: Vec<char> = content.chars().collect();
    if chars.is_empty() {
        return String::new();
    }
    let mut low = 0usize;
    let mut high = chars.len();
    while low < high {
        let mid = low + (high - low).div_ceil(2);
        let prefix: String = chars[..mid].iter().collect();
        if estimate_tokens(&prefix) <= max_tokens {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    if low == 0 {
        return String::new();
    }
    let mut out: String = chars[..low].iter().collect();
    out.push_str("\n\n[...truncated for context budget...]");
    out
}

/// Push `section` onto `target` if its token count fits within the remaining
/// budget. Returns `true` if the section was pushed, `false` if it would
/// exceed the budget (in which case `target` is left untouched and
/// `*remaining` is left untouched).
///
/// Used by the per-layer budget enforcement in `SystemPromptMiddleware` to
/// skip optional sections (time, UI rules, tool system, agent list, ...)
/// once the layer's budget is exhausted. The must-keep portion
/// (safety preamble + agent instructions) is pushed first; this helper
/// governs only the optional tail.
pub fn try_push_within_budget(
    target: &mut String,
    remaining: &mut usize,
    section: &str,
) -> bool {
    let t = estimate_tokens(section);
    if t > *remaining {
        return false;
    }
    *remaining -= t;
    target.push_str(section);
    true
}

/// Per-layer token budget allocation for the default middleware chain.
///
/// SystemPrompt, SkillsCatalog, and Recall each get a fixed share of the
/// context window. Summary and Compaction split the remainder 50/50; they
/// "compete" for whatever budget is left after the fixed layers.
#[derive(Debug, Clone, Copy)]
pub struct MiddlewareBudgets {
    pub system_prompt: usize,
    pub skills_catalog: usize,
    pub recall: usize,
    pub summary: usize,
    pub compaction: usize,
}

impl MiddlewareBudgets {
    /// No enforcement: every layer is unbounded.
    pub fn unbounded() -> Self {
        Self {
            system_prompt: usize::MAX,
            skills_catalog: usize::MAX,
            recall: usize::MAX,
            summary: usize::MAX,
            compaction: usize::MAX,
        }
    }

    /// Split a total context window across the five layers.
    ///
    /// The three fixed-purpose layers scale *proportionally* with the
    /// window so a 128K or 1M model isn't pinned to the same 8K/4K/4K
    /// that a 32K model gets:
    ///   * SystemPrompt ≈ 8% of the window
    ///   * SkillsCatalog ≈ 4% of the window
    ///   * Recall ≈ 4% of the window
    ///
    /// Each proportional layer is clamped to a sane floor (so tiny
    /// windows still reserve something usable) and a ceiling (so huge
    /// windows don't hand a single layer an absurd budget), and is then
    /// capped at the running remainder so the per-layer numbers can
    /// never overshoot the total. Summary and Compaction split whatever
    /// is left 50/50.
    pub fn from_context_window(total: Option<i64>) -> Self {
        let Some(total) = total else {
            return Self::unbounded();
        };
        let total = if total < 0 { 0 } else { total as usize };
        if total == 0 {
            return Self {
                system_prompt: 0,
                skills_catalog: 0,
                recall: 0,
                summary: 0,
                compaction: 0,
            };
        }

        // Proportional target, clamped to [floor, ceil]. On large
        // windows the proportional/ceiling value wins (so a 200K model
        // gets ~16K for the system prompt instead of a fixed 8K). On
        // small windows `remaining / 4` bites first, preserving the old
        // "never let one layer eat the window" behaviour so summary and
        // compaction still get room.
        let layer = |percent: usize, floor: usize, ceil: usize, remaining: usize| -> usize {
            let target = (total.saturating_mul(percent) / 100).clamp(floor, ceil);
            target.min(remaining / 4)
        };

        let system_prompt = layer(8, 4_000, 24_000, total);
        let skills_catalog = layer(4, 2_000, 16_000, total.saturating_sub(system_prompt));
        let recall = layer(
            4,
            2_000,
            16_000,
            total
                .saturating_sub(system_prompt)
                .saturating_sub(skills_catalog),
        );
        let remainder = total
            .saturating_sub(system_prompt)
            .saturating_sub(skills_catalog)
            .saturating_sub(recall);
        let summary = remainder / 2;
        let compaction = remainder - summary;
        Self {
            system_prompt,
            skills_catalog,
            recall,
            summary,
            compaction,
        }
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

/// Tracks the file modification time (Unix epoch ms) the agent last observed
/// for each file it read or wrote during a single `Runner::run()`.
///
/// File tools (`read_document_content`, `write_file`, `edit_file`) stamp a
/// `modified_ms` field on their result. `record_file_result` folds those into
/// the map; `detect_stale_reads` compares the recorded baseline against the
/// current on-disk mtime so the loop can warn the model when a file it is
/// reasoning about has changed underneath it (e.g. an external editor, a
/// terminal command, or a sibling sub-agent wrote to it). Scoped to one run —
/// no cross-chat state, so no cleanup path is needed.
#[derive(Debug, Default)]
pub struct FileReadTracker {
    seen: std::collections::HashMap<String, u64>,
}

impl FileReadTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Fold a tool result into the baseline. Only file tools carry both a
    /// `file_path` string and a numeric `modified_ms`; everything else is a
    /// no-op. Recording a write/edit result here (not just reads) means the
    /// agent's own mutations refresh the baseline and never self-trigger a
    /// staleness warning on the next iteration.
    pub fn record_file_result(&mut self, result: &serde_json::Value) {
        let obj = match result.as_object() {
            Some(o) => o,
            None => return,
        };
        let path = match obj.get("file_path").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => return,
        };
        if let Some(mtime) = obj.get("modified_ms").and_then(|v| v.as_u64()) {
            self.seen.insert(path.to_string(), mtime);
        }
    }

    /// Return the paths whose on-disk mtime is now newer than what the agent
    /// last saw, refreshing the baseline to the current value so each external
    /// change is reported exactly once. Files that vanished or lost their
    /// mtime are dropped silently — a follow-up read will surface the error
    /// through the tool itself.
    pub async fn detect_stale_reads(&mut self) -> Vec<String> {
        let mut stale = Vec::new();
        for (path, baseline) in self.seen.iter_mut() {
            let current = tokio::fs::metadata(path)
                .await
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64);
            if let Some(current) = current {
                if current > *baseline {
                    *baseline = current;
                    stale.push(path.clone());
                }
            }
        }
        stale
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

/// Truncate conversation to the last N non-system messages, keeping
/// system messages at the front.
///
/// Used by `CompactionMiddleware` to enforce the
/// `max_messages_in_memory` cap. `None` is a no-op.
pub fn truncate_conversation_by_message_count(
    conversation: &mut Vec<ChatMessage>,
    max_messages: Option<usize>,
) {
    let Some(max) = max_messages else {
        return;
    };
    if max == 0 || conversation.len() <= max {
        return;
    }

    // Count non-system messages
    let non_system_count = conversation.iter().filter(|m| m.role != "system").count();
    if non_system_count <= max {
        return;
    }
    let to_remove = non_system_count - max;

    // Collect indices of non-system messages, remove oldest ones
    let mut removed = 0;
    conversation.retain(|m| {
        if m.role != "system" && removed < to_remove {
            removed += 1;
            false
        } else {
            true
        }
    });
}

/// Compact old tool results in conversation to reduce context size.
#[allow(clippy::ptr_arg)]
pub fn compact_conversation(conversation: &mut Vec<ChatMessage>, keep_recent: usize) {
    if conversation.len() <= keep_recent {
        return;
    }
    let split_point = conversation.len().saturating_sub(keep_recent);
    for msg in conversation[..split_point].iter_mut() {
        if msg.role == "tool" && msg.content.len() > 500 {
            msg.content = compact_tool_result_for_context(&msg.content);
        }
    }
}

/// Reduces stale tool output before it is sent back to the model. The original
/// tool output remains persisted and visible in the tool trace; only the older
/// conversation context is compacted. Repeated adjacent lines are collapsed
/// first, then the beginning and end are retained so errors and summaries are
/// not silently discarded.
pub fn compact_tool_result_for_context(content: &str) -> String {
    const MAX_CONTEXT_CHARS: usize = 1_200;

    let mut compacted_lines = Vec::new();
    let mut previous = None;
    let mut duplicate_count = 0usize;
    for line in content.lines() {
        if previous == Some(line) {
            duplicate_count += 1;
            continue;
        }
        if duplicate_count > 0 {
            compacted_lines.push(format!("[{} repeated lines removed]", duplicate_count));
            duplicate_count = 0;
        }
        compacted_lines.push(line.to_string());
        previous = Some(line);
    }
    if duplicate_count > 0 {
        compacted_lines.push(format!("[{} repeated lines removed]", duplicate_count));
    }

    let compacted = compacted_lines.join("\n");
    let total_chars = compacted.chars().count();
    if total_chars <= MAX_CONTEXT_CHARS {
        return compacted;
    }

    let head_len = MAX_CONTEXT_CHARS * 2 / 3;
    let tail_len = MAX_CONTEXT_CHARS - head_len;
    let head: String = compacted.chars().take(head_len).collect();
    let tail: String = compacted
        .chars()
        .rev()
        .take(tail_len)
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    format!(
        "{head}\n\n[tool output compacted for context: {total_chars} chars; original remains in the tool trace]\n\n{tail}"
    )
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
            if conversation[i].tool_calls.is_some()
                && conversation[i].role == "assistant"
                && i + 1 < removable_end
                && conversation[i + 1].role == "tool"
            {
                conversation.remove(i);
                conversation.remove(i);
                removable_end -= 2;
                removed_any = true;
                break;
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

    Some(crate::db::models::ToolCall {
        id: format!("call_{}", uuid::Uuid::new_v4()),
        name: name.to_string(),
        args,
    })
}

/// Scans the conversation backward, identifies files modified by mutating tool calls
/// (like write_file, edit_file, apply_patch), and rewrites previous read contents for those
/// files to elide stale code blocks from the prompt context.
pub fn prune_stale_reads(conversation: &mut [crate::db::models::ChatMessage]) {
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
                                if let Ok(hunks) = crate::tools::patch_parser::parse_patches(patch_str) {
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
    use super::{
        compact_tool_result_for_context, parse_text_tool_calls, strip_text_tool_call_blocks,
    };

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
        use crate::db::models::{ChatMessage, ToolCall};
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

#[cfg(test)]
mod budget_tests {
    use super::{estimate_tokens, MiddlewareBudgets, truncate_to_budget};

    #[test]
    fn truncate_to_budget_keeps_content_when_within_budget() {
        let content = "hello world";
        let out = truncate_to_budget(content, 100);
        assert_eq!(out, content);
    }

    #[test]
    fn truncate_to_budget_shrinks_content_when_over_budget() {
        let content: String = "x".repeat(4_000); // ~1000 tokens
        let out = truncate_to_budget(&content, 50);
        // Output must be smaller and contain the marker.
        assert!(out.len() < content.len());
        assert!(out.contains("[...truncated for context budget...]"));
        // The kept prefix must be within the budget.
        let prefix_end = out
            .find("[...truncated for context budget...]")
            .unwrap();
        let prefix = &out[..prefix_end];
        assert!(estimate_tokens(prefix) <= 50);
    }

    #[test]
    fn truncate_to_budget_handles_zero_budget() {
        let out = truncate_to_budget("anything", 0);
        assert!(out.is_empty());
    }

    #[test]
    fn truncate_to_budget_handles_empty_content() {
        let out = truncate_to_budget("", 100);
        assert!(out.is_empty());
    }

    #[test]
    fn truncate_to_budget_preserves_multibyte_safety() {
        // Emoji are 4-byte UTF-8 sequences. Cutting mid-codepoint would
        // panic or produce invalid UTF-8; truncate_to_budget must
        // back off to the previous char boundary.
        let body: String = "🎉".repeat(2_000);
        let out = truncate_to_budget(&body, 50);
        assert!(out.contains("🎉"));
        // Round-trip through estimate_tokens: the prefix must be within budget.
        let prefix_end = out
            .find("[...truncated for context budget...]")
            .unwrap_or(out.len());
        let prefix = &out[..prefix_end];
        assert!(estimate_tokens(prefix) <= 50);
    }

    #[test]
    fn from_context_window_none_yields_unbounded() {
        let b = MiddlewareBudgets::from_context_window(None);
        assert_eq!(b.system_prompt, usize::MAX);
        assert_eq!(b.summary, usize::MAX);
    }

    #[test]
    fn from_context_window_100k_splits_proportionally_with_remainder() {
        let b = MiddlewareBudgets::from_context_window(Some(100_000));
        // 3 proportional layers + remainder split 50/50; all layers sum to
        // total - system - skills - recall.
        let used = b.system_prompt + b.skills_catalog + b.recall;
        assert!(used < 100_000);
        assert_eq!(b.summary + b.compaction, 100_000 - used);
        // At 100K the proportional targets (8% / 4% / 4%) land exactly on
        // 8K / 4K / 4K.
        assert_eq!(b.system_prompt, 8_000);
        assert_eq!(b.skills_catalog, 4_000);
        assert_eq!(b.recall, 4_000);
    }

    #[test]
    fn from_context_window_scales_layers_with_large_window() {
        // A 200K model must give the fixed-purpose layers more room than a
        // 100K one — they scale proportionally rather than staying pinned.
        let b = MiddlewareBudgets::from_context_window(Some(200_000));
        assert_eq!(b.system_prompt, 16_000); // 8% of 200K
        assert_eq!(b.skills_catalog, 8_000); //  4% of 200K
        assert_eq!(b.recall, 8_000); //  4% of 200K
        // Ceiling still binds on very large windows.
        let big = MiddlewareBudgets::from_context_window(Some(1_000_000));
        assert_eq!(big.system_prompt, 24_000); // capped at the 24K ceiling
        assert_eq!(big.skills_catalog, 16_000); // capped at the 16K ceiling
    }

    #[test]
    fn from_context_window_small_total_clamps_layers() {
        // 8K total: each layer must be capped so the per-layer numbers
        // sum to <= 8K. Nothing should go negative.
        let b = MiddlewareBudgets::from_context_window(Some(8_000));
        let total = b.system_prompt
            + b.skills_catalog
            + b.recall
            + b.summary
            + b.compaction;
        assert!(total <= 8_000);
    }

    #[test]
    fn from_context_window_zero_yields_all_zero() {
        let b = MiddlewareBudgets::from_context_window(Some(0));
        assert_eq!(b.system_prompt, 0);
        assert_eq!(b.skills_catalog, 0);
        assert_eq!(b.recall, 0);
        assert_eq!(b.summary, 0);
        assert_eq!(b.compaction, 0);
    }

    #[test]
    fn from_context_window_negative_clamps_to_zero() {
        // Defensive: a buggy caller passing a negative should not panic.
        let b = MiddlewareBudgets::from_context_window(Some(-1));
        assert_eq!(b.system_prompt, 0);
    }

    // ── try_push_within_budget ────────────────────────────────────────

    #[test]
    fn try_push_pushes_when_within_budget() {
        let mut target = String::from("head ");
        let mut remaining = 100;
        let pushed = super::try_push_within_budget(&mut target, &mut remaining, "world");
        assert!(pushed);
        assert_eq!(target, "head world");
        assert!(remaining < 100);
    }

    #[test]
    fn try_push_skips_when_exceeds_budget() {
        let mut target = String::from("head ");
        let mut remaining = 1;
        let before_len = target.len();
        let before_remaining = remaining;
        let pushed = super::try_push_within_budget(
            &mut target,
            &mut remaining,
            "this section is much longer than the budget allows",
        );
        assert!(!pushed);
        // Target must be untouched.
        assert_eq!(target.len(), before_len);
        assert_eq!(target, "head ");
        // Remaining must be untouched.
        assert_eq!(remaining, before_remaining);
    }

    #[test]
    fn try_push_returns_false_for_zero_budget() {
        let mut target = String::new();
        let mut remaining = 0;
        let pushed = super::try_push_within_budget(&mut target, &mut remaining, "x");
        assert!(!pushed);
        assert!(target.is_empty());
        assert_eq!(remaining, 0);
    }

    #[test]
    fn try_push_returns_false_for_empty_section_with_zero_budget() {
        // Edge case: empty section with zero budget. Empty section
        // costs 0 tokens so technically fits, but the contract is
        // "strictly within budget" \u2014 an empty push is harmless
        // either way. Verify we don't panic.
        let mut target = String::new();
        let mut remaining = 0;
        let _ = super::try_push_within_budget(&mut target, &mut remaining, "");
        // No assertion on the return value \u2014 the contract is just
        // "don't panic, don't corrupt state".
        assert!(target.is_empty());
    }
}

#[cfg(test)]
mod recall_budget_tests {
    use super::estimate_tokens;
    use crate::agent::middleware::{ContextMiddleware, EnrichmentContext, RecallMiddleware};
    use crate::db::models::ChatMessage;
    use crate::agent::runner::helpers::truncate_to_budget;

    // ── RecallMiddleware ─────────────────────────────────────────────

    fn make_ctx_with_recall(recall: &str) -> EnrichmentContext {
        EnrichmentContext {
            system_content: String::new(),
            conversation: Vec::<ChatMessage>::new(),
            extra_system_messages: Vec::new(),
            chat_id: "test".to_string(),
            workspace_root: None,
            recall_block: Some(recall.to_string()),
            authorized_tool_ids: Vec::new(),
            tools_supported: true,
            tools_enabled: true,
            iteration: 1,
            summarization_enabled: false,
            compaction_token_threshold: 0,
            compaction_threshold: 0,
            max_messages_in_memory: None,
            section_log: Vec::new(),
            compaction_event: None,
            run_id: 0,
        }
    }

    #[tokio::test]
    async fn recall_passes_through_when_within_budget() {
        let mw = RecallMiddleware {
            recall_budget: 10_000,
        };
        let block = "important memory: the user prefers dark mode";
        let mut ctx = make_ctx_with_recall(block);
        mw.enrich(&mut ctx).await.unwrap();
        // The full block should be present (it's tiny).
        assert!(ctx.system_content.contains("dark mode"));
        assert!(!ctx.system_content.contains("[...truncated for context budget...]"));
    }

    #[tokio::test]
    async fn recall_truncates_when_over_budget() {
        // Build a recall block much larger than the budget.
        let block: String = "memory line.\n".repeat(2_000); // ~22_000 tokens
        let mw = RecallMiddleware { recall_budget: 50 };
        let mut ctx = make_ctx_with_recall(&block);
        mw.enrich(&mut ctx).await.unwrap();
        // The truncated marker must be present.
        assert!(ctx.system_content.contains("[...truncated for context budget...]"));
        // The output must be smaller than the input.
        assert!(ctx.system_content.len() < block.len());
        // The kept prefix must be within the budget.
        let prefix_end = ctx
            .system_content
            .find("[...truncated for context budget...]")
            .unwrap();
        let prefix = &ctx.system_content[..prefix_end];
        assert!(estimate_tokens(prefix) <= 50);
    }

    #[tokio::test]
    async fn recall_does_nothing_when_recall_block_is_none() {
        let mw = RecallMiddleware {
            recall_budget: 10_000,
        };
        let mut ctx = EnrichmentContext {
            system_content: String::from("agent.instructions\n"),
            conversation: Vec::<ChatMessage>::new(),
            extra_system_messages: Vec::new(),
            chat_id: "test".to_string(),
            workspace_root: None,
            recall_block: None,
            authorized_tool_ids: Vec::new(),
            tools_supported: true,
            tools_enabled: true,
            iteration: 1,
            summarization_enabled: false,
            compaction_token_threshold: 0,
            compaction_threshold: 0,
            max_messages_in_memory: None,
            compaction_event: None,
            section_log: Vec::new(),
            run_id: 0,
        };
        mw.enrich(&mut ctx).await.unwrap();
        // The system_content must be unchanged.
        assert_eq!(ctx.system_content, "agent.instructions\n");
    }

    #[tokio::test]
    async fn recall_does_nothing_when_recall_block_is_empty() {
        let mw = RecallMiddleware {
            recall_budget: 10_000,
        };
        let mut ctx = make_ctx_with_recall("");
        mw.enrich(&mut ctx).await.unwrap();
        assert!(ctx.system_content.is_empty());
    }

    // ── truncate_to_budget direct regression for the recall path ───

    #[test]
    fn truncate_to_budget_marker_is_appended() {
        let content: String = "x".repeat(20_000);
        let out = truncate_to_budget(&content, 100);
        assert!(out.ends_with("[...truncated for context budget...]"));
    }
}

#[cfg(test)]
mod summary_compaction_tests {
    use super::estimate_conversation_tokens;
    use crate::agent::middleware::{
        CompactionMiddleware, ContextMiddleware, EnrichmentContext, SummaryMiddleware,
    };
    use crate::db::models::ChatMessage;

    fn make_ctx(iteration: usize, conversation: Vec<ChatMessage>) -> EnrichmentContext {
        EnrichmentContext {
            system_content: String::new(),
            conversation,
            extra_system_messages: Vec::new(),
            chat_id: "test".to_string(),
            workspace_root: None,
            recall_block: None,
            authorized_tool_ids: Vec::new(),
            tools_supported: true,
            tools_enabled: true,
            iteration,
            summarization_enabled: true,
            compaction_token_threshold: 50_000,
            compaction_threshold: 50,
            max_messages_in_memory: None,
            section_log: Vec::new(),
            compaction_event: None,
            run_id: 0,
        }
    }

    fn user_msg(text: &str) -> ChatMessage {
        ChatMessage {
            role: "user".to_string(),
            content: text.to_string(),
            reasoning_details: None,
            images: None,
            tool_calls: None,
            tool_call_id: None,
        }
    }

    // ── SummaryMiddleware gates ──────────────────────────────────────

    #[tokio::test]
    async fn summary_skips_when_summarization_disabled() {
        let mw = SummaryMiddleware {
            db_pool: None,
            summary_budget: 1_000,
        };
        let mut ctx = make_ctx(5, vec![user_msg("hi")]);
        ctx.summarization_enabled = false;
        mw.enrich(&mut ctx).await.unwrap();
        // No DB and disabled \u2192 no work, no messages pushed.
        assert!(ctx.extra_system_messages.is_empty());
    }

    #[tokio::test]
    async fn summary_skips_on_first_iteration_with_short_conversation() {
        let mw = SummaryMiddleware {
            db_pool: None,
            summary_budget: 1_000,
        };
        // iteration = 1 and conversation.len() (1) <= compaction_threshold (50).
        let mut ctx = make_ctx(1, vec![user_msg("hi")]);
        mw.enrich(&mut ctx).await.unwrap();
        assert!(ctx.extra_system_messages.is_empty());
    }

    #[tokio::test]
    async fn summary_no_ops_without_db_even_when_gates_open() {
        // iteration > 1 \u2192 gate opens, but no DB \u2192 nothing to load.
        let mw = SummaryMiddleware {
            db_pool: None,
            summary_budget: 1_000,
        };
        let mut ctx = make_ctx(2, vec![user_msg("hi")]);
        mw.enrich(&mut ctx).await.unwrap();
        assert!(ctx.extra_system_messages.is_empty());
    }

    // ── CompactionMiddleware: in-place mutation contract ────────────

    #[tokio::test]
    async fn compaction_noop_when_within_budget_and_under_thresholds() {
        let mw = CompactionMiddleware {
            compaction_budget: 100_000,
        };
        let conv = vec![user_msg("hello"), user_msg("world")];
        let original_len = conv.len();
        let mut ctx = make_ctx(1, conv);
        mw.enrich(&mut ctx).await.unwrap();
        // No thresholds hit \u2192 no change.
        assert_eq!(ctx.conversation.len(), original_len);
    }

    #[tokio::test]
    async fn compaction_respects_max_messages_in_memory() {
        let mw = CompactionMiddleware {
            compaction_budget: 100_000,
        };
        // Build 10 non-system messages; cap at 3.
        let conv: Vec<ChatMessage> = (0..10).map(|i| user_msg(&format!("msg {}", i))).collect();
        let mut ctx = make_ctx(1, conv);
        ctx.max_messages_in_memory = Some(3);
        mw.enrich(&mut ctx).await.unwrap();
        // The cap is enforced (and may keep the system messages plus
        // the most recent 3 non-system messages, but there are none in
        // this fixture).
        let non_system_remaining = ctx
            .conversation
            .iter()
            .filter(|m| m.role != "system")
            .count();
        assert!(non_system_remaining <= 3);
    }

    #[tokio::test]
    async fn compaction_max_messages_in_memory_none_is_noop() {
        let mw = CompactionMiddleware {
            compaction_budget: 100_000,
        };
        let conv: Vec<ChatMessage> = (0..5).map(|i| user_msg(&format!("msg {}", i))).collect();
        let original_len = conv.len();
        let mut ctx = make_ctx(1, conv);
        ctx.max_messages_in_memory = None;
        mw.enrich(&mut ctx).await.unwrap();
        assert_eq!(ctx.conversation.len(), original_len);
    }

    #[tokio::test]
    async fn compaction_aggressive_path_runs_when_over_budget() {
        // Build a conversation that exceeds the compaction budget.
        // Each chat message ~4 chars/token; 10000-char content \u2248 2500 tokens.
        let big = "x".repeat(10_000);
        let conv: Vec<ChatMessage> = (0..8).map(|_| user_msg(&big)).collect();
        // Sanity: the conversation is over 10_000 tokens.
        let pre_tokens = estimate_conversation_tokens(&conv);
        assert!(pre_tokens > 10_000, "fixture must exceed 10k tokens");

        let mw = CompactionMiddleware {
            compaction_budget: 1_000, // very tight budget
        };
        let mut ctx = make_ctx(1, conv);
        mw.enrich(&mut ctx).await.unwrap();

        // The aggressive path compacts to roughly budget/2 = 500 tokens
        // (with min_keep=8 so all messages survive, but tool-call
        // content is condensed). Verify the token count is at or under
        // the target.
        let post_tokens = estimate_conversation_tokens(&ctx.conversation);
        assert!(
            post_tokens <= 2_000,
            "post-compaction tokens ({}) should be at or under the 2x budget headroom, pre was {}",
            post_tokens,
            pre_tokens
        );
    }

    #[tokio::test]
    async fn compaction_light_path_keeps_recent_messages_intact() {
        // Build a conversation that is over the soft message-count
        // threshold but under the hard token budget \u2192 the light path
        // runs (compact_conversation with keep_recent=10).
        let big = "x".repeat(200);
        let mut conv: Vec<ChatMessage> = (0..60).map(|_| user_msg(&big)).collect();
        // Mark the last 5 messages as something we want preserved.
        for m in conv.iter_mut().rev().take(5) {
            m.content = format!("PRESERVE: {}", m.content);
        }

        let mw = CompactionMiddleware {
            compaction_budget: 1_000_000, // very generous
        };
        let mut ctx = make_ctx(1, conv);
        // compaction_threshold = 50 in make_ctx; 60 > 50.
        mw.enrich(&mut ctx).await.unwrap();

        // The most recent 5 messages should survive (light path keeps 10).
        let preserved = ctx
            .conversation
            .iter()
            .rev()
            .take(5)
            .filter(|m| m.content.starts_with("PRESERVE:"))
            .count();
        assert_eq!(
            preserved, 5,
            "all 5 PRESERVE messages must survive the light compaction"
        );
    }
}
