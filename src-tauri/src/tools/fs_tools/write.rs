//! Workspace write tools (`write_file`, `edit_file`) plus the targeted-edit
//! helpers and their tests.
//!
//! The `apply_targeted_edit` helpers (occurrence-aware matching with CRLF /
//! trimmed-line fallbacks) live here so both `EditFileTool` and the public
//! `execute_targeted_edit` re-export share one implementation.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Manager};

use crate::commands::AppState;
use crate::tools::permission::RiskLevel;
use crate::tools::{ToolError, ToolOutput};
use zen_tools::Tool;

use super::{
    enforce_content_size, enforce_existing_file_size, read_text_file, unified_diff,
    workspace_max_file_bytes,
};

#[derive(Deserialize)]
struct WriteFileArgs {
    file_path: String,
    content: String,
}

pub struct WriteFileTool;

#[async_trait]
impl zen_tools::Tool<tauri::AppHandle> for WriteFileTool {
    fn name(&self) -> &str {
        "write_file"
    }

    fn description(&self) -> &str {
        "Writes content to a file inside the active workspace. If the file exists, returns a unified diff showing changes."
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to the file, absolute or relative to the workspace"
                },
                "content": {
                    "type": "string",
                    "description": "Full content to write to the file"
                }
            },
            "required": ["file_path", "content"],
            "additionalProperties": false
        })
    }

    fn risk_level(&self) -> RiskLevel {
        RiskLevel::High
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    async fn execute(
        &self,
        app: AppHandle,
        chat_id: String,
        args: serde_json::Value,
    ) -> Result<ToolOutput, ToolError> {
        let args: WriteFileArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArguments {
                details: format!("Invalid write_file arguments: {}", e),
            })?;

        let state = app.state::<AppState>();
        let workspace = state
            .workspace_for_chat(&chat_id)
            .await
            .map_err(|e| ToolError::ExecutionFailed {
                message: format!("Unable to resolve session workspace: {}", e),
            })?;
        let max_file_bytes = workspace_max_file_bytes(&state).await;
        enforce_content_size(args.content.len(), max_file_bytes, "write_file content")?;
        let target_path = crate::workspace::resolve_workspace_path(&workspace, &args.file_path)
            .map_err(|e| ToolError::PermissionDenied {
                reason: format!("Workspace violation: {}", e),
            })?;

        let original_content = if target_path.exists() {
            Some(read_text_file(&target_path).await?)
        } else {
            if let Some(parent) = target_path.parent() {
                tokio::fs::create_dir_all(parent).await.map_err(|e| {
                    ToolError::ExecutionFailed {
                        message: format!("Failed to create parent directories: {}", e),
                    }
                })?;
            }
            None
        };

        tokio::fs::write(&target_path, &args.content)
            .await
            .map_err(|e| ToolError::ExecutionFailed {
                message: format!("Failed to write file: {}", e),
            })?;

        // Post-write mtime so the runner refreshes its stale-read baseline
        // for this path instead of flagging our own write as external drift.
        let modified_ms = super::file_mtime_ms(&target_path).await;

        let (change_type, diff, lines_added, lines_removed) =
            if let Some(original) = original_content {
                let (diff, lines_added, lines_removed) =
                    unified_diff(&target_path, &original, &args.content);
                ("modified", Some(diff), lines_added, lines_removed)
            } else {
                let (diff, lines_added, lines_removed) =
                    unified_diff(&target_path, "", &args.content);
                ("created", Some(diff), lines_added, lines_removed)
            };

        Ok(ToolOutput {
            content: json!({
                "file_path": target_path.to_string_lossy(),
                "change_type": change_type,
                "lines_added": lines_added,
                "lines_removed": lines_removed,
                "modified_ms": modified_ms,
                "diff": diff,
            }),
            metadata: None,
        })
    }
}

#[derive(Deserialize)]
struct EditFileArgs {
    file_path: String,
    old_text: String,
    new_text: String,
    /// Which occurrence of `old_text` to replace (1-indexed).
    /// If omitted, replaces the first occurrence.
    #[serde(default)]
    occurrence: Option<usize>,
}

pub struct EditFileTool;

#[async_trait]
impl zen_tools::Tool<tauri::AppHandle> for EditFileTool {
    fn name(&self) -> &str {
        "edit_file"
    }

