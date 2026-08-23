//! Shim (BIG_MIGRATION.md Phase 4): tool-permission policy lives in the
//! `zen-security` crate (split there into `risk`/`approval`/`policy`).
//! These re-exports keep every `crate::tools::permission::` call site
//! compiling unchanged (relocation doctrine §4.6); the shim is deleted in
//! Phase 14.

pub use zen_security::approval::{
    build_context, redacted_arguments_for_display, PermissionContext, PermissionDecision,
};
pub use zen_security::policy::{
    extract_file_target, extract_shell_commands, is_within_plans_root, CompiledRegex,
    HardcodedSecurityRules, PermissionDefault, RegexCache, ToolPermissionRules, ToolPermissions,
    HARDCODED_SECURITY_RULES,
};
pub use zen_security::risk::RiskLevel;
