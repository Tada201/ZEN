//! Middleware chain for context enrichment, split into focused
//! submodules so the root module falls under the `RULES.md` hard-fail
//! line limit. Each submodule owns one concern and stays under 400
//! lines:
//!
//! | Submodule     | Responsibility                                              |
//! |---------------|-------------------------------------------------------------|
//! | `core`        | The chain, the `EnrichmentContext` struct, the section
//!                | identifier/log types, the `ContextMiddleware` trait, and
//!                | `MiddlewareChain::default_chain` (the only place that
//!                | composes all four built-in middlewares). |
//! | `system_prompt`| The `SystemPromptMiddleware`: safety preamble, time, UI
//!                  | rules, canvas, graph session, tool system, todo rules,
//!                  | patch rules, agent roles.                  |
//! | `recall`      | The `RecallMiddleware`: pre-cached semantic memory recall.  |
//! | `summary`     | The `SummaryMiddleware`: previous + current session
//!                | summaries as extra system messages.       |
//! | `compaction`  | The `CompactionMiddleware`: in-place conversation
//!                | pruning + token-aware compaction + per-agent message
//!                | cap. Sets `EnrichmentContext.compaction_event`. |
//! | `skills`      | The `SkillsCatalogMiddleware`: skills catalog rendered
//!                | within its per-layer budget.              |
//!
//! The façade re-exports the public types so existing call sites
//! (`crate::middleware::EnrichmentContext`,
//! `crate::middleware::MiddlewareChain`, etc.) keep working
//! unchanged. Adding a new built-in middleware means: write its
//! submodule, add a `pub mod` line here, and append a `pub use` of the
//! struct + an entry in `MiddlewareChain::default_chain` (in `core`).

pub mod compaction;
pub mod core;
pub mod recall;
pub mod skills;
pub mod summary;
pub mod system_prompt;

pub use compaction::CompactionMiddleware;
pub use core::{
    ContextMiddleware, ContextSectionEntry, ContextSectionId, EnrichmentContext, MiddlewareChain,
    SectionStatus,
};
pub use recall::RecallMiddleware;
pub use skills::SkillsCatalogMiddleware;
pub use summary::SummaryMiddleware;
pub use system_prompt::SystemPromptMiddleware;
