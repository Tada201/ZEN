//! `apply_patch` tool — applies a structured multi-file patch to the
//! workspace. Patches are parsed by `super::patch_parser` into a sequence of
//! `AddFile` / `DeleteFile` / `UpdateFile` hunks; each hunk is run through the
//! same workspace guards the other write tools use.

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::json;
use tauri::{AppHandle, Manager};

use crate::commands::AppState;
use crate::tools::permission::RiskLevel;
use crate::tools::{Tool, ToolError, ToolOutput};

use super::{
    enforce_content_size, enforce_existing_file_size, read_text_file, unified_diff,
    workspace_max_file_bytes,
};

#[derive(Deserialize)]
struct ApplyPatchArgs {
    patch: String,
}

pub struct ApplyPatchTool;

#[async_trait]
impl Tool for ApplyPatchTool {
    fn name(&self) -> &str {
        "apply_patch"
    }

    fn description(&self) -> &str {
        "Applies a structured multi-file patch (Add, Delete, or Search/Replace Update) to the workspace. \
         Format updates like this:\n\
         *** Update File: <path>\n\
         <<<<<<< SEARCH\n\
         <lines to find>\n\
         =======\n\
         <replacement lines>\n\
         >>>>>>> REPLACE"
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "patch": {
                    "type": "string",
                    "description": "The patch contents to parse and apply"
                }
            },
            "required": ["patch"],
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
        _chat_id: String,
        args: serde_json::Value,
    ) -> Result<ToolOutput, ToolError> {
        let args: ApplyPatchArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArguments {
                details: format!("Invalid apply_patch arguments: {}", e),
            })?;

        let hunks = super::super::patch_parser::parse_patches(&args.patch).map_err(|e| {
            ToolError::InvalidArguments {
                details: format!("Failed to parse patch: {}", e),
            }
        })?;

        let state = app.state::<AppState>();
        let workspace = state.workspace_folder.read().await.clone();
        let max_file_bytes = workspace_max_file_bytes(&state).await;

        // ── Plan-Mode per-hunk check ──────────────────────────────────────
        // `apply_patch` arguments carry the patch as a single string instead
        // of a per-target `path` field, so PermissionDecision::from_input in
        // permission.rs can't read a file target. We parse first, then enforce
        // the same plans-root exception that `write_file` uses, one hunk at a
        // time. Reject the whole patch if ANY target falls outside plans_root
        // — the legacy substring check used by the single-target path cannot
        // see embedded patch headers and would have allowed mass writes.
        enforce_plan_mode_for_hunks(&state, &hunks, &workspace).await?;

        let mut results = Vec::new();

        for hunk in hunks {
            match hunk {
                super::super::patch_parser::PatchHunk::AddFile { path, content } => {
                    let target_path = crate::workspace::resolve_workspace_path(
                        &workspace,
                        path.to_str().unwrap_or(""),
                    )
                    .map_err(|e| ToolError::PermissionDenied {
                        reason: format!("Workspace violation: {}", e),
                    })?;

                    if let Some(parent) = target_path.parent() {
                        tokio::fs::create_dir_all(parent).await.map_err(|e| {
                            ToolError::ExecutionFailed {
                                message: format!("Failed to create directories: {}", e),
                            }
                        })?;
                    }

                    enforce_content_size(content.len(), max_file_bytes, "new file content")?;
                    tokio::fs::write(&target_path, &content).await.map_err(|e| {
                        ToolError::ExecutionFailed {
                            message: format!("Failed to write file: {}", e),
                        }
                    })?;

                    results.push(json!({
                        "file_path": path.to_string_lossy(),
                        "change_type": "added",
                        "success": true,
                    }));
                }
                super::super::patch_parser::PatchHunk::DeleteFile { path } => {
                    let target_path = crate::workspace::resolve_workspace_path(
                        &workspace,
                        path.to_str().unwrap_or(""),
                    )
                    .map_err(|e| ToolError::PermissionDenied {
                        reason: format!("Workspace violation: {}", e),
                    })?;

                    if target_path.exists() {
                        tokio::fs::remove_file(&target_path).await.map_err(|e| {
                            ToolError::ExecutionFailed {
                                message: format!("Failed to delete file: {}", e),
                            }
                        })?;
                    }

                    results.push(json!({
                        "file_path": path.to_string_lossy(),
                        "change_type": "deleted",
                        "success": true,
                    }));
                }
                super::super::patch_parser::PatchHunk::UpdateFile {
                    path,
                    search,
                    replace,
                } => {
                    let target_path = crate::workspace::resolve_workspace_path(
                        &workspace,
                        path.to_str().unwrap_or(""),
                    )
                    .map_err(|e| ToolError::PermissionDenied {
                        reason: format!("Workspace violation: {}", e),
                    })?;

                    if !target_path.exists() {
                        return Err(ToolError::ExecutionFailed {
                            message: format!(
                                "Update target file does not exist: {}",
                                path.display()
                            ),
                        });
                    }

                    enforce_existing_file_size(&target_path, max_file_bytes).await?;
                    let original_content = read_text_file(&target_path).await?;

                    if let Some((start, end)) = find_hunk_match(&original_content, &search) {
                        let mut new_content = String::with_capacity(
                            original_content.len() + replace.len() - search.len(),
                        );
                        new_content.push_str(&original_content[..start]);
                        new_content.push_str(&replace);
                        new_content.push_str(&original_content[end..]);

                        enforce_content_size(
                            new_content.len(),
                            max_file_bytes,
                            "edited file content",
                        )?;
                        tokio::fs::write(&target_path, &new_content)
                            .await
                            .map_err(|e| ToolError::ExecutionFailed {
                                message: format!("Failed to write updated file: {}", e),
                            })?;

                        let (diff, lines_added, lines_removed) =
                            unified_diff(&target_path, &original_content, &new_content);

                        results.push(json!({
                            "file_path": path.to_string_lossy(),
                            "change_type": "modified",
                            "lines_added": lines_added,
                            "lines_removed": lines_removed,
                            "diff": diff,
                            "success": true,
                        }));
                    } else {
                        return Err(ToolError::ExecutionFailed {
                            message: format!(
                                "Patch update failed: Search block not found in {}",
                                path.display()
                            ),
                        });
                    }
                }
            }
        }

        Ok(ToolOutput {
            content: json!({
                "success": true,
                "results": results,
            }),
            metadata: None,
        })
    }
}

