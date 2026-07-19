//! `CompactionMiddleware` — truncates old tool results and compacts the
//! conversation when approaching token limits. Runs in-place on
//! `ctx.conversation`, which is why it sits at priority 30 (after every
//! other layer has read the system prompt). The runner MUST re-sync its
//! outer `conversation` variable from `enrich_ctx.conversation` after
//! the chain completes, or compaction will be lost across iterations.
//!
//! Reads per-iteration config from `EnrichmentContext`:
//! `summarization_enabled` (whether light compaction is allowed),
//! `compaction_token_threshold` (soft token ceiling for light compaction),
//! `compaction_threshold` (soft message-count ceiling), and
//! `max_messages_in_memory` (hard per-agent cap).
//!
//! `compaction_budget` is the per-layer target/ceiling. It replaces
//! the legacy `RunConfig::max_context_tokens / 2` target. The aggressive
//! path triggers when the current conversation exceeds the budget and
//! compacts to `compaction_budget / 2` (leaves headroom for system
//! prompt + recall + summaries to land on top). `usize::MAX` means
//! unbounded (the historical behaviour before per-layer budgets).
//!
//! **Behaviour change (vs. legacy `loop.rs`):** the aggressive trigger
//! moved from `run_config.max_context_tokens` (the LLM's full window,
//! e.g. 200K) to `compaction_budget` (the per-layer remainder after
//! SystemPrompt + SkillsCatalog + Recall, e.g. ~92K for a 200K model).
//! This is the *right* trade — each layer should respect its own
//! budget, not the whole window — but it is NOT a no-op refactor:
//! production compaction will fire earlier. Tests that assert on
//! specific token thresholds may need adjustment.

use super::core::{ContextMiddleware, EnrichmentContext};
use crate::agent::runner::CompactionEvent;
use crate::error::ZenResult;
use async_trait::async_trait;

pub struct CompactionMiddleware {
    pub compaction_budget: usize,
}

#[async_trait]
impl ContextMiddleware for CompactionMiddleware {
    fn priority(&self) -> i32 {
        30
    }
    fn name(&self) -> &'static str {
        "ConversationCompaction"
    }

    async fn enrich(&self, ctx: &mut EnrichmentContext) -> ZenResult<()> {
        use crate::agent::runner::context_breakdown::CompactionKind;
        use crate::agent::runner::helpers::{
            compact_conversation, compact_conversation_token_aware,
            estimate_conversation_tokens, prune_stale_reads,
            truncate_conversation_by_message_count,
        };

        let conv = &mut ctx.conversation;

        // Stale-read pruning is always-on (it's cheap and avoids
        // embedding pre-edit file contents). It does not record a
        // kind — only the three branches below do.
        prune_stale_reads(conv);

        let pre_tokens = estimate_conversation_tokens(conv);
        let pre_len = conv.len();

        // Track which branch wins. Aggressive > Light > MessageCountCap
        // by severity. The "did anything actually shrink" sanity
        // check is deferred to the end (`post_tokens < pre_tokens`),
        // so each branch is just a call to the right helper.
        // Walks per iteration: pre + post = 2.
        let mut kind: Option<CompactionKind> = None;
        let mut target_tokens: usize = 0;

        if pre_tokens > self.compaction_budget {
            tracing::warn!(
                "Context at {} tokens exceeds compaction budget {} - aggressive compaction",
                pre_tokens,
                self.compaction_budget
            );
            let target = self.compaction_budget / 2;
            compact_conversation_token_aware(conv, 8, target);
            kind = Some(CompactionKind::Aggressive);
            target_tokens = target;
        } else if ctx.summarization_enabled
            && (pre_tokens > ctx.compaction_token_threshold
                || conv.len() > ctx.compaction_threshold)
        {
            // Light path: keep the last 10 messages intact and
            // compact the older tool results. The branch has no
            // explicit token target — the final-target match below
            // maps Light to the actual post-compaction count.
            compact_conversation(conv, 10);
            kind = Some(CompactionKind::Light);
        }

        // Hard per-agent message-count cap (independent of token
        // budget; enforced even when summarization is disabled).
        // Only records a kind when no token-based branch fired AND
        // the cap actually truncated the conversation.
        truncate_conversation_by_message_count(conv, ctx.max_messages_in_memory);
        if kind.is_none() && conv.len() < pre_len {
            kind = Some(CompactionKind::MessageCountCap);
            // Approximate the per-agent message cap in tokens (msg
            // count × ~500 tokens/msg) to keep the wire format in
            // real token units — same conversion the old loop.rs
            // heuristic used.
            target_tokens = ctx.max_messages_in_memory.unwrap_or(0).saturating_mul(500);
        }

        // The truth: did any branch actually shrink the conversation?
        // One walk captures the final post-compaction count; the
        // comparison against pre_tokens decides whether to record.
        if let Some(k) = kind {
            let post_tokens = estimate_conversation_tokens(conv);
            if post_tokens < pre_tokens {
                // `target_tokens` is the per-kind "post-compaction
                // token target". Aggressive records the `budget / 2`
                // it asked the helper to achieve; MessageCountCap
                // records the approximated token cost of the
                // per-agent message cap; Light has no explicit
                // budget — `compact_conversation(conv, 10)` just
                // keeps the last 10 messages — so the actual
                // post-compaction count IS the target.
                let final_target = match k {
                    CompactionKind::Light => post_tokens,
                    CompactionKind::Aggressive | CompactionKind::MessageCountCap => target_tokens,
                };
                ctx.compaction_event = Some(CompactionEvent {
                    kind: k,
                    pre_tokens,
                    post_tokens,
                    target_tokens: final_target,
                });
            }
        }

        Ok(())
    }
}
