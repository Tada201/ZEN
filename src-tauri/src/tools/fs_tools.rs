use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use super::{permission::RiskLevel, Tool, ToolError, ToolOutput};
use crate::commands::AppState;

// ─── 1. VectorSearchTool ───
pub struct VectorSearchTool;

#[derive(Deserialize)]
struct VectorSearchArgs {
    query: String,
    limit: Option<usize>,
}

#[async_trait]
impl Tool for VectorSearchTool {
    fn name(&self) -> &str {
        "vector_search"
    }

    fn description(&self) -> &str {
        "Performs a semantic vector search over all ingested documents in the local knowledge base. Use this to find information relevant to a semantic query."
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The semantic search query"
                },
                "limit": {
                    "type": "integer",
                    "description": "Number of results to return (default: 5)"
                }
            },
            "required": ["query"]
        })
    }

    fn risk_level(&self) -> RiskLevel {
        RiskLevel::Low
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
        let parsed_args: VectorSearchArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArguments {
                details: format!("Invalid arguments: {}", e),
            })?;

        let state = app.state::<AppState>();

        let pool = state.db().await.map_err(|e| ToolError::ExecutionFailed {
            message: format!("DB error: {}", e),
        })?;
        let model_name = crate::db::queries::get_setting(&pool, "embedding_model")
            .await
            .unwrap_or_default()
            .unwrap_or_else(|| "nomic-embed-text".to_string());

        let provider = state
            .provider()
            .await
            .map_err(|e| ToolError::ExecutionFailed {
                message: format!("LLM not initialized: {}", e),
            })?;
        let query_vec = provider
            .embed(&model_name, &parsed_args.query)
            .await
            .map_err(|e| ToolError::ExecutionFailed {
                message: format!("Embedding failed: {}", e),
            })?;

        let limit = parsed_args.limit.unwrap_or(5).clamp(1, 20);
        let results =
            state
                .search_rag(query_vec, limit)
                .await
                .map_err(|e| ToolError::ExecutionFailed {
                    message: format!("Vector search failed: {}", e),
                })?;

        if results.is_empty() {
            return Ok(ToolOutput {
                content: json!({"status": "no results found for query"}),
                metadata: None,
            });
        }

        let mut formatted_results = Vec::new();
        for res in results {
            formatted_results.push(json!({
                "source": res.chunk.source,
                "text": res.chunk.text,
                "score": res.score,
            }));
        }

        Ok(ToolOutput {
            content: json!({"results": formatted_results}),
            metadata: None,
        })
    }
}

// ─── 2. ListDocumentsTool ───
pub struct ListDocumentsTool;

#[async_trait]
impl Tool for ListDocumentsTool {
    fn name(&self) -> &str {
        "list_documents"
    }

    fn description(&self) -> &str {
        "Lists all documents currently ingested and available in the local knowledge base."
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {},
            "required": []
        })
    }

    fn risk_level(&self) -> RiskLevel {
        RiskLevel::Low
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    async fn execute(
        &self,
        app: AppHandle,
        _chat_id: String,
        _args: serde_json::Value,
    ) -> Result<ToolOutput, ToolError> {
        let state = app.state::<AppState>();
        let pool = state.db().await.map_err(|e| ToolError::ExecutionFailed {
            message: format!("DB error: {}", e),
        })?;
        let docs = crate::db::queries::list_documents(&pool)
            .await
            .map_err(|e| ToolError::ExecutionFailed {
                message: format!("Failed to list docs: {}", e),
            })?;

        let mut formatted_docs = Vec::new();
        for doc in docs {
            formatted_docs.push(json!({
                "id": doc.id,
                "file_name": doc.filename,
                "file_path": doc.file_path,
                "status": doc.status,
            }));
        }

        Ok(ToolOutput {
            content: json!({"documents": formatted_docs}),
            metadata: None,
        })
    }
}

// ─── 3. ReadDocumentTool ───
pub struct ReadDocumentTool;

#[derive(Deserialize)]
struct ReadDocumentArgs {
    file_path: String,
}

#[async_trait]
impl Tool for ReadDocumentTool {
    fn name(&self) -> &str {
        "read_document_content"
    }