/// Pre-flight guard for `apply_patch` in Plan Mode. Resolves each hunk's
/// declared path against the workspace, then requires that the resolved
/// target live inside `<workspace>/plans/` (the same plans-root exception
/// single-target write tools use). If Plan Mode is NOT active, this is a
/// no-op — regular ToolPermissions still apply via the runner-level check.
async fn enforce_plan_mode_for_hunks(
    state: &AppState,
    hunks: &[super::super::patch_parser::PatchHunk],
    workspace: &std::path::Path,
) -> Result<(), ToolError> {
    use crate::tools::permission::is_within_plans_root;

    let mode = state
        .settings_manager
        .get("tool_permission_mode")
        .await
        .ok()
        .flatten()
        .unwrap_or_default();
    let yolo = state
        .settings_manager
        .get("tool_yolo_mode")
        .await
        .ok()
        .flatten()
        .unwrap_or_default();
    let effective_mode = if yolo == "true" || mode == "yolo" {
        "yolo"
    } else {
        mode.as_str()
    };
    if effective_mode != "plan_mode" {
        return Ok(());
    }

    let plans_root = workspace.join("plans");

    for hunk in hunks {
        let decl = match hunk {
            super::super::patch_parser::PatchHunk::AddFile { path, .. }
            | super::super::patch_parser::PatchHunk::DeleteFile { path }
            | super::super::patch_parser::PatchHunk::UpdateFile { path, .. } => path,
        };
        let resolved = crate::workspace::resolve_workspace_path(
            workspace,
            decl.to_str().unwrap_or(""),
        )
        .map_err(|e| ToolError::PermissionDenied {
            reason: format!("Workspace violation: {}", e),
        })?;
        let resolved_str = resolved.to_string_lossy();
        if !is_within_plans_root(&resolved_str, &plans_root) {
            return Err(ToolError::PermissionDenied {
                reason: format!(
                    "Patch target '{}' blocked by Plan Mode (read-only). Plan-mode writes are allowed only inside {}.",
                    resolved.display(),
                    plans_root.display(),
                ),
            });
        }
    }
    Ok(())
}

