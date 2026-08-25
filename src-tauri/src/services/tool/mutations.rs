// Workspace-file checkpoint capture around mutating tool calls.
// Split from the 1,375-line services/tool.rs during BIG_MIGRATION.md
// Phase 12 (app-crate file-size debt sweep). Behavior is unchanged; the
// `ToolService` impl is spread across sibling modules by concern.

use super::*;

impl ToolService {
    pub(super) async fn capture_file_mutations(
        &self,
        app: &AppHandle,
        chat_id: &str,
        tool_call: &ToolCall,
    ) -> Result<Vec<MutationCapture>, String> {
        let paths: Vec<PathBuf> = match tool_call.name.as_str() {
            "write_file" | "edit_file" | "file_write" => {
                let path = tool_call
                    .arguments
                    .get("file_path")
                    .or_else(|| tool_call.arguments.get("path"))
                    .and_then(|value| value.as_str())
                    .ok_or_else(|| "File mutation is missing a file path.".to_string())?;
                vec![PathBuf::from(path)]
            }
            "apply_patch" => {
                let patch = tool_call
                    .arguments
                    .get("patch")
                    .and_then(|value| value.as_str())
                    .ok_or_else(|| "Patch mutation is missing patch contents.".to_string())?;
                crate::tools::patch_parser::parse_patches(patch)
                    .map_err(|error| format!("Cannot checkpoint patch: {}", error))?
                    .into_iter()
                    .map(|hunk| hunk.path().to_path_buf())
                    .collect()
            }
            _ => return Ok(Vec::new()),
        };

        let state = app.state::<crate::commands::AppState>();
        let workspace = state
            .workspace_for_chat(chat_id)
            .await
            .map_err(|error| error.to_string())?;
        let mut captures = Vec::with_capacity(paths.len());
        let mut seen = std::collections::HashSet::new();
        for path in paths {
            if !seen.insert(path.clone()) {
                continue;
            }
            let resolved = match crate::workspace::resolve_workspace_path(
                &workspace,
                &path.to_string_lossy(),
            ) {
                Ok(resolved) => resolved,
                Err(error) => {
                    self.discard_file_mutations(app, chat_id, captures).await;
                    return Err(format!("Cannot checkpoint workspace path: {}", error));
                }
            };
            let original = if tokio::fs::try_exists(&resolved).await.unwrap_or(false) {
                match tokio::fs::read(&resolved).await {
                    Ok(bytes) => Some(bytes),
                    Err(error) => {
                        self.discard_file_mutations(app, chat_id, captures).await;
                        return Err(format!("Cannot read {} before mutation: {}", resolved.display(), error));
                    }
                }
            } else {
                None
            };
            let token = match state
                .checkpoints
                .capture_before(chat_id, &tool_call.id, &resolved, original)
                .await
            {
                Some(token) => token,
                None => {
                    self.discard_file_mutations(app, chat_id, captures).await;
                    return Err("Cannot create a recovery checkpoint for this mutation.".to_string());
                }
            };
            captures.push(MutationCapture { path: resolved, token });
        }
        Ok(captures)
    }

    pub(super) async fn discard_file_mutations(
        &self,
        app: &AppHandle,
        chat_id: &str,
        captures: Vec<MutationCapture>,
    ) {
        let state = app.state::<crate::commands::AppState>();
        for capture in captures {
            state.checkpoints.discard(chat_id, capture.token).await;
        }
    }

    pub(super) async fn finalize_file_mutations(
        &self,
        app: &AppHandle,
        chat_id: &str,
        tool_call: &ToolCall,
        captures: &[MutationCapture],
        output: &mut serde_json::Value,
    ) -> Result<(), String> {
        if captures.is_empty() {
            return Ok(());
        }
        let state = app.state::<crate::commands::AppState>();
        // Read every post-mutation byte before committing any record. A read
        // failure therefore cannot leave a partially finalized checkpoint.
        let mut current_bytes = Vec::with_capacity(captures.len());
        for capture in captures {
            let current = if tokio::fs::try_exists(&capture.path).await.unwrap_or(false) {
                Some(tokio::fs::read(&capture.path).await.map_err(|error| {
                    format!("Cannot finalize recovery checkpoint for {}: {}", capture.path.display(), error)
                })?)
            } else {
                None
            };
            current_bytes.push(current);
        }
        let mut changed_count = 0;
        for (capture, current) in captures.iter().zip(current_bytes) {
            if state
                .checkpoints
                .commit(chat_id, capture.token.clone(), current)
                .await
            {
                changed_count += 1;
            }
        }
        if changed_count == 0 {
            return Ok(());
        }
        let checkpoint = serde_json::json!({
            "available": true,
            "tool_call_id": tool_call.id,
            "file_count": changed_count,
        });
        if let Some(record) = output.as_object_mut() {
            record.insert("checkpoint".to_string(), checkpoint);
        } else {
            *output = serde_json::json!({ "result": output.clone(), "checkpoint": checkpoint });
        }
        Ok(())
    }
}
