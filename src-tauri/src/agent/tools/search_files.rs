use crate::agent::tools::fs_tools::is_ignored_dir;
use crate::commands::AppState;
use anyhow::Result;
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;

// ─── SearchFilesTool ───
// Native workspace content search (the "grep" the app was missing).
// `grep_documents` only scans RAG-ingested uploads; codegraph only knows the
// indexed codebase. Neither greps arbitrary workspace files, so the agent had
// to shell out to Select-String/findstr (the same cross-platform trap as
// `ls -la`). This is a deterministic, boundary-checked, bounded regex search.
pub struct SearchFilesTool;

#[derive(Deserialize)]
struct SearchFilesArgs {
    /// Regex to match (Rust `regex` crate syntax).
    pattern: String,
    /// Directory to search under. Omit for the workspace root.
    #[serde(default)]
    path: Option<String>,
    /// Filename glob filter, e.g. "*.rs" or "*.{ts,tsx}" (only `*`/`?` wildcards).
    #[serde(default)]
    glob: Option<String>,
    /// "files_with_matches" (default) | "content" | "count".
    #[serde(default)]
    output_mode: Option<String>,
    /// Case-insensitive matching. Omit for case-sensitive.
    #[serde(default)]
    case_insensitive: Option<bool>,
    /// Max result entries returned (default 250).
    #[serde(default)]
    head_limit: Option<usize>,
}

const SEARCH_MAX_FILES: usize = 5_000;
const SEARCH_MAX_FILE_BYTES: u64 = 5 * 1024 * 1024;
const SEARCH_MAX_MATCHES_PER_FILE: usize = 20;
const SEARCH_DEFAULT_HEAD_LIMIT: usize = 250;
const SEARCH_MAX_LINE_LEN: usize = 500;

/// Minimal glob matcher supporting `*` (any run) and `?` (single char). Enough
/// for the `*.ext` / `name*` filters models actually pass; anything fancier is
/// a job for the dedicated ripgrep engine we intentionally did not bundle.
fn glob_match(pattern: &str, name: &str) -> bool {
    fn rec(p: &[u8], n: &[u8]) -> bool {
        match p.first() {
            None => n.is_empty(),
            Some(b'*') => rec(&p[1..], n) || (!n.is_empty() && rec(p, &n[1..])),
            Some(b'?') => !n.is_empty() && rec(&p[1..], &n[1..]),
            Some(&c) => !n.is_empty() && n[0] == c && rec(&p[1..], &n[1..]),
        }
    }
    rec(pattern.as_bytes(), name.as_bytes())
}

#[async_trait]
impl zen_tools::AgentTool<tauri::AppHandle> for SearchFilesTool {
    fn id(&self) -> &str {
        "search_files"
    }

    fn description(&self) -> &str {
        "Searches the CONTENTS of workspace files for a regex pattern (this is the code/text grep). \
         Walks the workspace tree, skipping noise dirs (.git, node_modules, target, dist, .venv) and hidden/binary files. \
         Use this to find where a function, string, error message, or config key appears before reading files. \
         `output_mode` defaults to \"files_with_matches\" (paths only — cheapest); use \"content\" for matching lines with line numbers, or \"count\" for per-file totals. \
         Filter with `glob` (e.g. \"*.rs\"). Regex uses Rust regex syntax (no look-around/backreferences). Results are capped — narrow `path`/`glob` if truncated. \
         For uploaded knowledge-base documents use grep_documents instead."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "pattern": { "type": "string", "description": "Regex to match (Rust regex syntax). Escape literal metacharacters, e.g. use \"interface\\\\{\\\\}\" to find \"interface{}\"." },
                "path": { "type": "string", "description": "Directory to search under, absolute or workspace-relative. Omit to search the workspace root. Do NOT pass \"undefined\"." },
                "glob": { "type": "string", "description": "Filename filter with * and ? wildcards, e.g. \"*.ts\". Omit to search all files." },
                "output_mode": { "type": "string", "enum": ["files_with_matches", "content", "count"], "description": "files_with_matches (default): paths only. content: matching lines. count: matches per file." },
                "case_insensitive": { "type": "boolean", "description": "Case-insensitive matching. Omit for case-sensitive." },
                "head_limit": { "type": "integer", "minimum": 1, "maximum": 1000, "description": "Max result entries (default 250)." }
            },
            "required": ["pattern"],
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
        let args: SearchFilesArgs = serde_json::from_value(input)
            .map_err(|e| anyhow::anyhow!("Invalid search_files arguments: {}", e))?;
        if args.pattern.trim().is_empty() {
            anyhow::bail!("pattern must not be empty");
        }

