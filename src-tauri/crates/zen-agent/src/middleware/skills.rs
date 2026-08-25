//! `SkillsCatalogMiddleware` — injects the skills catalog (metadata
//! only, budget-capped) into the system prompt. Runs between
//! SystemPrompt (0) and Recall (10).
//!
//! `skills_catalog_budget` is the hard upper bound on the rendered
//! catalog fragment that this middleware will inject. The fragment is
//! rendered with an inner metadata budget (how many skills to include)
//! and then truncated to the outer cap (the actual fragment size) before
//! being appended. `usize::MAX` means unbounded.

use super::core::{ContextMiddleware, ContextSectionId, EnrichmentContext, SectionStatus};
use zen_core::ZenResult;
use crate::context::AgentContext;
use async_trait::async_trait;

pub struct SkillsCatalogMiddleware {
    /// Phase 6 seam: shared service handles (same Arcs as AppState).
    pub ctx: AgentContext,
    pub context_window: Option<i64>,
    pub skills_catalog_budget: usize,
}

#[async_trait]
impl ContextMiddleware for SkillsCatalogMiddleware {
    fn priority(&self) -> i32 {
        5
    }
    fn name(&self) -> &'static str {
        "SkillsCatalog"
    }

    async fn enrich(&self, ctx: &mut EnrichmentContext) -> ZenResult<()> {
        // Shared manager handle (same Arc as AppState's; registered at startup).
        let mgr = self.ctx.skills_manager.clone();
        // Resolve against the chat's workspace, not the process cwd.
        let cwd = ctx
            .workspace_root
            .clone()
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
        let outcome = mgr.enabled_skills_for_cwd(&cwd).await;
        if outcome.is_empty() {
            return Ok(());
        }
        // Inner cap: how many skills to render (a *count* derived from
        // context_window, not a token count). The outer cap below enforces
        // the per-layer token budget; the two are in different units so
        // we deliberately do not `.min` them.
        let inner_budget =
            crate::skills::default_skill_metadata_budget(self.context_window);
        let rendered = crate::skills::render_available_skills(&outcome, inner_budget);
        if rendered.lines.is_empty() {
            return Ok(());
        }
        let fragment = crate::skills::SkillsCatalogFragment {
            skill_lines: rendered.lines,
            skill_root_lines: rendered.root_lines,
        };
        let body = {
            use crate::skills::ContextualFragment;
            fragment.body()
        };
        // Outer cap: enforce the per-layer token budget on the rendered
        // fragment. truncate_to_budget is a no-op for `usize::MAX`.
        let truncated =
            crate::runner::helpers::truncate_to_budget(&body, self.skills_catalog_budget);
        let was_truncated = truncated != body;
        ctx.system_content.push_str(&truncated);
        ctx.record_section(
            ContextSectionId::SkillsCatalog,
            truncated,
            if was_truncated {
                SectionStatus::Truncated
            } else {
                SectionStatus::Active
            },
        );
        Ok(())
    }
}