    fn description(&self) -> &str {
        "Edits a workspace file by replacing exact old_text with new_text. Returns a unified diff of changes. Use `occurrence` to target a specific match when `old_text` appears multiple times."
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to the file, absolute or relative to the workspace"
                },
                "old_text": {
                    "type": "string",
                    "description": "Exact text to find and replace"
                },
                "new_text": {
                    "type": "string",
                    "description": "Replacement text"
                },
                "occurrence": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "1-indexed occurrence of old_text to replace. Defaults to 1 (the first match). If omitted and old_text is not unique, only the first occurrence is replaced."
                }
            },
            "required": ["file_path", "old_text", "new_text"],
            "additionalProperties": false
        })
    }

    fn risk_level(&self) -> RiskLevel {
        RiskLevel::High
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    async fn execute(
        &self,
        app: AppHandle,
        chat_id: String,
        args: serde_json::Value,
    ) -> Result<ToolOutput, ToolError> {
        let args: EditFileArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArguments {
                details: format!("Invalid edit_file arguments: {}", e),
            })?;

        if args.old_text.is_empty() {
            return Err(ToolError::InvalidArguments {
                details: "old_text cannot be empty".to_string(),
            });
        }

        let state = app.state::<AppState>();
        let workspace = state
            .workspace_for_chat(&chat_id)
            .await
            .map_err(|e| ToolError::ExecutionFailed {
                message: format!("Unable to resolve session workspace: {}", e),
            })?;
        let max_file_bytes = workspace_max_file_bytes(&state).await;
        let target_path = crate::workspace::resolve_workspace_path(&workspace, &args.file_path)
            .map_err(|e| ToolError::PermissionDenied {
                reason: format!("Workspace violation: {}", e),
            })?;

        if !target_path.exists() {
            return Err(ToolError::ExecutionFailed {
                message: format!("File not found: {}", args.file_path),
            });
        }

        enforce_existing_file_size(&target_path, max_file_bytes).await?;
        let original_content = read_text_file(&target_path).await?;

        match apply_targeted_edit(
            &original_content,
            &args.old_text,
            &args.new_text,
            args.occurrence,
        ) {
            TargetedEditResult::Mismatch(details) => {
                Ok(ToolOutput {
                    content: json!({
                        "success": false,
                        "error": "old_text occurrence mismatch",
                        "mismatch": details,
                    }),
                    metadata: None,
                })
            }
            TargetedEditResult::Applied(new_content) => {
                enforce_content_size(new_content.len(), max_file_bytes, "edited file content")?;
                tokio::fs::write(&target_path, &new_content)
                    .await
                    .map_err(|e| ToolError::ExecutionFailed {
                        message: format!("Failed to write edited file: {}", e),
                    })?;

                let modified_ms = super::file_mtime_ms(&target_path).await;

                let (diff, lines_added, lines_removed) =
                    unified_diff(&target_path, &original_content, &new_content);

                Ok(ToolOutput {
                    content: json!({
                        "file_path": target_path.to_string_lossy(),
                        "change_type": "modified",
                        "lines_added": lines_added,
                        "lines_removed": lines_removed,
                        "modified_ms": modified_ms,
                        "diff": diff,
                        "success": true,
                    }),
                    metadata: None,
                })
            }
        }
    }
}

/// A single match of `old_text` within a file's content.
#[derive(Debug, Clone, Copy)]
struct EditMatch {
    /// Inclusive byte offset where the match starts.
    start: usize,
    /// Exclusive byte offset where the match ends.
    end: usize,
    /// 1-indexed line number where the match begins.
    line: usize,
}

#[derive(Debug, Serialize)]
struct EditMismatchDetails {
    old_text: String,
    found_count: usize,
    requested_occurrence: usize,
    matches: Vec<serde_json::Value>,
}

enum TargetedEditResult {
    /// The edit was applied; carries the new content.
    Applied(String),
    /// The requested occurrence could not be resolved; carries structured details.
    Mismatch(EditMismatchDetails),
}

/// Find every occurrence of `old_text` inside `content`, returning byte ranges and lines.
fn find_occurrences(content: &str, old_text: &str) -> Vec<EditMatch> {
    let mut matches = Vec::new();
    let bytes = content.as_bytes();
    let mut start = 0;
    while let Some(pos) = content[start..].find(old_text) {
        let abs_start = start + pos;
        let abs_end = abs_start + old_text.len();
        let line = content[..abs_start].matches('\n').count() + 1;
        matches.push(EditMatch {
            start: abs_start,
            end: abs_end,
            line,
        });
        start = abs_end;
        if start >= bytes.len() {
            break;
        }
    }
    matches
}

