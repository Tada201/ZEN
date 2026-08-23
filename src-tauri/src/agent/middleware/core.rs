//! Core types for the middleware chain:
//!   * Stable section identifiers ([`ContextSectionId`]).
//!   * Per-section push status ([`SectionStatus`]).
//!   * Per-section entry recording ([`ContextSectionEntry`]).
//!   * The mutable [`EnrichmentContext`] struct that middleware steps
//!     read from and write to.
//!   * The [`ContextMiddleware`] trait.
//!   * The [`MiddlewareChain`] executor + its `default_chain`
//!     factory, which composes every built-in middleware.
//!
//! Every concrete middleware lives in its own submodule
//! (`system_prompt`, `recall`, `summary`, `compaction`, `skills`) and
//! is re-exported by the `super` (façade). The `default_chain` factory
//! inside this file is the only place that knows about the full set,
//! which keeps the priority order and insertion ordering local to one
//! file.

use crate::agent::runner::CompactionEvent;
use crate::db::models::ChatMessage;
use crate::error::ZenResult;
use async_trait::async_trait;
use sqlx::SqlitePool;
use tauri::AppHandle;

// Sibling submodule imports — used by `MiddlewareChain::default_chain`
// to compose the four built-in middlewares. Each is owned by its own
// file and re-exported by the `super` façade.
use super::compaction::CompactionMiddleware;
use super::recall::RecallMiddleware;
use super::skills::SkillsCatalogMiddleware;
use super::summary::SummaryMiddleware;
use super::system_prompt::SystemPromptMiddleware;

/// Stable, product-facing identifier for each middleware-built section.
/// Mirrors [`crate::agent::context_breakdown::ContextSectionId`] so the
/// frontend sees one enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ContextSectionId {
    SafetyPreamble,
    AgentInstructions,
    Time,
    UiRules,
    DrawingCanvas,
    GraphSession,
    GraphSessionState,
    DirectBoard,
    ToolSystem,
    TodoChecklist,
    PatchRules,
    AgentRoles,
    SkillsCatalog,
    SemanticRecall,
    PreviousSummary,
    CurrentSummary,
    Conversation,
}

/// Whether a section landed in the system prompt, was truncated to fit
/// the budget, or was budget-excluded and never pushed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SectionStatus {
    /// Section was pushed in full.
    Active,
    /// Section was pushed but truncated to fit the per-layer budget.
    Truncated,
    /// Section was skipped — would have exceeded the per-layer budget.
    BudgetExcluded,
}

/// One per-section record collected by middleware via
/// [`EnrichmentContext::record_section`]. The body is kept verbatim so
/// the frontend visualiser's "Technical details" disclosure has real
/// content per the chat-timeline rules.
#[derive(Debug, Clone)]
pub struct ContextSectionEntry {
    pub id: ContextSectionId,
    pub content: String,
    pub status: SectionStatus,
}

/// Mutable context that middleware steps read from and write to.
///
/// The runner populates this struct before each LLM call, then the
/// middleware chain augments it in priority order.
pub struct EnrichmentContext {
    /// System prompt being built step-by-step (initialised with agent instructions).
    pub system_content: String,
    /// Conversation messages (may be compacted in-place by CompactionMiddleware).
    pub conversation: Vec<ChatMessage>,
    /// Extra system messages appended after the main system message
    /// (e.g. previous session summaries, current session summary).
    pub extra_system_messages: Vec<String>,
    /// Chat identifier – used by middleware that queries DB or app state.
    pub chat_id: String,
    /// The chat's captured workspace root (canonicalized). Skill discovery
    /// and any workspace-scoped middleware must resolve against this, NOT
    /// the process cwd — a Tauri app's cwd is the install/launch dir.
    pub workspace_root: Option<std::path::PathBuf>,
    /// Pre-cached semantic recall block (set by runner before chain runs).
    pub recall_block: Option<String>,
    /// Tool IDs authorised for the current agent/iteration.
    pub authorized_tool_ids: Vec<String>,
    /// Whether this runner is allowed to delegate work. Only the root runner
    /// sets this true; child runners carry the false capability into prompt
    /// construction as well as tool execution.
    pub delegation_allowed: bool,
    /// Whether the provider supports structured tool calling.
    pub tools_supported: bool,
    /// Whether tools are globally enabled for this run.
    pub tools_enabled: bool,
    /// Current iteration index (1-based). Set by the runner. Used by
    /// SummaryMiddleware to gate the first-iteration cost.
    pub iteration: usize,
    /// Whether summarisation is globally enabled for this run.
    /// Mirrors the per-user setting loaded by the runner.
    pub summarization_enabled: bool,
    /// Token threshold that triggers light compaction when the
    /// conversation exceeds it.
    pub compaction_token_threshold: usize,
    /// Message-count threshold that triggers light compaction when the
    /// conversation has more than this many messages.
    pub compaction_threshold: usize,
    /// Optional per-agent cap on the number of messages kept in
    /// working memory. `None` means no cap.
    pub max_messages_in_memory: Option<usize>,
    /// Outcome of this iteration's `CompactionMiddleware` run. `None`
    /// when no compaction branch fired. Populated by
    /// `CompactionMiddleware::enrich` and read by the runner when it
    /// computes the per-iteration breakdown — the middleware is the
    /// only place that knows the truth, so the loop no longer infers
    /// `CompactionKind` from a token-threshold heuristic.
    pub compaction_event: Option<CompactionEvent>,
    /// Per-section instrumentation log. Each middleware records each
    /// section it built (full body + status) so the breakdown
    /// computation has real data to display. See
    /// [`crate::agent::context_breakdown::compute_context_breakdown`].
    pub section_log: Vec<ContextSectionEntry>,
    /// Monotonic per-Runner.run() identifier minted from
    /// `AppState.next_run_id`. Carried on every emitted
    /// `ContextBreakdownPayload` so the frontend dedupes by
    /// `(chat_id, run_id, iteration)` instead of `iteration` alone —
    /// a later, shorter run on the same chat never gets overwritten by
    /// a stale, longer earlier run.
    pub run_id: u64,
}

