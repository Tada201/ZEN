//! `SummaryMiddleware` — injects previous-session summaries and the
//! current-session summary (if compacted) as extra system messages.
//!
//! Reads per-iteration config from `EnrichmentContext` (so the same
//! `SummaryMiddleware` instance is reusable across iterations without
//! being rebuilt): `summarization_enabled` gates the work entirely,
//! `iteration > 1` skips the first turn (no prior history), and
//! `compaction_threshold` mirrors the legacy "only inject when the
//! conversation is already large" gate.
//!
//! `summary_budget` is the hard cap on the total injected text. The
//! previous-session summaries (oldest dropped first) are concatenated
//! with the current-session summary and then truncated to the budget
//! via `truncate_to_budget_tail`, which keeps the tail — so a tight
//! budget drops the oldest summary first and the current (most
//! relevant) summary survives. `usize::MAX`
//! means unbounded (the historical behaviour before per-layer budgets).

use super::core::{ContextMiddleware, ContextSectionId, EnrichmentContext, SectionStatus};
use crate::db::queries;
use crate::error::ZenResult;
use async_trait::async_trait;
use sqlx::SqlitePool;

pub struct SummaryMiddleware {
    pub db_pool: Option<SqlitePool>,
    pub summary_budget: usize,
}

#[async_trait]
impl ContextMiddleware for SummaryMiddleware {
    fn priority(&self) -> i32 {
        20
    }
    fn name(&self) -> &'static str {
        "ConversationSummaries"
    }

    async fn enrich(&self, ctx: &mut EnrichmentContext) -> ZenResult<()> {
        use crate::agent::runner::helpers::truncate_to_budget_tail;

        // Gate 1: summarisation must be enabled.
        if !ctx.summarization_enabled {
            return Ok(());
        }

        // Cached summary texts, used by the post-join recording below.
        // `current_summary_text` is declared ONLY inside the
        // `get_current_summary` if-let block (where the single
        // assignment lives); it has no pre-block declaration so the
        // final `if let Some(ref current)` below reads the inner
        // binding directly. Resurrecting the outer declaration would
        // resurrect the pre-existing shadow warning.
        let mut prev_summaries_list: Vec<String> = Vec::new();

        // Gate 2: skip the first iteration (no prior history) AND skip
        // when the conversation is still short (matches the legacy
        // `needs_summary_context` check in loop.rs).
        let needs_summary = ctx.iteration > 1
            || ctx.conversation.len() > ctx.compaction_threshold;
        if !needs_summary {
            return Ok(());
        }

        // No DB → nothing to load. The chain stays silent rather than
        // emitting an empty placeholder.
        let Some(db) = self.db_pool.clone() else {
            return Ok(());
        };

        // Load summaries. The DB calls are best-effort: a failure
        // here degrades the run to "no summary context" rather than
        // aborting the iteration. This matches the legacy `if let Ok(...)`
        // behaviour.
        let mut summary_blocks: Vec<String> = Vec::new();

        if let Ok(prev_summaries) = queries::get_previous_summaries(&db, &ctx.chat_id).await {
            prev_summaries_list.extend(prev_summaries.into_iter().map(|s| s.summary));
            for summary in &prev_summaries_list {
                summary_blocks.push(format!("[Previous conversation summary]: {}", summary));
            }
        }

        let mut current_summary_text: Option<String> = None;
        if let Ok(Some(current_summary)) = queries::get_current_summary(&db, &ctx.chat_id).await
        {
            current_summary_text = Some(current_summary.summary.clone());
            summary_blocks.push(format!(
                "[Current conversation summary]: {}",
                current_summary.summary
            ));
        }

        if summary_blocks.is_empty() {
            return Ok(());
        }

        // Concatenate and truncate. Order: oldest first, current last. The
        // current summary is the most relevant block, so truncation must drop
        // from the oldest side — `truncate_to_budget_tail` keeps the tail. A
        // head-keeping truncate here would cut the current summary first,
        // the exact opposite of the intent.
        let combined = summary_blocks.join("\n\n");
        let truncated = truncate_to_budget_tail(&combined, self.summary_budget);
        let was_truncated = truncated != combined;

        // Record each summary block individually before concatenating so
        // the visualiser shows previous vs current separately. Both go to
        // the same Truncated/Active status determined at the join.
        for s in prev_summaries_list.iter() {
            ctx.record_section(
                ContextSectionId::PreviousSummary,
                format!("[Previous conversation summary]: {}", s),
                if was_truncated {
                    SectionStatus::Truncated
                } else {
                    SectionStatus::Active
                },
            );
        }
        if let Some(ref current) = current_summary_text {
            ctx.record_section(
                ContextSectionId::CurrentSummary,
                format!("[Current conversation summary]: {}", current),
                if was_truncated {
                    SectionStatus::Truncated
                } else {
                    SectionStatus::Active
                },
            );
        }

        ctx.extra_system_messages.push(truncated);
        Ok(())
    }
}
