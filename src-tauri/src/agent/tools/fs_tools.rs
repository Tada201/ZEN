use crate::agent::tools::AgentTool;
use crate::commands::AppState;
use anyhow::Result;
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;

// ─── 1. ListDocumentsTool ───
pub struct ListDocumentsTool;

#[async_trait]
impl AgentTool for ListDocumentsTool {
    fn id(&self) -> &str {
        "list_documents"
    }

    fn description(&self) -> &str {
        "Lists uploaded documents with their exact recorded file paths. Call this first when the relevant file path is unknown, then use read_document_content for authoritative contents. \
         The returned file_path should be passed to read_document_content."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {},
            "additionalProperties": false
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        _chat_id: String,
        _input: Value,
        _depth: u32,
        _allowed_tools: Option<Arc<Mutex<HashSet<String>>>>,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let state = app.state::<AppState>();
        let docs = crate::db::queries::list_documents(
            &state
                .db()
                .await
                .map_err(|e| anyhow::anyhow!("DB init failed: {}", e))?,
        )
        .await?;

        let mut formatted_docs = Vec::new();
        for doc in docs {
            formatted_docs.push(json!({
                "id": doc.id,
                "file_name": doc.filename,
                "file_path": doc.file_path,
                "status": doc.status,
            }));
        }

        Ok(json!({ "documents": formatted_docs }))
    }
}

// ─── 2. ReadDocumentTool ───
pub struct ReadDocumentTool;

#[derive(Deserialize)]
struct ReadDocumentArgs {
    file_path: String,
}

#[async_trait]
impl AgentTool for ReadDocumentTool {
    fn id(&self) -> &str {
        "read_document_content"
    }

    fn description(&self) -> &str {
        "Reads authoritative raw text from one uploaded or workspace file. Prefer the exact file_path returned by list_documents; absolute paths, workspace-relative paths, IDs, and exact filenames are accepted."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to the file, ID, or filename from the document list"
                }
            },
            "required": ["file_path"],
            "additionalProperties": false
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<Arc<Mutex<HashSet<String>>>>,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let args: ReadDocumentArgs = serde_json::from_value(input)?;
        if args.file_path.trim().is_empty() {
            anyhow::bail!("file_path must not be empty");
        }
        let state = app.state::<AppState>();
        let workspace = state
            .workspace_for_chat(&chat_id)
            .await
            .map_err(|e| anyhow::anyhow!("Unable to resolve session workspace: {}", e))?;

        // Resolve path
        let mut target_path = PathBuf::from(&args.file_path);

        if !target_path.exists() {
            let docs = crate::db::queries::list_documents(
                &state
                    .db()
                    .await
                    .map_err(|e| anyhow::anyhow!("DB init failed: {}", e))?,
            )
            .await?;
            if let Some(doc) = docs
                .into_iter()
                .find(|d| d.filename == args.file_path || d.id == args.file_path)
            {
                if let Some(doc_path) = doc.file_path {
                    target_path = PathBuf::from(&doc_path);
                }
            }
        }

        if !target_path.exists() {
            if let Ok(relative_path) =
                crate::workspace::resolve_workspace_path(&workspace, &args.file_path)
            {
                if relative_path.exists() {
                    target_path = relative_path;
                }
            }
        }

        if !target_path.exists() {
            return Ok(json!({ "error": format!("File not found: {}", args.file_path) }));
        }

        let target_path = crate::workspace::validate_workspace_path(&workspace, &target_path)
            .map_err(|e| anyhow::anyhow!("Workspace violation: {}", e))?;
        let max_file_bytes = crate::tools::fs_tools::workspace_max_file_bytes(&state).await;
        crate::tools::fs_tools::enforce_existing_file_size(&target_path, max_file_bytes)
            .await
            .map_err(|error| anyhow::anyhow!(error.to_string()))?;

        let content = tokio::fs::read_to_string(&target_path).await?;

        // Truncate to avoid context overflow
        let max_len = 24 * 1024;
        let final_text = if content.len() > max_len {
            format!(
                "{}... [TRUNCATED]",
                crate::tools::fs_tools::truncate_utf8(&content, max_len)
            )
        } else {
            content
        };

        Ok(json!({
            "file_path": target_path.to_string_lossy(),
            "content": final_text
        }))
    }
}

