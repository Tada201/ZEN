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
impl zen_tools::AgentTool<tauri::AppHandle> for ListDocumentsTool {
    fn id(&self) -> &str {
        "list_documents"
    }

    fn description(&self) -> &str {
        "Lists the files the user attached to THIS chat (the chat's attachment workspace), with slim metadata cards — id, name, type, size, and an estimated token cost — but NOT their contents. \
         This is distinct from the working-directory filesystem: to browse real workspace files use `list_directory`. \
         Call this first to see what the user uploaded, then pass a returned id/file_path to read_document_content to read a specific one on demand."
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
        chat_id: String,
        _input: Value,
        _depth: u32,
        _allowed_tools: Option<Arc<Mutex<HashSet<String>>>>,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let state = app.state::<AppState>();
        let pool = state
            .db()
            .await
            .map_err(|e| anyhow::anyhow!("DB init failed: {}", e))?;
        // Chat-scoped: only this chat's attachments. Falls back to nothing when
        // the chat has no uploads (rather than leaking the global library).
        let docs = crate::db::queries::list_documents_for_chat(&pool, &chat_id).await?;

        let mut formatted_docs = Vec::new();
        for doc in docs {
            formatted_docs.push(json!({
                "id": doc.id,
                "file_name": doc.filename,
                "file_path": doc.file_path,
                "mime_type": doc.mime_type,
                "size_bytes": doc.file_size,
                "token_estimate": doc.token_estimate,
                "page_count": doc.page_count,
                "sheet_names": doc.sheet_names,
                "status": doc.status,
            }));
        }

        Ok(json!({ "documents": formatted_docs }))
    }
}

// ─── 1b. ListDirectoryTool ───
// Native workspace file/folder lister. `list_documents` only knows about
// RAG-ingested uploads, so the agent had no way to see real workspace files
// without shelling out to `ls`/`dir` — which fails under PowerShell. This
// tool gives a deterministic, boundary-checked listing.
pub struct ListDirectoryTool;

#[derive(Deserialize)]
struct ListDirectoryArgs {
    /// Directory to list. Omit to use the workspace root.
    #[serde(default)]
    path: Option<String>,
    /// List nested entries when true. Omit for top-level only.
    #[serde(default)]
    recursive: Option<bool>,
}

const LIST_DIR_MAX_ENTRIES: usize = 1_000;
const LIST_DIR_MAX_DEPTH: usize = 8;

pub(crate) fn is_ignored_dir(name: &str) -> bool {
    matches!(
        name,
        ".git" | "node_modules" | "target" | ".next" | "dist" | ".venv" | "__pycache__"
    )
}

#[async_trait]
impl zen_tools::AgentTool<tauri::AppHandle> for ListDirectoryTool {
    fn id(&self) -> &str {
        "list_directory"
    }

    fn description(&self) -> &str {
        "Lists files and subdirectories inside a workspace directory, with type and size. \
         Use this to discover the real files in the current workspace before reading or editing them. \
         Omit `path` to list the workspace root. Set `recursive` to true to walk nested folders \
         (common noise dirs like .git, node_modules, and target are skipped). \
         Results are capped; narrow `path` if the listing is truncated."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Directory to list, absolute or workspace-relative. Omit this field to use the workspace root. Do NOT pass \"undefined\" or \"null\" — omit it instead."
                },
                "recursive": {
                    "type": "boolean",
                    "description": "List nested entries when true. Omit for top-level contents only."
                }
            },
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
        let args: ListDirectoryArgs = serde_json::from_value(input).unwrap_or(ListDirectoryArgs {
            path: None,
            recursive: None,
        });
        let recursive = args.recursive.unwrap_or(false);

        let state = app.state::<AppState>();
        let workspace = state
            .workspace_for_chat(&chat_id)
            .await
            .map_err(|e| anyhow::anyhow!("Unable to resolve session workspace: {}", e))?;

        // Resolve the requested path (or the workspace root) and confirm it
        // stays inside the workspace boundary.
        let target = match args.path.as_deref().map(str::trim) {
            Some(p) if !p.is_empty() => {
                crate::workspace::resolve_workspace_path(&workspace, p)
                    .map_err(|e| anyhow::anyhow!("Workspace violation: {}", e))?
            }
            _ => workspace.clone(),
        };
        let target = crate::workspace::validate_workspace_path(&workspace, &target)
            .map_err(|e| anyhow::anyhow!("Workspace violation: {}", e))?;

        if !target.exists() {
            return Err(anyhow::anyhow!(
                "Directory not found: {}",
                target.display()
            ));
        }
        if !target.is_dir() {
            return Err(anyhow::anyhow!(
                "Not a directory: {}",
                target.display()
            ));
        }

        let mut entries = Vec::new();
        let mut truncated = collect_dir_entries(&target, &target, recursive, 0, &mut entries).await;
        if entries.len() > LIST_DIR_MAX_ENTRIES {
            entries.truncate(LIST_DIR_MAX_ENTRIES);
            truncated = true;
        }

        // Directories first, then alphabetical — a stable, human-friendly order.
        entries.sort_by(|a, b| {
            let a_dir = a.get("type").and_then(Value::as_str) == Some("dir");
            let b_dir = b.get("type").and_then(Value::as_str) == Some("dir");
            b_dir.cmp(&a_dir).then_with(|| {
                a.get("name")
                    .and_then(Value::as_str)
                    .cmp(&b.get("name").and_then(Value::as_str))
            })
        });

        Ok(json!({
            "path": target.to_string_lossy(),
            "entries": entries,
            "truncated": truncated,
        }))
    }
}

