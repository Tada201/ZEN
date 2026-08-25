//! Permission decision types shown to the user (from tools/permission.rs,
//! Phase 4): the Allow/Deny/Confirm verdict plus the confirmation
//! context and argument redaction.

use serde::{Deserialize, Serialize};

use crate::policy::extract_file_target;
use crate::risk::RiskLevel;

// ========== PERMISSION DECISION ==========

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[serde(tag = "type", content = "data")]
pub enum PermissionDecision {
    /// Tool execution is approved
    Allow,
    /// Tool execution is blocked
    Deny { reason: String },
    /// User confirmation required
    Confirm { context: PermissionContext },
}

/// Context provided when requesting user confirmation
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PermissionContext {
    pub tool_name: String,
    pub description: String,
    pub arguments_preview: String,
    pub risk_level: RiskLevel,
    /// Suggested patterns for "Always allow..." buttons
    pub suggested_patterns: Vec<String>,
}

/// Build a `PermissionContext` for a Confirm decision. Public for the
/// app-boundary shim: the destructive-tool post-process gate in the
/// app's `ToolRegistry::check_permission` needs to construct
/// one when upgrading a destructive `Allow` to `Confirm` without
/// going through `PermissionDecision::from_input` (which would
/// re-evaluate layers 1-5 and short-circuit on its own logic).
pub fn build_context(
    tool_name: &str,
    args: &serde_json::Value,
    risk_level: RiskLevel,
) -> PermissionContext {
    let preview = serde_json::to_string_pretty(&redacted_arguments_for_display(args))
        .unwrap_or_else(|_| "{}".to_string());

    // Generate suggested always-allow patterns
    let mut suggested = Vec::new();
    // Suggest: always allow this exact tool
    suggested.push(format!("tool:{tool_name}"));
    // If args contain a file target, suggest the parent directory pattern.
    // Read both `file_path` (used by `write_file`/`edit_file`) and `path`
    // (older tools / config-style callers) so the suggested pattern matches
    // whatever field the tool actually inspects.
    if let Some(target) = extract_file_target(args) {
        if let Some(parent) = std::path::Path::new(&target).parent() {
            suggested.push(format!("{}/*", parent.display()));
        }
    }

    PermissionContext {
        tool_name: tool_name.to_string(),
        description: format!("Execute '{}' ({})", tool_name, risk_level.description()),
        arguments_preview: preview,
        risk_level,
        suggested_patterns: suggested,
    }
}

pub fn redacted_arguments_for_display(args: &serde_json::Value) -> serde_json::Value {
    fn should_redact_key(key: &str) -> bool {
        let key = key.to_ascii_lowercase();
        [
            "api_key",
            "apikey",
            "authorization",
            "bearer",
            "credential",
            "password",
            "secret",
            "token",
        ]
        .iter()
        .any(|marker| key.contains(marker))
    }

    fn should_redact_string(value: &str) -> bool {
        let value = value.to_ascii_lowercase();
        [
            "api_key",
            "apikey",
            "authorization",
            "bearer",
            "credential",
            "password",
            "secret",
            "token",
        ]
        .iter()
        .any(|marker| value.contains(marker))
    }

    fn redact(value: &serde_json::Value, depth: usize) -> serde_json::Value {
        const MAX_DEPTH: usize = 6;
        const MAX_ITEMS: usize = 24;
        const MAX_STRING_CHARS: usize = 2_000;

        if depth > MAX_DEPTH {
            return serde_json::json!("[truncated]");
        }

        match value {
            serde_json::Value::String(s) => {
                if should_redact_string(s) {
                    serde_json::json!("[redacted]")
                } else if s.chars().count() > MAX_STRING_CHARS {
                    let mut out: String = s.chars().take(MAX_STRING_CHARS).collect();
                    out.push_str("...");
                    serde_json::Value::String(out)
                } else {
                    serde_json::Value::String(s.clone())
                }
            }
            serde_json::Value::Array(items) => serde_json::Value::Array(
                items
                    .iter()
                    .take(MAX_ITEMS)
                    .map(|item| redact(item, depth + 1))
                    .collect(),
            ),
            serde_json::Value::Object(map) => {
                let mut next = serde_json::Map::new();
                for (key, value) in map.iter().take(MAX_ITEMS) {
                    next.insert(
                        key.clone(),
                        if should_redact_key(key) {
                            serde_json::json!("[redacted]")
                        } else {
                            redact(value, depth + 1)
                        },
                    );
                }
                serde_json::Value::Object(next)
            }
            other => other.clone(),
        }
    }

    redact(args, 0)
}
