//! File-system + RAG tools.
//!
//! Layout:
//!   `search`     — vector search over the RAG index.
//!   `documents`  — list/read/grep ingested documents.
//!   `write`      — write_file, edit_file, targeted-edit helpers, tests.
//!   `patch`      — apply_patch (multi-file structured patch).
//!
//! Shared helpers (size enforcement, unified-diff emission, text read) live
//! here in `mod.rs` so every submodule can use them via `super::helper`.

use std::path::Path;

use similar::{ChangeTag, TextDiff};

use crate::tools::ToolError;
use crate::commands::AppState;

mod documents;
mod patch;
mod search;
mod write;

pub use documents::{GrepDocumentsTool, ListDocumentsTool, ReadDocumentTool};
pub use patch::ApplyPatchTool;
pub use search::VectorSearchTool;
pub use write::{execute_targeted_edit, EditFileTool, WriteFileTool};

/// Read a UTF-8 text file from disk. Binary files fail here on purpose — the
/// tools that need to handle binaries should go through a different path.
pub(crate) async fn read_text_file(path: &Path) -> Result<String, ToolError> {
    tokio::fs::read_to_string(path).await.map_err(|e| ToolError::ExecutionFailed {
        message: format!("Failed to read file as UTF-8 text: {}", e),
    })
}

/// Best-effort file modification time as Unix epoch milliseconds.
///
/// Emitted alongside `read_document_content` / `write_file` / `edit_file`
/// results so the agent runner can detect when a file changed on disk after
/// it was read into context (see `runner::helpers::detect_stale_reads`).
/// Returns `None` if the metadata or mtime is unavailable — staleness
/// tracking then simply skips that file rather than failing the tool.
pub(crate) async fn file_mtime_ms(path: &Path) -> Option<u64> {
    let modified = tokio::fs::metadata(path).await.ok()?.modified().ok()?;
    modified
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as u64)
}

/// Resolve the configured workspace max file size in bytes. Falls back to 10 MB
/// if the DB setting is missing or unparseable. Clamped 1..=500 MB.
pub(crate) async fn workspace_max_file_bytes(state: &AppState) -> u64 {
    let db = match state.db().await {
        Ok(db) => db,
        Err(_) => return 10 * 1024 * 1024,
    };

    let mut raw = crate::db::queries::get_setting(&db, "workspace.max-file-size")
        .await
        .ok()
        .flatten();

    if raw.is_none() {
        raw = crate::db::queries::get_setting(&db, "workspace_max_file_size")
            .await
            .ok()
            .flatten();
    }

    let mb = raw
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(10)
        .clamp(1, 500);
    mb * 1024 * 1024
}

/// Reject files larger than `max_bytes` before opening them.
pub(crate) async fn enforce_existing_file_size(path: &Path, max_bytes: u64) -> Result<(), ToolError> {
    let metadata = tokio::fs::metadata(path).await.map_err(|e| {
        ToolError::ExecutionFailed {
            message: format!("Failed to inspect file size: {}", e),
        }
    })?;
    enforce_content_size(metadata.len() as usize, max_bytes, "file")
}

/// Reject in-memory payloads above the workspace cap.
pub(crate) fn enforce_content_size(size_bytes: usize, max_bytes: u64, label: &str) -> Result<(), ToolError> {
    if size_bytes as u64 > max_bytes {
        return Err(ToolError::ExecutionFailed {
            message: format!(
                "{} exceeds workspace.max-file-size ({} bytes > {} bytes)",
                label, size_bytes, max_bytes
            ),
        });
    }
    Ok(())
}

/// Emit a unified-diff string + (lines_added, lines_removed) for `old` → `new`.
pub(crate) fn unified_diff(path: &Path, old: &str, new: &str) -> (String, usize, usize) {
    let diff = TextDiff::from_lines(old, new);
    let mut diff_lines = Vec::new();
    let mut lines_added = 0;
    let mut lines_removed = 0;

    diff_lines.push(format!("--- a/{}", path.display()));
    diff_lines.push(format!("+++ b/{}", path.display()));

    for change in diff.iter_all_changes() {
        match change.tag() {
            ChangeTag::Delete => {
                diff_lines.push(format!("-{}", change.value().trim_end()));
                lines_removed += 1;
            }
            ChangeTag::Insert => {
                diff_lines.push(format!("+{}", change.value().trim_end()));
                lines_added += 1;
            }
            ChangeTag::Equal => {
                diff_lines.push(format!(" {}", change.value().trim_end()));
            }
        }
    }

    (diff_lines.join("\n"), lines_added, lines_removed)
}