/// Walk a directory collecting `{name, type, size, modified_ms}` records.
/// Returns `true` if traversal stopped early because the entry cap was hit.
/// Names are workspace-relative to `root` so nested entries stay readable.
fn collect_dir_entries<'a>(
    root: &'a Path,
    dir: &'a Path,
    recursive: bool,
    depth: usize,
    out: &'a mut Vec<Value>,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send + 'a>> {
    Box::pin(async move {
        let Ok(mut rd) = tokio::fs::read_dir(dir).await else {
            return false;
        };
        while let Ok(Some(entry)) = rd.next_entry().await {
            if out.len() >= LIST_DIR_MAX_ENTRIES {
                return true;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            let Ok(meta) = entry.metadata().await else {
                continue;
            };
            let is_dir = meta.is_dir();
            let rel = entry
                .path()
                .strip_prefix(root)
                .ok()
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .unwrap_or_else(|| name.clone());
            let modified_ms = meta
                .modified()
                .ok()
                .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64);
            out.push(json!({
                "name": rel,
                "type": if is_dir { "dir" } else { "file" },
                "size": if is_dir { Value::Null } else { json!(meta.len()) },
                "modified_ms": modified_ms,
            }));

            if is_dir && recursive && depth + 1 < LIST_DIR_MAX_DEPTH && !is_ignored_dir(&name)
                && collect_dir_entries(root, &entry.path(), recursive, depth + 1, out).await {
                    return true;
                }
        }
        false
    })
}

// ─── 2. ReadDocumentTool ───
pub struct ReadDocumentTool;

#[derive(Deserialize)]
struct ReadDocumentArgs {
    file_path: String,
    /// Character offset to start reading from (0-based).
    #[serde(default)]
    offset: Option<usize>,
    /// Max characters to return; clamped to [1, READ_DOC_MAX_LIMIT].
    #[serde(default)]
    limit: Option<usize>,
}

/// Character-window limits for read_document_content. Windowing is
/// character-based (unlike the byte-based `truncate_utf8`) so a resume offset
/// stays valid across multi-byte content.
const READ_DOC_DEFAULT_LIMIT: usize = 24 * 1024;
const READ_DOC_MAX_LIMIT: usize = 64 * 1024;

/// Pure character window over `content`. Returns the window text, the
/// character position just past it (the resume point for the next call), and
/// the total character count. `offset >= total` yields an empty window.
fn window_text(content: &str, offset: usize, limit: usize) -> (String, usize, usize) {
    let total = content.chars().count();
    if offset >= total {
        return (String::new(), offset, total);
    }
    let window: String = content.chars().skip(offset).take(limit).collect();
    let next = offset + window.chars().count();
    (window, next, total)
}

/// Window plus honest continuation/EOF markers for one read call.
fn windowed_content(content: &str, offset: usize, limit: usize) -> String {
    let (window, next, total) = window_text(content, offset, limit);
    if offset >= total {
        format!("[offset {offset} is beyond the end of the file ({total} characters total) — nothing to read]")
    } else if next < total {
        format!("{window}... [TRUNCATED at character {next} of {total} — call read_document_content again with offset={next} to continue]")
    } else {
        window
    }
}

