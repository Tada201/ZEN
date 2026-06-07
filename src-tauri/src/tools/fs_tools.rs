use async_trait::async_trait;
use serde::Deserialize;
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
}

pub struct EditFileTool;

#[async_trait]
impl Tool for EditFileTool {
    fn name(&self) -> &str {
        "edit_file"
    }

    fn description(&self) -> &str {
        "Edits a workspace file by replacing exact old_text with new_text. Returns a unified diff of changes."
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
        if !original_content.contains(&args.old_text) {
            return Err(ToolError::ExecutionFailed {
                message: "old_text not found in file; ensure exact match including whitespace"
                    .to_string(),
            });
        }

        let new_content = original_content.replace(&args.old_text, &args.new_text);
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