        // Compile up front so a bad regex surfaces a clear, retryable error
        // instead of silently matching nothing.
        let regex = regex::RegexBuilder::new(&args.pattern)
            .case_insensitive(args.case_insensitive.unwrap_or(false))
            .build()
            .map_err(|e| anyhow::anyhow!("Invalid regex pattern: {}", e))?;

        let mode = args.output_mode.as_deref().unwrap_or("files_with_matches");
        if !matches!(mode, "files_with_matches" | "content" | "count") {
            anyhow::bail!("output_mode must be files_with_matches, content, or count");
        }
        let head_limit = args
            .head_limit
            .unwrap_or(SEARCH_DEFAULT_HEAD_LIMIT)
            .clamp(1, 1_000);
        let glob = args.glob.filter(|g| !g.trim().is_empty());

        let state = app.state::<AppState>();
        let workspace = state
            .workspace_for_chat(&chat_id)
            .await
            .map_err(|e| anyhow::anyhow!("Unable to resolve session workspace: {}", e))?;

        let target = match args.path.as_deref().map(str::trim) {
            Some(p) if !p.is_empty() => crate::workspace::resolve_workspace_path(&workspace, p)
                .map_err(|e| anyhow::anyhow!("Workspace violation: {}", e))?,
            _ => workspace.clone(),
        };
        let target = crate::workspace::validate_workspace_path(&workspace, &target)
            .map_err(|e| anyhow::anyhow!("Workspace violation: {}", e))?;
        if !target.is_dir() {
            anyhow::bail!("Not a directory: {}", target.display());
        }

        let mut ctx = SearchCtx {
            regex,
            glob,
            content: mode == "content",
            results: Vec::new(),
            total_matches: 0,
            files_scanned: 0,
            head_limit,
            truncated: false,
        };
        search_dir(&target, &target, &mut ctx).await;

        Ok(json!({
            "mode": mode,
            "pattern": args.pattern,
            "results": ctx.results,
            "total_matches": ctx.total_matches,
            "total_files": ctx.results.len(),
            "truncated": ctx.truncated,
        }))
    }
}

struct SearchCtx {
    regex: regex::Regex,
    glob: Option<String>,
    content: bool,
    results: Vec<Value>,
    total_matches: usize,
    files_scanned: usize,
    head_limit: usize,
    truncated: bool,
}