/// The `<doc_id>.extracted.txt` sidecar written next to a chat attachment's
/// original blob (see `services::attachment_store::store_attachment`). Returns
/// None when the stored path has no parent to anchor against.
fn extracted_sidecar_path(blob_path: Option<&str>, doc_id: &str) -> Option<PathBuf> {
    let blob = blob_path?;
    Path::new(blob)
        .parent()
        .map(|dir| dir.join(format!("{doc_id}.extracted.txt")))
}

#[async_trait]
impl zen_tools::AgentTool<tauri::AppHandle> for ReadDocumentTool {
    fn id(&self) -> &str {
        "read_document_content"
    }

    fn description(&self) -> &str {
        "Reads authoritative raw text from one uploaded or workspace file. Prefer the exact file_path returned by list_documents; absolute paths, workspace-relative paths, IDs, and exact filenames are accepted. \
         Long files are returned as a character window: when the result ends with a [TRUNCATED ...] marker, call this tool again with the stated offset to continue reading from that exact character position; `limit` controls how many characters come back."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to the file, ID, or filename from the document list"
                },
                "offset": {
                    "type": "integer",
                    "minimum": 0,
                    "description": "Character position to start reading from (0-based). Default 0. Use the resume point stated by a previous [TRUNCATED ...] marker to continue."
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 65536,
                    "description": "Maximum number of characters to return. Default 24576; clamped to at most 65536."
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
        let offset = args.offset.unwrap_or(0);
        let limit = args
            .limit
            .unwrap_or(READ_DOC_DEFAULT_LIMIT)
            .clamp(1, READ_DOC_MAX_LIMIT);
        let state = app.state::<AppState>();
        let pool = state
            .db()
            .await
            .map_err(|e| anyhow::anyhow!("DB init failed: {}", e))?;

        // 1. Chat attachment fast-path. Uploaded files live under appdata
        // (outside the workspace) and their originals may be binary, so we read
        // the pre-extracted plain-text sidecar rather than the blob. Match by
        // id or exact filename within THIS chat only.
        let attachments =
            crate::db::queries::list_documents_for_chat(&pool, &chat_id).await?;
        if let Some(doc) = attachments
            .into_iter()
            .find(|d| d.id == args.file_path || d.filename == args.file_path)
        {
            if let Some(sidecar) = extracted_sidecar_path(doc.file_path.as_deref(), &doc.id) {
                if let Ok(content) = tokio::fs::read_to_string(&sidecar).await {
                    return Ok(json!({
                        "file_name": doc.filename,
                        "mime_type": doc.mime_type,
                        "content": windowed_content(&content, offset, limit)
                    }));
                }
            }
        }

        // 2. Workspace file fall-back (workspace-relative path / absolute path).
        let workspace = state
            .workspace_for_chat(&chat_id)
            .await
            .map_err(|e| anyhow::anyhow!("Unable to resolve session workspace: {}", e))?;

        let mut target_path = PathBuf::from(&args.file_path);

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

        Ok(json!({
            "file_path": target_path.to_string_lossy(),
            "content": windowed_content(&content, offset, limit)
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
impl zen_tools::AgentTool<tauri::AppHandle> for GrepDocumentsTool {
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
        let pool = state
            .db()
            .await
            .map_err(|e| anyhow::anyhow!("DB init failed: {}", e))?;
        // Chat-scoped: search only THIS chat's uploaded attachments, over their
        // pre-extracted plain-text sidecars (originals may be binary).
        let docs = crate::db::queries::list_documents_for_chat(&pool, &chat_id).await?;

        let mut results = Vec::new();
        let query = if args.case_sensitive.unwrap_or(false) {
            args.query.clone()
        } else {
            args.query.to_lowercase()
        };

        for doc in &docs {
            let Some(sidecar) = extracted_sidecar_path(doc.file_path.as_deref(), &doc.id) else {
                continue;
            };
            if let Ok(content) = tokio::fs::read_to_string(&sidecar).await {
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
                        if matches.len() >= 5 {
                            break;
                        }
                    }
                    results.push(json!({
                        "id": doc.id,
                        "filename": doc.filename,
                        "matches": matches
                    }));
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
impl zen_tools::AgentTool<tauri::AppHandle> for WriteFileTool {
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
impl zen_tools::AgentTool<tauri::AppHandle> for EditFileTool {
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
impl zen_tools::AgentTool<tauri::AppHandle> for crate::tools::fs_tools::ApplyPatchTool {
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
        let output = zen_tools::Tool::<tauri::AppHandle>::execute(
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

#[cfg(test)]
mod list_directory_tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn collects_top_level_entries_only() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        std::fs::write(root.join("a.txt"), "hello").unwrap();
        std::fs::create_dir(root.join("sub")).unwrap();
        std::fs::write(root.join("sub").join("nested.txt"), "x").unwrap();

        let mut entries = Vec::new();
        let truncated = collect_dir_entries(root, root, false, 0, &mut entries).await;
        assert!(!truncated);
        // Non-recursive: the two top-level entries, not the nested file.
        assert_eq!(entries.len(), 2);
        let names: Vec<&str> = entries
            .iter()
            .filter_map(|e| e.get("name").and_then(Value::as_str))
            .collect();
        assert!(names.contains(&"a.txt"));
        assert!(names.contains(&"sub"));
        assert!(!names.iter().any(|n| n.contains("nested")));
    }

    #[tokio::test]
    async fn recursive_walk_reaches_nested_and_skips_ignored() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        std::fs::create_dir(root.join("sub")).unwrap();
        std::fs::write(root.join("sub").join("nested.txt"), "x").unwrap();
        std::fs::create_dir(root.join("node_modules")).unwrap();
        std::fs::write(root.join("node_modules").join("dep.js"), "y").unwrap();

        let mut entries = Vec::new();
        collect_dir_entries(root, root, true, 0, &mut entries).await;
        let names: Vec<String> = entries
            .iter()
            .filter_map(|e| e.get("name").and_then(Value::as_str).map(String::from))
            .collect();
        // Nested file reached (relative, forward-slashed); ignored dir contents skipped.
        assert!(names.iter().any(|n| n == "sub/nested.txt"));
        assert!(names.iter().any(|n| n == "node_modules"));
        assert!(!names.iter().any(|n| n.contains("dep.js")));
    }

    #[test]
    fn ignored_dirs_match_known_noise() {
        assert!(is_ignored_dir(".git"));
        assert!(is_ignored_dir("node_modules"));
        assert!(is_ignored_dir("target"));
        assert!(!is_ignored_dir("src"));
    }
}

#[cfg(test)]
mod read_document_window_tests {
    use super::*;

    #[test]
    fn window_text_empty_content_yields_empty_window() {
        let (window, next, total) = window_text("", 0, READ_DOC_DEFAULT_LIMIT);
        assert_eq!(window, "");
        assert_eq!(next, 0);
        assert_eq!(total, 0);
    }

    #[test]
    fn window_text_offset_beyond_end_is_empty() {
        let (window, next, total) = window_text("abc", 10, 5);
        assert_eq!(window, "");
        assert_eq!(next, 10);
        assert_eq!(total, 3);
    }

    #[test]
    fn window_text_windows_by_chars_not_bytes() {
        // 3 chars / 6 UTF-8 bytes: skipping 1 char must land mid-byte-sequence
        // safely, which byte slicing or truncate_utf8 cannot do.
        let (window, next, total) = window_text("é你z", 1, 1);
        assert_eq!(window, "你");
        assert_eq!(next, 2);
        assert_eq!(total, 3);
    }

    #[test]
    fn window_text_next_lands_on_total_when_limit_exceeds_remainder() {
        let (window, next, total) = window_text("abcdef", 4, 100);
        assert_eq!(window, "ef");
        assert_eq!(next, total);
        assert_eq!(total, 6);
    }

    #[test]
    fn windowed_content_marks_truncation_with_resume_point() {
        let text = windowed_content("abcdef", 0, 3);
        assert!(text.starts_with("abc"));
        assert!(text.contains("TRUNCATED at character 3 of 6"));
        assert!(text.contains("offset=3"));
    }

    #[test]
    fn windowed_content_beyond_end_reports_honest_empty() {
        let text = windowed_content("abc", 9, 10);
        assert!(text.contains("beyond the end"));
        assert!(text.contains("3 characters total"));
    }

    #[test]
    fn windowed_content_exact_boundary_has_no_marker() {
        assert_eq!(windowed_content("abcdef", 0, 6), "abcdef");
    }
}
