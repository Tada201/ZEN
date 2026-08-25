//! Conversation compaction and tool-result / file-change bookkeeping.

use super::budget::estimate_conversation_tokens;
use zen_db::models::ChatMessage;


/// Parse file change data from tool result (for write_file, edit_file)
pub fn parse_file_changes(
    result: &serde_json::Value,
) -> Option<Vec<crate::types::FileChange>> {
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

        Some(vec![crate::types::FileChange {
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

#[cfg(test)]
mod summary_compaction_tests {
    use super::super::budget::estimate_conversation_tokens;
    use crate::middleware::{
        CompactionMiddleware, ContextMiddleware, EnrichmentContext, SummaryMiddleware,
    };
    use zen_db::models::ChatMessage;

    fn make_ctx(iteration: usize, conversation: Vec<ChatMessage>) -> EnrichmentContext {
        EnrichmentContext {
            system_content: String::new(),
            conversation,
            extra_system_messages: Vec::new(),
            chat_id: "test".to_string(),
            workspace_root: None,
            recall_block: None,
            authorized_tool_ids: Vec::new(),
            delegation_allowed: false,
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
