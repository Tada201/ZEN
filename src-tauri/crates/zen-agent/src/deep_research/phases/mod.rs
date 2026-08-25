//! Deep-research pipeline phases, grouped by stage.
//!
//! Split out of the former single `phases.rs` during BIG_MIGRATION.md
//! Phase 11. Every method stays an inherent `IterativeDeepResearcher`
//! method, so `engine.rs` call sites are untouched.

mod analyze;
mod dispatch;
mod plan;
mod report;
mod search;