// ─── 3. GrepDocumentsTool ───
pub struct GrepDocumentsTool;

#[derive(Deserialize)]
struct GrepDocumentsArgs {
    query: String,
    case_sensitive: Option<bool>,
}

#[async_trait]
impl AgentTool for GrepDocumentsTool {
    fn id(&self) -> &str {
        "grep_documents"
    }

    fn description(&self) -> &str {
        "Searches indexed uploaded documents for an exact substring or keyword. Use this for discovery, then call read_document_content on each relevant returned file before summarizing or relying on its contents."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": { "type": "string", "description": "Specific keyword or phrase" },
                "case_sensitive": { "type": "boolean", "default": false }
            },
            "required": ["query"],
            "additionalProperties": false
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<Arc<Mutex<HashSet<String>>>>,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let args: GrepDocumentsArgs = serde_json::from_value(input)?;
        if args.query.trim().is_empty() {
            anyhow::bail!("query must not be empty");
        }
        let state = app.state::<AppState>();
        let workspace = state
            .workspace_for_chat(&chat_id)
            .await
            .map_err(|e| anyhow::anyhow!("Unable to resolve session workspace: {}", e))?;
        let docs = crate::db::queries::list_documents(
            &state
                .db()
                .await
                .map_err(|e| anyhow::anyhow!("DB init failed: {}", e))?,
        )
        .await?;
        let max_file_bytes = crate::tools::fs_tools::workspace_max_file_bytes(&state).await;

        let mut results = Vec::new();
        let query = if args.case_sensitive.unwrap_or(false) {
            args.query.clone()
        } else {
            args.query.to_lowercase()
        };

        for doc in docs {
            if let Some(path_str) = doc.file_path {
                let path = Path::new(&path_str);
                if path.exists() {
                    let Ok(path) = crate::workspace::validate_workspace_path(&workspace, path)
                    else {
                        continue;
                    };

                    if crate::tools::fs_tools::enforce_existing_file_size(&path, max_file_bytes)
                        .await
                        .is_err()
                    {
                        continue;
                    }

                    if let Ok(content) = tokio::fs::read_to_string(&path).await {
                        let search_content = if args.case_sensitive.unwrap_or(false) {
                            content.clone()
                        } else {
                            content.to_lowercase()
                        };

                        if search_content.contains(&query) {
                            let mut matches = Vec::new();
                            for (idx, line) in content.lines().enumerate() {
                                let search_line = if args.case_sensitive.unwrap_or(false) {
                                    line.to_string()
                                } else {
                                    line.to_lowercase()
                                };
                                if search_line.contains(&query) {
                                    matches
                                        .push(json!({ "line": idx + 1, "content": line.trim() }));
                                }
                                if matches.len() >= 5 {
                                    break;
                                }
                            }
                            results.push(json!({
                                "filename": doc.filename,
                                "path": path.to_string_lossy(),
                                "matches": matches
                            }));
                        }
                    }
                }
            }
            if results.len() >= 10 {
                break;
            }
        }

        Ok(json!({ "results": results }))
    }
}

// ─── 4. WriteFileTool ───

#[derive(Deserialize)]
struct WriteFileArgs {
    file_path: String,
    content: String,
}

#[async_trait]
impl AgentTool for WriteFileTool {
    fn id(&self) -> &str {
        "write_file"
    }

    fn description(&self) -> &str {
        "Writes content to a file. If the file exists, creates a unified diff showing changes. \
         Returns file path, change type, lines added/removed, and diff string."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "file_path": { "type": "string", "description": "Path to the file (absolute or relative)" },
                "content": { "type": "string", "description": "Content to write to the file" }
            },
            "required": ["file_path", "content"],
            "additionalProperties": false
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<Arc<Mutex<HashSet<String>>>>,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        use crate::workspace::resolve_workspace_path;

        let args: WriteFileArgs = serde_json::from_value(input)?;

        // Get workspace folder from AppState
        let state = app.state::<AppState>();
        let workspace = state
            .workspace_for_chat(&chat_id)
            .await
            .map_err(|e| anyhow::anyhow!("Unable to resolve session workspace: {}", e))?;

