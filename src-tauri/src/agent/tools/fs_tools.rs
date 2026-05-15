use serde::Deserialize;
use serde_json::{json, Value};
use anyhow::Result;
use tauri::{AppHandle, Manager};
use async_trait::async_trait;
use crate::agent::tools::AgentTool;
use crate::commands::AppState;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::collections::HashSet;

// ─── 1. ListDocumentsTool ───
pub struct ListDocumentsTool;

#[async_trait]
impl AgentTool for ListDocumentsTool {
    fn id(&self) -> &str {
        "list_documents"
    }

    fn description(&self) -> &str {
        "Lists all documents currently ingested and available in the local knowledge base. \
         Use this to see what files are indexed before reading or searching them."
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
        let docs = crate::db::queries::list_documents(&state.db().await.map_err(|e| anyhow::anyhow!("DB init failed: {}", e))?).await?;

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
        "Reads the raw text content of a specific file. Provide an absolute path, a relative path, or just the filename."
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
        _chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<Arc<Mutex<HashSet<String>>>>,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let args: ReadDocumentArgs = serde_json::from_value(input)?;
        let state = app.state::<AppState>();

        // Resolve path
        let mut target_path = std::path::PathBuf::from(&args.file_path);

        if !target_path.exists() {
            let docs = crate::db::queries::list_documents(&state.db().await.map_err(|e| anyhow::anyhow!("DB init failed: {}", e))?).await?;
            if let Some(doc) = docs.into_iter().find(|d| d.filename == args.file_path || d.id == args.file_path) {
                if let Some(doc_path) = doc.file_path {
                    target_path = std::path::PathBuf::from(&doc_path);
                }
            }
        }
        
        if !target_path.exists() {
             if let Ok(cwd) = std::env::current_dir() {
                 let relative_path = cwd.join(&args.file_path);
                 if relative_path.exists() {
                     target_path = relative_path;
                 }
             }
        }

        if !target_path.exists() {
            return Ok(json!({ "error": format!("File not found: {}", args.file_path) }));
        }

        let content = tokio::fs::read_to_string(&target_path).await?;

        // Truncate to avoid context overflow
        let max_len = 24 * 1024;
        let final_text = if content.len() > max_len {
            format!("{}... [TRUNCATED]", &content[..max_len])
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
        "Performs a keyword search across all indexed documents. Use this for precise substring matches."
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
        _chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<Arc<Mutex<HashSet<String>>>>,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let args: GrepDocumentsArgs = serde_json::from_value(input)?;
        let state = app.state::<AppState>();
        let docs = crate::db::queries::list_documents(&state.db().await.map_err(|e| anyhow::anyhow!("DB init failed: {}", e))?).await?;

        let mut results = Vec::new();
        let query = if args.case_sensitive.unwrap_or(false) {
            args.query.clone()
        } else {
            args.query.to_lowercase()
        };

        for doc in docs {
            if let Some(path_str) = doc.file_path {
                let path = std::path::Path::new(&path_str);
                if path.exists() {
                    if let Ok(content) = tokio::fs::read_to_string(path).await {
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
                                    matches.push(json!({ "line": idx + 1, "content": line.trim() }));
                                }
                                if matches.len() >= 5 { break; }
                            }
                            results.push(json!({
                                "filename": doc.filename,
                                "matches": matches
                            }));
                        }
                    }
                }
            }
            if results.len() >= 10 { break; }
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
        _chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<Arc<Mutex<HashSet<String>>>>,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        use similar::{ChangeTag, TextDiff};
        use crate::workspace::resolve_workspace_path;

        let args: WriteFileArgs = serde_json::from_value(input)?;

        // Get workspace folder from AppState
        let state = app.state::<AppState>();
        let workspace = state.workspace_folder.read().await.clone();

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

        // Generate diff if file existed
        let (change_type, diff, lines_added, lines_removed) = if let Some(original) = original_content {
            let diff = TextDiff::from_lines(&original, &args.content);

            let mut diff_lines = Vec::new();
            let mut lines_added = 0;
            let mut lines_removed = 0;

            // Add file headers
            diff_lines.push(format!("--- a/{}", target_path.display()));
            diff_lines.push(format!("+++ b/{}", target_path.display()));

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

            ("modified".to_string(), Some(diff_lines.join("\n")), Some(lines_added), Some(lines_removed))
        } else {
            // New file
            let lines_added = args.content.lines().count();
            ("created".to_string(), None, Some(lines_added), Some(0))
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

#[derive(Deserialize)]
struct EditFileArgs {
    file_path: String,
    old_text: String,
    new_text: String,
}

#[async_trait]
impl AgentTool for EditFileTool {
    fn id(&self) -> &str {
        "edit_file"
    }

    fn description(&self) -> &str {
        "Edits a file by replacing old_text with new_text. Returns unified diff of changes. \
         Use for precise edits rather than rewriting entire files."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "file_path": { "type": "string", "description": "Path to the file" },
                "old_text": { "type": "string", "description": "Text to find and replace" },
                "new_text": { "type": "string", "description": "Replacement text" }
            },
            "required": ["file_path", "old_text", "new_text"],
            "additionalProperties": false
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        _chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<Arc<Mutex<HashSet<String>>>>,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        use similar::{ChangeTag, TextDiff};
        use crate::workspace::resolve_workspace_path;

        let args: EditFileArgs = serde_json::from_value(input)?;

        // Get workspace folder from AppState
        let state = app.state::<AppState>();
        let workspace = state.workspace_folder.read().await.clone();

        // Resolve and validate path is within workspace
        let target_path = resolve_workspace_path(&workspace, &args.file_path)
            .map_err(|e| anyhow::anyhow!("Workspace violation: {}", e))?;

        if !target_path.exists() {
            return Ok(json!({ "error": format!("File not found: {}", args.file_path) }));
        }

        // Read original content
        let original_content = tokio::fs::read_to_string(&target_path).await?;

        // Replace old_text with new_text
        if !original_content.contains(&args.old_text) {
            return Ok(json!({
                "error": "old_text not found in file",
                "hint": "Ensure exact match including whitespace"
            }));
        }

        let new_content = original_content.replace(&args.old_text, &args.new_text);

        // Write new content
        tokio::fs::write(&target_path, &new_content).await?;

        // Generate unified diff
        let diff = TextDiff::from_lines(&original_content, &new_content);

        let mut diff_lines = Vec::new();
        let mut lines_added = 0;
        let mut lines_removed = 0;

        // Add file headers
        diff_lines.push(format!("--- a/{}", target_path.display()));
        diff_lines.push(format!("+++ b/{}", target_path.display()));

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

        Ok(json!({
            "file_path": target_path.to_string_lossy(),
            "change_type": "modified",
            "lines_added": lines_added,
            "lines_removed": lines_removed,
            "diff": diff_lines.join("\n"),
            "success": true
        }))
    }
}

pub struct EditFileTool;
