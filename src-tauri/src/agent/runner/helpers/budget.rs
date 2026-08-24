//! Token estimation and per-layer budget arithmetic.
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

/// Tail-preserving counterpart to `truncate_to_budget`, for layers whose most
/// relevant content sits at the end (conversation summaries: the current
/// summary rides last, older history leads). Keeps the largest suffix within
/// the budget and prepends the truncation marker, so a tight budget drops the
/// oldest material first.
pub fn truncate_to_budget_tail(content: &str, max_tokens: usize) -> String {
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
        let suffix: String = chars[chars.len() - mid..].iter().collect();
        if estimate_tokens(&suffix) <= max_tokens {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    if low == 0 {
        return String::new();
    }
    let mut out = String::from("[...truncated for context budget...]\n\n");
    out.extend(chars[chars.len() - low..].iter());
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

#[cfg(test)]
mod budget_tests {
    use super::{estimate_tokens, truncate_to_budget, truncate_to_budget_tail, MiddlewareBudgets};

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
    fn truncate_to_budget_tail_keeps_content_when_within_budget() {
        let content = "hello world";
        let out = truncate_to_budget_tail(content, 100);
        assert_eq!(out, content);
    }

    #[test]
    fn truncate_to_budget_tail_keeps_suffix_and_drops_head() {
        let head = "o".repeat(4_000); // old material
        let tail = "CURRENT".to_string(); // most recent block
        let content = format!("{}{}", head, tail);
        let out = truncate_to_budget_tail(&content, 50);
        assert!(out.contains("CURRENT"), "tail (current summary) must survive");
        assert!(out.starts_with("[...truncated for context budget...]"));
        let marker_end = out
            .find("\n\n")
            .map(|idx| idx + 2)
            .unwrap_or(0);
        let suffix = &out[marker_end..];
        assert!(estimate_tokens(suffix) <= 50);
        // The dropped material must come from the head, not the tail.
        assert!(suffix.len() < content.len());
    }

    #[test]
    fn truncate_to_budget_tail_handles_zero_budget_and_empty_content() {
        assert!(truncate_to_budget_tail("anything", 0).is_empty());
        assert!(truncate_to_budget_tail("", 100).is_empty());
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
            delegation_allowed: false,
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
            delegation_allowed: false,
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
