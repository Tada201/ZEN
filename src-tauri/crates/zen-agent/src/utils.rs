//! Shared utilities for the agent system.
//! Shared utilities for the agent system.

pub mod prompt_loader;

use anyhow::{Context, Result};
use std::path::Path;

/// Canonicalizes a workspace root path, rejecting non-directories.
/// Moved from the app crate's `workspace` module in Phase 11; the app
/// re-exports it (relocation doctrine §4.6).
pub fn canonicalize_workspace_root(path: &Path) -> Result<std::path::PathBuf> {
    if !path.exists() || !path.is_dir() {
        return Err(anyhow::anyhow!(
            "Workspace root does not exist or is not a directory: {}",
            path.display()
        ));
    }

    path.canonicalize()
        .with_context(|| format!("Failed to resolve workspace root: {}", path.display()))
}
/// Returns the current Unix epoch time in milliseconds.
pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// Extract a balanced JSON object starting at the first '{' in the string.
pub(crate) fn extract_json_object(s: &str) -> Option<String> {
    let start_idx = s.find('{')?;
    let s = &s[start_idx..];

    let mut depth = 0;
    let mut in_string = false;
    let mut escape = false;
    for (i, ch) in s.char_indices() {
        if escape {
            escape = false;
            continue;
        }
        if ch == '\\' && in_string {
            escape = true;
            continue;
        }
        if ch == '"' {
            in_string = !in_string;
            continue;
        }
        if in_string {
            continue;
        }
        if ch == '{' {
            depth += 1;
        }
        if ch == '}' {
            depth -= 1;
            if depth == 0 {
                return Some(s[..=i].to_string());
            }
        }
    }
    None
}