    fn description(&self) -> &str {
        "Reads the raw text content of a specific file. Provide an absolute path, a relative path, or just the filename."
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to the file or just the filename"
                }
            },
            "required": ["file_path"]
        })
    }

    fn risk_level(&self) -> RiskLevel {
        RiskLevel::Medium
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
        let parsed_args: ReadDocumentArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArguments {
                details: format!("Invalid arguments: {}", e),
            })?;

        let state = app.state::<AppState>();
        let workspace = state.workspace_folder.read().await.clone();
        let max_file_bytes = workspace_max_file_bytes(&state).await;
        let pool = state.db().await.map_err(|e| ToolError::ExecutionFailed {
            message: format!("DB error: {}", e),
        })?;

        // 1. First try as direct absolute path
        let mut target_path = PathBuf::from(&parsed_args.file_path);

        // 2. If it doesn't exist, check if it's a known ingested document by filename or ID
        if !target_path.exists() {
            if let Ok(docs) = crate::db::queries::list_documents(&pool).await {
                if let Some(doc) = docs
                    .into_iter()
                    .find(|d| d.filename == parsed_args.file_path || d.id == parsed_args.file_path)
                {
                    if let Some(doc_path) = doc.file_path {
                        target_path = PathBuf::from(doc_path);
                    }
                }
            }
        }

        // 3. If STILL not found, try it relative to the active workspace.
        if !target_path.exists() {
            if let Ok(relative_path) =
                crate::workspace::resolve_workspace_path(&workspace, &parsed_args.file_path)
            {
                if relative_path.exists() {
                    target_path = relative_path;
                }
            }
        }

        if !target_path.exists() {
            return Err(ToolError::ExecutionFailed {
                message: format!(
                    "File not found. Searched database and local paths for: {}",
                    parsed_args.file_path
                ),
            });
        }

        let target_path = crate::workspace::validate_workspace_path(&workspace, &target_path)
            .map_err(|e| ToolError::ExecutionFailed {
                message: format!("Workspace violation: {}", e),
            })?;

        enforce_existing_file_size(&target_path, max_file_bytes).await?;

        let content = tokio::fs::read_to_string(&target_path).await.map_err(|e| {
            ToolError::ExecutionFailed {
                message: format!("Failed to read file (might be binary?): {}", e),
            }
        })?;

        // Truncate if too long (e.g. max 32KB of text)
        let max_len = 32 * 1024;
        let final_text = if content.len() > max_len {
            format!(
                "{}... [TRUNCATED - Content exceeded 32KB limit]",
                &content[..max_len]
            )
        } else {
            content
        };

        Ok(ToolOutput {
            content: json!({
                "file_path": target_path.to_string_lossy(),
                "content": final_text
            }),
            metadata: None,
        })
    }
}

// ─── Grep Documents Tool ───

#[derive(Deserialize)]
pub struct GrepDocumentsArgs {
    pub query: String,
    pub case_sensitive: Option<bool>,
}

pub struct GrepDocumentsTool;

#[async_trait]
impl Tool for GrepDocumentsTool {
    fn name(&self) -> &str {
        "grep_documents"
    }

    fn description(&self) -> &str {
        "Performs a text-based search (grep) for a substring query across all documents in the workspace. Use this to find specific keywords or patterns in the codebase/linked documents when vector search is unavailable or imprecise."
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The text pattern to search for"
                },
                "case_sensitive": {
                    "type": "boolean",
                    "description": "Whether the search should be case sensitive (default: false)"
                }
            },
            "required": ["query"]
        })
    }

    fn risk_level(&self) -> RiskLevel {
        RiskLevel::Low
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
        let parsed_args: GrepDocumentsArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArguments {
                details: format!("Invalid arguments: {}", e),
            })?;

        let state = app.state::<AppState>();
        let workspace = state.workspace_folder.read().await.clone();
        let max_file_bytes = workspace_max_file_bytes(&state).await;
        let pool = state.db().await.map_err(|e| ToolError::ExecutionFailed {
            message: format!("DB error: {}", e),
        })?;
        let docs = crate::db::queries::list_documents(&pool)
            .await
            .map_err(|e| ToolError::ExecutionFailed {
                message: e.to_string(),
            })?;

        let mut results = Vec::new();
        let query = if parsed_args.case_sensitive.unwrap_or(false) {
            parsed_args.query.clone()
        } else {
            parsed_args.query.to_lowercase()
        };

        for doc in docs {
            if let Some(path_str) = doc.file_path {
                let path = Path::new(&path_str);
                if path.exists() {
                    let Ok(path) = crate::workspace::validate_workspace_path(&workspace, path)
                    else {
                        continue;
                    };

                    if enforce_existing_file_size(&path, max_file_bytes)
                        .await
                        .is_err()
                    {
                        continue;
                    }

                    if let Ok(content) = tokio::fs::read_to_string(&path).await {
                        let search_content = if parsed_args.case_sensitive.unwrap_or(false) {
                            content.clone()
                        } else {
                            content.to_lowercase()
                        };

                        if search_content.contains(&query) {
                            // Find matching lines
                            let mut matches = Vec::new();
                            for (idx, line) in content.lines().enumerate() {
                                let search_line = if parsed_args.case_sensitive.unwrap_or(false) {
                                    line.to_string()
                                } else {
                                    line.to_lowercase()
                                };

                                if search_line.contains(&query) {
                                    matches.push(json!({
                                        "line": idx + 1,
                                        "content": line.trim()
                                    }));
                                }

                                if matches.len() >= 10 {
                                    // Limit matches per file
                                    break;
                                }
                            }

                            results.push(json!({
                                "filename": doc.filename,
                                "path": path_str,
                                "matches": matches
                            }));
                        }
                    }
                }
            }

            if results.len() >= 20 {
                // Limit total files
                break;
            }
        }

        Ok(ToolOutput {
            content: json!({
                "results": results,
                "count": results.len()
            }),
            metadata: None,
        })
    }
}