impl EnrichmentContext {
    /// Push a per-section record. Called by middleware after a section
    /// is finalised (pushed in full, truncated, or excluded by budget).
    pub fn record_section(
        &mut self,
        id: ContextSectionId,
        content: String,
        status: SectionStatus,
    ) {
        self.section_log.push(ContextSectionEntry {
            id,
            content,
            status,
        });
    }

    /// Budgeted push + record in one step. `remaining` is decremented
    /// only when the section fits, matching
    /// [`crate::agent::runner::helpers::try_push_within_budget`]. This
    /// is the canonical entry point for new optional sections.
    ///
    /// Truncation marker detection: if `content` ends with the standard
    /// `[...truncated for context budget...]` marker, the section is
    /// logged as [`SectionStatus::Truncated`].
    pub fn try_push_section(
        &mut self,
        id: ContextSectionId,
        remaining: &mut usize,
        content: &str,
    ) -> bool {
        use crate::agent::runner::helpers::estimate_tokens;
        let token_count = estimate_tokens(content);
        if token_count > *remaining {
            self.record_section(id, content.to_string(), SectionStatus::BudgetExcluded);
            return false;
        }
        *remaining -= token_count;
        self.system_content.push_str(content);
        let truncated = content.ends_with("[...truncated for context budget...]");
        let status = if truncated {
            SectionStatus::Truncated
        } else {
            SectionStatus::Active
        };
        self.record_section(id, content.to_string(), status);
        true
    }
}

/// A composable context-enrichment step executed before each LLM call.
#[async_trait]
pub trait ContextMiddleware: Send + Sync {
    /// Mutate `ctx` in-place with additional context, memory, or instructions.
    async fn enrich(&self, ctx: &mut EnrichmentContext) -> ZenResult<()>;
    /// Lower numbers run first. Default 0.
    fn priority(&self) -> i32 {
        0
    }
    /// Human-readable name for tracing/debugging.
    fn name(&self) -> &'static str;
}

/// An ordered chain of middleware that runs each step in priority order.
pub struct MiddlewareChain {
    steps: Vec<Box<dyn ContextMiddleware>>,
}

impl MiddlewareChain {
    pub fn new() -> Self {
        Self { steps: Vec::new() }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn add(mut self, mw: Box<dyn ContextMiddleware>) -> Self {
        self.steps.push(mw);
        self.sort();
        self
    }

    /// Insert a middleware after the first existing step whose priority is
    /// strictly greater than `target_priority`. Falls back to append.
    pub fn add_after_priority(mut self, target_priority: i32, mw: Box<dyn ContextMiddleware>) -> Self {
        let pos = self
            .steps
            .iter()
            .position(|s| s.priority() > target_priority)
            .unwrap_or(self.steps.len());
        self.steps.insert(pos, mw);
        self
    }

    /// Run every registered middleware in priority order against `ctx`.
    pub async fn enrich_all(&self, ctx: &mut EnrichmentContext) -> ZenResult<()> {
        for step in &self.steps {
            step.enrich(ctx).await?;
        }
        Ok(())
    }

    /// Create the default chain used by `send_message`.
    ///
    /// `skills_enabled` controls whether `SkillsCatalogMiddleware` is inserted.
    /// The middleware reads the shared `SkillsManager` from `AppState` itself,
    /// so callers do not need to thread it through Runner builders.
    ///
    /// Per-layer token budgets are computed from `context_window` via
    /// `MiddlewareBudgets::from_context_window`. SystemPrompt, SkillsCatalog,
    /// and Recall each get a share that scales proportionally with the
    /// window (≈8% / 4% / 4%, clamped to sane floors and ceilings);
    /// Summary and Compaction split the remainder 50/50. Passing `None`
    /// yields unbounded layers (the historical behaviour) for backward
    /// compatibility.
    pub fn default_chain(
        app: AppHandle,
        ctx: crate::services::agent_context::AgentContext,
        db_pool: Option<SqlitePool>,
        skills_enabled: bool,
        context_window: Option<i64>,
    ) -> Self {
        use crate::agent::runner::helpers::MiddlewareBudgets;
        let budgets = MiddlewareBudgets::from_context_window(context_window);
        let mut chain = Self::new()
            .add(Box::new(SystemPromptMiddleware {
                app: app.clone(),
                ctx: ctx.clone(),
                system_prompt_budget: budgets.system_prompt,
            }))
            .add(Box::new(RecallMiddleware {
                recall_budget: budgets.recall,
            }))
            .add(Box::new(SummaryMiddleware {
                db_pool: db_pool.clone(),
                summary_budget: budgets.summary,
            }))
            .add(Box::new(CompactionMiddleware {
                compaction_budget: budgets.compaction,
            }));
        if skills_enabled {
            chain = chain.add_after_priority(
                0,
                Box::new(SkillsCatalogMiddleware {
                    app: app.clone(),
                    ctx: ctx.clone(),
                    context_window,
                    skills_catalog_budget: budgets.skills_catalog,
                }),
            );
        }
        chain
    }

    fn sort(&mut self) {
        self.steps.sort_by_key(|s| s.priority());
    }
}

impl Default for MiddlewareChain {
    fn default() -> Self {
        Self::new()
    }
}
