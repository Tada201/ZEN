// Phase 5 shim (BIG_MIGRATION.md §4.6): calculator moved to zen-tools —
// the one pure executor. Host-generic there; the re-export binds it to
// every host. Delete in Phase 14.
pub use zen_tools::calculator::CalculatorTool;
