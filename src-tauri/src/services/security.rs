//! Shim (BIG_MIGRATION.md Phase 4): the privileged-operation security
//! service lives in the `zen-security` crate. These re-exports keep every
//! `crate::services::security::` call site (and the `services::mod` re-
//! export list) compiling unchanged (relocation doctrine §4.6); the shim
//! is deleted in Phase 14.

pub use zen_security::service::{
    AuditEvent, PermissionDecision, PermissionRequest, PrivilegedOperation, RiskLevel,
    SecurityService,
};