/// Fallback matching that normalizes line-endings (CRLF to LF) and trims leading/trailing
/// spaces per line. This prevents edit mismatches from slight spacing or CR differences.
fn find_trimmed_occurrences(content: &str, old_text: &str) -> Vec<EditMatch> {
    let content_lines: Vec<&str> = content.lines().collect();
    let old_lines: Vec<&str> = old_text.lines().map(|l| l.trim()).collect();
    if old_lines.is_empty() {
        return vec![];
    }

    let mut matches = Vec::new();
    let mut line_idx = 0;

    while line_idx + old_lines.len() <= content_lines.len() {
        let mut matches_all = true;
        for i in 0..old_lines.len() {
            if content_lines[line_idx + i].trim() != old_lines[i] {
                matches_all = false;
                break;
            }
        }
        if matches_all {
            let start = content_lines[..line_idx]
                .iter()
                .map(|l| l.len() + 1) // +1 for newline character
                .sum::<usize>();
            let line_block_len = content_lines[line_idx..line_idx + old_lines.len()]
                .iter()
                .map(|l| l.len() + 1)
                .sum::<usize>();
            let end = start + line_block_len.saturating_sub(1);

            matches.push(EditMatch {
                start,
                end: end.min(content.len()),
                line: line_idx + 1,
            });
        }
        line_idx += 1;
    }
    matches
}

/// Apply a targeted edit to `content`, replacing only the requested 1-indexed occurrence.
/// When `occurrence` is `None`, defaults to the first occurrence.
/// Returns `Mismatch` (without writing) when the request cannot be satisfied.
fn apply_targeted_edit(
    content: &str,
    old_text: &str,
    new_text: &str,
    occurrence: Option<usize>,
) -> TargetedEditResult {
    let mut matches = find_occurrences(content, old_text);
    let requested = occurrence.unwrap_or(1).max(1);

    // Fallback 1: Line-ending normalization (CRLF -> LF)
    if matches.is_empty() && (content.contains("\r\n") || old_text.contains("\r\n")) {
        let normalized_content = content.replace("\r\n", "\n");
        let normalized_old = old_text.replace("\r\n", "\n");
        let lf_matches = find_occurrences(&normalized_content, &normalized_old);
        if !lf_matches.is_empty() && requested <= lf_matches.len() {
            let target = &lf_matches[requested - 1];
            let mut new_lf = String::with_capacity(
                normalized_content.len() - normalized_old.len() + new_text.len(),
            );
            new_lf.push_str(&normalized_content[..target.start]);
            new_lf.push_str(&new_text.replace("\r\n", "\n"));
            new_lf.push_str(&normalized_content[target.end..]);
            // Restore CRLF line endings if the original file used them
            let final_content = if content.contains("\r\n") {
                new_lf.replace("\n", "\r\n")
            } else {
                new_lf
            };
            return TargetedEditResult::Applied(final_content);
        }
    }

    // Fallback 2: Trimmed line-by-line whitespace-insensitive matching
    if matches.is_empty() {
        matches = find_trimmed_occurrences(content, old_text);
    }

    if matches.is_empty() {
        return TargetedEditResult::Mismatch(EditMismatchDetails {
            old_text: old_text.to_string(),
            found_count: 0,
            requested_occurrence: requested,
            matches: vec![],
        });
    }

    if requested > matches.len() {
        return TargetedEditResult::Mismatch(EditMismatchDetails {
            old_text: old_text.to_string(),
            found_count: matches.len(),
            requested_occurrence: requested,
            matches: matches
                .into_iter()
                .map(|m| json!({"line": m.line, "start": m.start, "end": m.end}))
                .collect(),
        });
    }

    let target = &matches[requested - 1];
    let mut new_content = String::with_capacity(content.len() - (target.end - target.start) + new_text.len());
    new_content.push_str(&content[..target.start]);
    new_content.push_str(new_text);
    new_content.push_str(&content[target.end..]);

    TargetedEditResult::Applied(new_content)
}