/// Recursively walk `dir`, matching file contents into `ctx`. Bounded by file
/// count, per-file size, per-file matches, and the caller's head limit.
fn search_dir<'a>(
    root: &'a Path,
    dir: &'a Path,
    ctx: &'a mut SearchCtx,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send + 'a>> {
    Box::pin(async move {
        let Ok(mut rd) = tokio::fs::read_dir(dir).await else {
            return;
        };
        while let Ok(Some(entry)) = rd.next_entry().await {
            if ctx.results.len() >= ctx.head_limit || ctx.files_scanned >= SEARCH_MAX_FILES {
                ctx.truncated = true;
                return;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            // Skip hidden dotfiles/dirs and known noise directories.
            if name.starts_with('.') || is_ignored_dir(&name) {
                continue;
            }
            let Ok(meta) = entry.metadata().await else {
                continue;
            };
            if meta.is_dir() {
                search_dir(root, &entry.path(), ctx).await;
                continue;
            }
            if let Some(g) = &ctx.glob {
                if !glob_match(g, &name) {
                    continue;
                }
            }
            if meta.len() > SEARCH_MAX_FILE_BYTES {
                continue;
            }
            ctx.files_scanned += 1;

            // Read as UTF-8; binary files fail here and are skipped.
            let Ok(text) = tokio::fs::read_to_string(entry.path()).await else {
                continue;
            };
            let rel = entry
                .path()
                .strip_prefix(root)
                .ok()
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .unwrap_or_else(|| name.clone());

            let mut matches = Vec::new();
            let mut file_match_count = 0usize;
            for (idx, line) in text.lines().enumerate() {
                if ctx.regex.is_match(line) {
                    file_match_count += 1;
                    if ctx.content && matches.len() < SEARCH_MAX_MATCHES_PER_FILE {
                        let mut content = line.trim_end().to_string();
                        if content.len() > SEARCH_MAX_LINE_LEN {
                            content.truncate(SEARCH_MAX_LINE_LEN);
                            content.push_str(" … (truncated)");
                        }
                        matches.push(json!({ "line": idx + 1, "content": content }));
                    }
                }
            }

            if file_match_count > 0 {
                ctx.total_matches += file_match_count;
                ctx.results.push(json!({
                    "filename": name,
                    "path": rel,
                    "count": file_match_count,
                    "matches": matches,
                }));
            }
        }
    })
}

#[cfg(test)]
mod search_files_tests {
    use super::*;
    use tempfile::TempDir;

    async fn run_search(root: &Path, pattern: &str, content: bool, glob: Option<&str>) -> SearchCtx {
        let mut ctx = SearchCtx {
            regex: regex::Regex::new(pattern).unwrap(),
            glob: glob.map(String::from),
            content,
            results: Vec::new(),
            total_matches: 0,
            files_scanned: 0,
            head_limit: 250,
            truncated: false,
        };
        search_dir(root, root, &mut ctx).await;
        ctx
    }

    #[test]
    fn glob_wildcards_match() {
        assert!(glob_match("*.rs", "main.rs"));
        assert!(glob_match("*.{ts}", "a.{ts}")); // no brace expansion — literal
        assert!(glob_match("test_?.txt", "test_1.txt"));
        assert!(!glob_match("*.rs", "main.ts"));
        assert!(glob_match("*", "anything"));
    }

    #[tokio::test]
    async fn finds_matches_and_skips_noise_dirs() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        std::fs::write(root.join("a.rs"), "fn target() {}\nlet x = 1;").unwrap();
        std::fs::create_dir(root.join("node_modules")).unwrap();
        std::fs::write(root.join("node_modules").join("dep.rs"), "fn target() {}").unwrap();
        std::fs::create_dir(root.join(".git")).unwrap();
        std::fs::write(root.join(".git").join("cfg"), "target").unwrap();

        let ctx = run_search(root, "target", false, None).await;
        // Only the top-level a.rs matches; node_modules and .git are skipped.
        assert_eq!(ctx.results.len(), 1);
        assert_eq!(ctx.total_matches, 1);
        let path = ctx.results[0].get("path").and_then(Value::as_str).unwrap();
        assert_eq!(path, "a.rs");
    }

    #[tokio::test]
    async fn content_mode_returns_line_numbers_and_glob_filters() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        std::fs::write(root.join("a.rs"), "one\nneedle here\nthree").unwrap();
        std::fs::write(root.join("b.txt"), "needle in txt").unwrap();

        let ctx = run_search(root, "needle", true, Some("*.rs")).await;
        assert_eq!(ctx.results.len(), 1); // b.txt filtered out by glob
        let matches = ctx.results[0].get("matches").and_then(Value::as_array).unwrap();
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].get("line").and_then(Value::as_u64), Some(2));
    }

    #[tokio::test]
    #[allow(clippy::invalid_regex)] // the invalid literal is the test subject
    async fn invalid_regex_is_rejected() {
        // The tool compiles the pattern before walking; an invalid one errors.
        assert!(regex::Regex::new("(unclosed").is_err());
    }
}