#[derive(Deserialize)]
struct WriteFileArgs {
    file_path: String,
    content: String,
}

pub struct WriteFileTool;

#[async_trait]
impl Tool for WriteFileTool {
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
        _chat_id: String,
        args: serde_json::Value,
    ) -> Result<ToolOutput, ToolError> {
        let args: WriteFileArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArguments {
                details: format!("Invalid write_file arguments: {}", e),
            })?;

        let state = app.state::<AppState>();
        let workspace = state.workspace_folder.read().await.clone();
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

        let (change_type, diff, lines_added, lines_removed) =
            if let Some(original) = original_content {
                let (diff, lines_added, lines_removed) =
                    unified_diff(&target_path, &original, &args.content);
                ("modified", Some(diff), lines_added, lines_removed)
            } else {
                ("created", None, args.content.lines().count(), 0)
            };

        Ok(ToolOutput {
            content: json!({
                "file_path": target_path.to_string_lossy(),
                "change_type": change_type,
                "lines_added": lines_added,
                "lines_removed": lines_removed,
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
impl Tool for EditFileTool {
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
        _chat_id: String,
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
        let workspace = state.workspace_folder.read().await.clone();
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

                let (diff, lines_added, lines_removed) =
                    unified_diff(&target_path, &original_content, &new_content);

                Ok(ToolOutput {
                    content: json!({
                        "file_path": target_path.to_string_lossy(),
                        "change_type": "modified",
                        "lines_added": lines_added,
                        "lines_removed": lines_removed,
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
        // Count newlines BEFORE the match start; +1 gives the 1-indexed line
        // number. Using `lines().count()` was off-by-one for matches on the
        // first line because `lines()` returns at least one chunk for any
        // non-empty prefix (so `"alpha "`.lines().count() == 1, making the
        // reported line "2" when the match is actually on line 1).
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

/// Apply a targeted edit to `content`, replacing only the requested 1-indexed occurrence.
/// When `occurrence` is `None`, defaults to the first occurrence.
/// Returns `Mismatch` (without writing) when the request cannot be satisfied.
fn apply_targeted_edit(
    content: &str,
    old_text: &str,
    new_text: &str,
    occurrence: Option<usize>,
) -> TargetedEditResult {
    let matches = find_occurrences(content, old_text);
    let requested = occurrence.unwrap_or(1).max(1);

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
    let mut new_content = String::with_capacity(content.len() - old_text.len() + new_text.len());
    new_content.push_str(&content[..target.start]);
    new_content.push_str(new_text);
    new_content.push_str(&content[target.end..]);

    TargetedEditResult::Applied(new_content)
}

/// Public entry point used by both the `EditFileTool` and the agent-side
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
    let args = serde_json::json!({
        "file_path": file_path,
        "old_text": old_text,
        "new_text": new_text,
        "occurrence": occurrence,
    });
    let tool = EditFileTool;
    Tool::execute(&tool, app.clone(), chat_id, args).await
}

async fn read_text_file(path: &Path) -> Result<String, ToolError> {
    tokio::fs::read_to_string(path)
        .await
        .map_err(|e| ToolError::ExecutionFailed {
            message: format!("Failed to read file as UTF-8 text: {}", e),
        })
}

async fn workspace_max_file_bytes(state: &AppState) -> u64 {
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

async fn enforce_existing_file_size(path: &Path, max_bytes: u64) -> Result<(), ToolError> {
    let metadata = tokio::fs::metadata(path)
        .await
        .map_err(|e| ToolError::ExecutionFailed {
            message: format!("Failed to inspect file size: {}", e),
        })?;
    enforce_content_size(metadata.len() as usize, max_bytes, "file")
}

fn enforce_content_size(size_bytes: usize, max_bytes: u64, label: &str) -> Result<(), ToolError> {
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

fn unified_diff(path: &Path, old: &str, new: &str) -> (String, usize, usize) {
    use similar::{ChangeTag, TextDiff};

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
}