/// Public entry point shared by both the `EditFileTool` and the agent-side
/// `EditFileTool` (in `agent/tools/fs_tools.rs`) so the targeted-edit contract
/// has exactly one owner.
pub async fn execute_targeted_edit(
    app: &AppHandle,
    chat_id: String,
    file_path: String,
    old_text: String,
    new_text: String,
    occurrence: Option<usize>,
) -> Result<ToolOutput, ToolError> {
    let args = json!({
        "file_path": file_path,
        "old_text": old_text,
        "new_text": new_text,
        "occurrence": occurrence,
    });
    let tool = EditFileTool;
    Tool::execute(&tool, app.clone(), chat_id, args).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apply_targeted_edit_defaults_to_first_occurrence() {
        // When `occurrence` is None, replace only the first match.
        let content = "alpha foo middle foo tail";
        match apply_targeted_edit(content, "foo", "BAR", None) {
            TargetedEditResult::Applied(new_content) => {
                assert_eq!(new_content, "alpha BAR middle foo tail");
            }
            TargetedEditResult::Mismatch(details) => panic!(
                "expected Applied, got Mismatch with found_count={}",
                details.found_count
            ),
        }
    }

    #[test]
    fn apply_targeted_edit_selects_second_occurrence() {
        let content = "alpha foo middle foo tail";
        match apply_targeted_edit(content, "foo", "BAR", Some(2)) {
            TargetedEditResult::Applied(new_content) => {
                assert_eq!(new_content, "alpha foo middle BAR tail");
            }
            TargetedEditResult::Mismatch(details) => panic!(
                "expected Applied, got Mismatch with found_count={}",
                details.found_count
            ),
        }
    }

    #[test]
    fn apply_targeted_edit_returns_structured_mismatch() {
        // When `old_text` is missing entirely, found_count must be 0 and
        // matches must be empty.
        let content = "alpha foo middle foo tail";
        match apply_targeted_edit(content, "missing", "BAR", None) {
            TargetedEditResult::Mismatch(details) => {
                assert_eq!(details.found_count, 0);
                assert_eq!(details.requested_occurrence, 1);
                assert_eq!(details.old_text, "missing");
                assert!(details.matches.is_empty());
                // Sanity: the structured detail serializes to JSON without errors.
                let serialized = serde_json::to_value(&details).expect("serialize mismatch");
                assert_eq!(serialized["found_count"], serde_json::json!(0));
                assert_eq!(serialized["requested_occurrence"], serde_json::json!(1));
            }
            TargetedEditResult::Applied(_) => panic!("expected Mismatch, got Applied"),
        }

        // When `old_text` appears twice but `occurrence` is too large, the
        // mismatch should report the actual matches with their line positions.
        let mismatch_details = match apply_targeted_edit(content, "foo", "BAR", Some(5)) {
            TargetedEditResult::Mismatch(details) => details,
            TargetedEditResult::Applied(_) => panic!("expected Mismatch, got Applied"),
        };
        assert_eq!(mismatch_details.found_count, 2);
        assert_eq!(mismatch_details.requested_occurrence, 5);
        assert_eq!(mismatch_details.matches.len(), 2);
        let serialized = serde_json::to_value(&mismatch_details).expect("serialize mismatch");
        assert_eq!(serialized["found_count"], serde_json::json!(2));
        assert_eq!(serialized["matches"][0]["line"], serde_json::json!(1));
        assert_eq!(serialized["matches"][1]["line"], serde_json::json!(2));
    }

    #[test]
    fn apply_targeted_edit_line_ending_fallback() {
        let content = "alpha\r\nbeta\r\ngamma";
        let search = "alpha\nbeta";
        match apply_targeted_edit(content, search, "NEW_TEXT", None) {
            TargetedEditResult::Applied(new_content) => {
                assert_eq!(new_content, "NEW_TEXT\r\ngamma");
            }
            TargetedEditResult::Mismatch(_) => panic!("expected Applied via CRLF normalization"),
        }
    }

    #[test]
    fn apply_targeted_edit_trimmed_fallback() {
        let content = "  alpha\n    beta\n  gamma";
        let search = "alpha\nbeta";
        match apply_targeted_edit(content, search, "NEW_TEXT", None) {
            TargetedEditResult::Applied(new_content) => {
                assert_eq!(new_content, "NEW_TEXT\n  gamma");
            }
            TargetedEditResult::Mismatch(_) => {
                panic!("expected Applied via trimmed line-by-line fallback")
            }
        }
    }
}