fn find_hunk_match(content: &str, search: &str) -> Option<(usize, usize)> {
    if search.is_empty() {
        return Some((0, 0));
    }

    // Strict mode for `apply_patch`: ONLY exact byte-level matches are
    // accepted. The legacy CRLF-normalised / lowercase-and-trimmed
    // path was the source of an ambiguity bug — a non-exact search
    // block silently rewrote the first candidate that *happened* to
    // match after case / whitespace normalisation, which could land on
    // the wrong code region in real files. We now require an
    // unambiguous exact match; if that fails, the call returns a
    // structured `ToolError::ExecutionFailed` whose error string names
    // the search block so the model can self-correct.
    content.find(search).map(|pos| (pos, pos + search.len()))
}

#[cfg(test)]
mod find_hunk_match_strict {
    //! Strict matching for `apply_patch` — no lenient fallback.
    //!
    //! These tests pin the new contract: only exact byte-level matches
    //! are accepted. CRLF / whitespace / case variants that the legacy
    //! normalised path used to accept MUST now return `None` so the
    //! caller surfaces a structured failure instead of silently
    //! rewriting the wrong code region.

    use super::find_hunk_match;

    #[test]
    fn empty_search_returns_zero_range() {
        assert_eq!(find_hunk_match("anything", ""), Some((0, 0)));
    }

    #[test]
    fn exact_match_returns_byte_offsets() {
        let content = "alpha\nbeta\ngamma\n";
        let search = "beta";
        let (start, end) = find_hunk_match(content, search).expect("exact match");
        // First byte of "beta"
        assert_eq!(start, 6);
        assert_eq!(end, 10);
    }

    #[test]
    fn multiline_exact_match_lands_at_first_occurrence() {
        let content = "intro\nalpha\nbeta\ngamma\n";
        let search = "alpha\nbeta";
        let (start, end) = find_hunk_match(content, search).expect("exact match");
        assert_eq!(&content[start..end], search);
    }

    #[test]
    fn crlf_mismatch_is_not_a_match() {
        // Legacy lenient mode used to translate CRLF -> LF and accept
        // the LF search block against CRLF content. Under strict mode
        // this MUST return None so the caller surfaces an error rather
        // than rewriting the wrong region.
        let content = "alpha\r\nbeta\r\ngamma";
        let search = "alpha\nbeta";
        assert_eq!(find_hunk_match(content, search), None);
    }

    #[test]
    fn case_mismatch_is_not_a_match() {
        // Lowercase-only normalisation used to collapse this. Strict
        // mode requires an exact byte-level match — the model must
        // re-issue the search block with the right case.
        let content = "function FOO() { return 1; }";
        let search = "function foo()";
        assert_eq!(find_hunk_match(content, search), None);
    }

    #[test]
    fn whitespace_mismatch_is_not_a_match() {
        // Trimmed-line normalisation used to accept a 4-space indented
        // search against a 2-space indented target. Under strict mode
        // leading whitespace differences must be preserved so the
        // model aligns to the actual file.
        let content = "fn x() {\n  body\n}";
        let search = "fn x() {\n    body";
        assert_eq!(find_hunk_match(content, search), None);
    }

    #[test]
    fn duplicated_normalised_blocks_prevent_ambiguous_silent_apply() {
        // The motivating bug: the file contains TWO blocks that
        // lowercase-and-trim to the same string but are semantically
        // distinct (one inside `if (debug)` and one inside
        // `if (release)`). The lenient mode picked the FIRST match
        // and rewrote correctly — but if the search block had been
        // mis-keyed, the second block ended up silently updated in a
        // different code region.
        //
        // Under strict mode, the mis-keyed lowercase-only `search`
        // must NOT match either block. The operator must re-issue the
        // patch with the exact block they want.
        let content = "\
if (debug) {\n  ENABLE_LOG();\n}\n\
if (release) {\n  ENABLE_LOG();\n}\n";
        // Lowercase-only form that doesn't appear verbatim.
        let search = "if (debug) {\n  enable_log();";
        assert_eq!(find_hunk_match(content, search), None);

        // And the exact form DOES match — and at the FIRST occurrence,
        // never a random one picked by normalisation.
        let exact_search = "if (debug) {\n  ENABLE_LOG();\n}";
        let (start, end) = find_hunk_match(content, exact_search).expect("exact match");
        assert_eq!(&content[start..end], exact_search);
    }

    #[test]
    fn no_match_returns_none_so_caller_surfaces_structured_failure() {
        let content = "first\nsecond\nthird\n";
        let search = "fourofour";
        assert_eq!(find_hunk_match(content, search), None);
    }
}
