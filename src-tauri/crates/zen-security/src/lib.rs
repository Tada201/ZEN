//! zen-security — permission model, risk levels, audit-event contracts, and
//! privileged-operation checks (BIG_MIGRATION.md Phase 4).
//!
//! Everything here is security-critical policy: the 6-layer tool-permission
//! precedence chain (`policy`), its user-facing decision types
//! (`approval`, `risk`), the agent tool allowlist (`checks`), the
//! privileged-operation `SecurityService` with its audit trail
//! (`service`), secret-key classification (`secrets`), the SSRF-safe URL
//! validators and DNS-pinned client builders (`url_safety`), and the patch
//! parser the plan-mode write gate evaluates (`patch_parser`).
//!
//! NO tauri, NO keyring: keyring/settings/event impls stay in the app
//! behind the zen-core ports.

pub mod approval;
pub mod checks;
pub mod patch_parser;
pub mod policy;
pub mod risk;
pub mod secrets;
pub mod service;
pub mod url_safety;

// Root re-exports cover the `tools::permission` family consumed across the
// app. `service` intentionally has NO root re-export: its `PermissionDecision`
// and `RiskLevel` (Allow/Ask/Deny audit flavor) collide by name with the
// approval/risk types above, so consumers spell out
// `zen_security::service::...` — exactly the `services::security` split the
// app had before the move.
pub use approval::{
    build_context, redacted_arguments_for_display, PermissionContext, PermissionDecision,
};
pub use checks::{
    enforce_tool_allowlist, from_agent_tool_ids, is_critical_floor, new_shared_allowlist,
    AllowlistDecision, ToolAllowlist,
};
pub use patch_parser::{parse_patches, PatchHunk};
pub use policy::{
    extract_file_target, extract_shell_commands, is_within_plans_root, CompiledRegex,
    HardcodedSecurityRules, PermissionDefault, RegexCache, ToolPermissionRules, ToolPermissions,
    HARDCODED_SECURITY_RULES,
};
pub use risk::RiskLevel;
pub use secrets::{is_secret_key, is_secret_placeholder_write, redact_if_secret};
pub use url_safety::{
    build_pinned_get_request, build_pinned_http_client, resolve_redirect_url,
    validate_public_http_url, validate_public_ip, validate_url_dns_safety, MAX_DIRECT_RESPONSE_BYTES,
    MAX_OUTPUT_CHARS, MAX_REDIRECTS, REQUEST_TIMEOUT_SECS,
};