        // Resolve and validate path is within workspace
        let target_path = resolve_workspace_path(&workspace, &args.file_path)
            .map_err(|e| anyhow::anyhow!("Workspace violation: {}", e))?;

        // Check if file exists and read original content
        let original_content = if target_path.exists() {
            Some(tokio::fs::read_to_string(&target_path).await?)
        } else {
            // Create parent directories if needed
            if let Some(parent) = target_path.parent() {
                tokio::fs::create_dir_all(parent).await?;
            }
            None
        };

        // Write new content
        tokio::fs::write(&target_path, &args.content).await?;

        // Use the canonical diff emitter shared by direct and legacy file tools.
        let (change_type, diff, lines_added, lines_removed) =
            if let Some(original) = original_content {
                let (diff, added, removed) =
                    crate::tools::fs_tools::unified_diff(&target_path, &original, &args.content);
                ("modified".to_string(), Some(diff), Some(added), Some(removed))
            } else {
                let (diff, added, removed) =
                    crate::tools::fs_tools::unified_diff(&target_path, "", &args.content);
                ("created".to_string(), Some(diff), Some(added), Some(removed))
            };

        Ok(json!({
            "file_path": target_path.to_string_lossy(),
            "change_type": change_type,
            "lines_added": lines_added,
            "lines_removed": lines_removed,
            "diff": diff
        }))
    }
}

pub struct WriteFileTool;

// ─── 5. EditFileTool (Patch-style edits) ───
//
// This tool delegates to the canonical implementation in
// `crate::tools::fs_tools::execute_targeted_edit` so the targeted-edit
// contract (occurrence selection, mismatch reporting, workspace boundary,
// file-size checks) lives in exactly one place.

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

#[async_trait]
impl AgentTool for EditFileTool {
    fn id(&self) -> &str {
        "edit_file"
    }

    fn description(&self) -> &str {
        "Edits a file by replacing old_text with new_text. Returns unified diff of changes. \
         Use for precise edits rather than rewriting entire files. Optional `occurrence` \
         selects which match to replace when `old_text` appears multiple times."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "file_path": { "type": "string", "description": "Path to the file" },
                "old_text": { "type": "string", "description": "Text to find and replace" },
                "new_text": { "type": "string", "description": "Replacement text" },
                "occurrence": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "1-indexed occurrence of old_text to replace. Defaults to 1."
                }
            },
            "required": ["file_path", "old_text", "new_text"],
            "additionalProperties": false
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<Arc<Mutex<HashSet<String>>>>,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let args: EditFileArgs = serde_json::from_value(input)?;
        let output = crate::tools::fs_tools::execute_targeted_edit(
            &app,
            chat_id,
            args.file_path,
            args.old_text,
            args.new_text,
            args.occurrence,
        )
        .await
        .map_err(|e| anyhow::anyhow!("{}", e))?;
        Ok(output.content)
    }
}

pub struct EditFileTool;

/// `AgentTool` impl for the canonical `apply_patch` Tool implementation
/// living in `crate::tools::fs_tools::patch`. Subagents use the
/// `AgentTool` trait; the canonical exposes only the `Tool` trait, so this
/// bridge translates between the two. The canonical struct is the single
/// source of truth — this wrapper does no patching logic of its own.
///
/// Rust's orphan rule allows this because both `AgentTool` (defined here)
/// and `ApplyPatchTool` (defined in `crate::tools::fs_tools::patch`) are
/// local to this crate.
#[async_trait]
impl AgentTool for crate::tools::fs_tools::ApplyPatchTool {
    fn id(&self) -> &str {
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

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "patch": {
                    "type": "string",
                    "description": "Structured patch text specifying file updates."
                }
            },
            "required": ["patch"],
            "additionalProperties": false
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<Arc<Mutex<HashSet<String>>>>,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let patch = input
            .get("patch")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("apply_patch requires a 'patch' field"))?
            .to_string();
        let output = crate::tools::Tool::execute(
            &crate::tools::fs_tools::ApplyPatchTool,
            app,
            chat_id,
            json!({ "patch": patch }),
        )
        .await
        .map_err(|e| anyhow::anyhow!("{}", e))?;
        Ok(output.content)
    }
}
