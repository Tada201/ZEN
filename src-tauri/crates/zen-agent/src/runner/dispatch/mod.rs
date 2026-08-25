/// Tool-call dispatch, split out of the former single `tool_dispatch.rs`
/// during BIG_MIGRATION.md Phase 11:
///
/// - `router`: tool exposure/authorization decisions and id/batch keys
/// - `executors`: the parallel `execute_tools_with_hooks` execution path
/// - `completion`: result collection and completion events
mod completion;
mod executors;
mod router;
