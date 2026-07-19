//! `RecallMiddleware` — injects pre-cached semantic memory recall into
//! the system prompt.
//!
//! The recall block is produced by a background task after each LLM response
//! and stored in `AppState.recall_cache`. The runner reads it synchronously
//! and sets it on `EnrichmentContext.recall_block` before the chain runs.
//!
//! `recall_budget` is the hard upper bound on the recall block token count
//! that this middleware will inject. The block is truncated to the budget
//! (preserving the head — the most recent and relevant snippets) before
//! being appended. `usize::MAX` means unbounded.

use super::core::{ContextMiddleware, ContextSectionId, EnrichmentContext, SectionStatus};
use crate::error::ZenResult;
use async_trait::async_trait;

pub struct RecallMiddleware {
    pub recall_budget: usize,
}

#[async_trait]
impl ContextMiddleware for RecallMiddleware {
    fn priority(&self) -> i32 {
        10
    }
    fn name(&self) -> &'static str {
        "SemanticRecall"
    }

    async fn enrich(&self, ctx: &mut EnrichmentContext) -> ZenResult<()> {
        if let Some(ref recalled) = ctx.recall_block {
            if !recalled.is_empty() {
                let truncated = crate::agent::runner::helpers::truncate_to_budget(
                    recalled,
                    self.recall_budget,
                );
                let was_truncated = truncated != *recalled;
                ctx.system_content.push_str(&truncated);
                ctx.record_section(
                    ContextSectionId::SemanticRecall,
                    truncated,
                    if was_truncated {
                        SectionStatus::Truncated
                    } else {
                        SectionStatus::Active
                    },
                );
            }
        }
        Ok(())
    }
}
