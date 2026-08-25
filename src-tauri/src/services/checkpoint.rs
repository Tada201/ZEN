//! Narrow, session-scoped recovery for workspace file mutations.
//!
//! This is intentionally not a Git replacement. It keeps the bytes observed
//! immediately before a canonical file mutation and only restores them when
//! the file still has the exact post-mutation bytes recorded by the service.
//! External edits therefore fail closed instead of being silently overwritten.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::{Mutex, OwnedMutexGuard};

const MAX_MUTATIONS_PER_CHAT: usize = 256;

#[derive(Debug, Clone, serde::Serialize)]
pub struct CheckpointInfo {
    pub available: bool,
    pub tool_call_id: String,
    pub file_count: usize,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct UndoResult {
    pub restored_files: usize,
    pub conflicts: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct MutationToken {
    id: String,
}

#[derive(Debug, Clone)]
struct MutationRecord {
    id: String,
    tool_call_id: String,
    path: PathBuf,
    original: Option<Vec<u8>>,
    /// `Some(Some(bytes))` means the mutation completed and the file should
    /// contain `bytes`; `Some(None)` means it completed as a deletion.
    /// `None` means the capture is still pending.
    expected_after: Option<Option<Vec<u8>>>,
}

/// In-memory checkpoint ledger owned by `AppState`.
///
/// The ledger is deliberately bounded and process-local for this first P0.3
/// slice. It provides honest undo for changes made during the current app
/// lifetime, while durable checkpoints, named snapshots, Git/worktree restore,
/// and conversation rewind remain separate follow-up work.
pub struct CheckpointService {
    mutations: Arc<Mutex<HashMap<String, Vec<MutationRecord>>>>,
    /// Serializes checkpoint capture through restore so verification and writes
    /// cannot race with another in-process file mutation.
    mutation_lock: Arc<Mutex<()>>,
}

impl CheckpointService {
    pub fn new() -> Self {
        Self {
            mutations: Arc::new(Mutex::new(HashMap::new())),
            mutation_lock: Arc::new(Mutex::new(())),
        }
    }

    /// Serialize a mutation/recovery transaction for the current process.
    pub async fn acquire_mutation_lock(&self) -> OwnedMutexGuard<()> {
        self.mutation_lock.clone().lock_owned().await
    }

    /// Record the exact bytes observed immediately before a mutation.
    pub async fn capture_before(
        &self,
        chat_id: &str,
        tool_call_id: &str,
        path: &Path,
        original: Option<Vec<u8>>,
    ) -> Option<MutationToken> {
        if chat_id.trim().is_empty() || tool_call_id.trim().is_empty() {
            return None;
        }

        let id = uuid::Uuid::new_v4().to_string();
        let record = MutationRecord {
            id: id.clone(),
            tool_call_id: tool_call_id.to_string(),
            path: path.to_path_buf(),
            original,
            expected_after: None,
        };
        let mut guard = self.mutations.lock().await;
        let entries = guard.entry(chat_id.to_string()).or_default();
        entries.push(record);
        if entries.len() > MAX_MUTATIONS_PER_CHAT {
            let remove_count = entries.len() - MAX_MUTATIONS_PER_CHAT;
            entries.drain(..remove_count);
        }
        Some(MutationToken { id })
    }

    /// Mark a captured mutation complete with the exact bytes written.
    pub async fn commit(
        &self,
        chat_id: &str,
        token: MutationToken,
        expected_after: Option<Vec<u8>>,
    ) -> bool {
        let mut guard = self.mutations.lock().await;
        if let Some(record) = guard
            .get_mut(chat_id)
            .and_then(|entries| entries.iter_mut().find(|entry| entry.id == token.id))
        {
            let changed = expected_after != record.original;
            record.expected_after = Some(expected_after);
            changed
        } else {
            false
        }
    }

    /// Drop a capture when the underlying mutation failed before completion.
    pub async fn discard(&self, chat_id: &str, token: MutationToken) {
        let mut guard = self.mutations.lock().await;
        if let Some(entries) = guard.get_mut(chat_id) {
            entries.retain(|entry| entry.id != token.id);
            if entries.is_empty() {
                guard.remove(chat_id);
            }
        }
    }

    pub async fn info(&self, chat_id: &str, tool_call_id: &str) -> Option<CheckpointInfo> {
        let guard = self.mutations.lock().await;
        let file_count = guard.get(chat_id)?.iter().filter(|entry| {
            entry.tool_call_id == tool_call_id
                && entry
                    .expected_after
                    .as_ref()
                    .is_some_and(|expected| expected != &entry.original)
        }).count();
        (file_count > 0).then(|| CheckpointInfo {
            available: true,
            tool_call_id: tool_call_id.to_string(),
            file_count,
        })
    }

    /// Restore every completed mutation belonging to one tool call.
    ///
    /// All files are checked before any write occurs. A mismatch means the
    /// workspace changed after the agent, so the operation returns conflicts
    /// without applying a partial restore.
    pub async fn undo_tool_call(
        &self,
        chat_id: &str,
        tool_call_id: &str,
        workspace_root: &Path,
    ) -> Result<UndoResult, String> {
        // Hold the same lease used by tool execution until every verification
        // and restore write has completed. This closes the in-process TOCTOU
        // window; external processes still fail closed via byte comparison.
        let _mutation_guard = self.acquire_mutation_lock().await;
        let records = {
            let guard = self.mutations.lock().await;
            guard
                .get(chat_id)
                .map(|entries| {
                    entries
                        .iter()
                        .filter(|entry| {
                            entry.tool_call_id == tool_call_id
                                && entry
                                    .expected_after
                                    .as_ref()
                                    .is_some_and(|expected| expected != &entry.original)
                        })
                        .cloned()
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default()
        };

        if records.is_empty() {
            return Err("No recoverable checkpoint is available for this tool call.".to_string());
        }

        let mut conflicts = Vec::new();
        for record in &records {
            crate::workspace::validate_workspace_path(workspace_root, &record.path)
                .map_err(|error| format!("Checkpoint path is outside the workspace: {error}"))?;
            let current = tokio::fs::read(&record.path).await.ok();
            if Some(current) != record.expected_after {
                conflicts.push(record.path.display().to_string());
            }
        }
        if !conflicts.is_empty() {
            return Ok(UndoResult {
                restored_files: 0,
                conflicts,
            });
        }

        for record in &records {
            match &record.original {
                Some(bytes) => {
                    tokio::fs::write(&record.path, bytes)
                        .await
                        .map_err(|error| format!("Failed to restore {}: {}", record.path.display(), error))?;
                }
                None => {
                    if tokio::fs::try_exists(&record.path).await.unwrap_or(false) {
                        tokio::fs::remove_file(&record.path)
                            .await
                            .map_err(|error| format!("Failed to remove created file {}: {}", record.path.display(), error))?;
                    }
                }
            }
        }

        let mut guard = self.mutations.lock().await;
        if let Some(entries) = guard.get_mut(chat_id) {
            entries.retain(|entry| entry.tool_call_id != tool_call_id);
            if entries.is_empty() {
                guard.remove(chat_id);
            }
        }

        Ok(UndoResult {
            restored_files: records.len(),
            conflicts: Vec::new(),
        })
    }
}

impl Default for CheckpointService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn restores_modified_and_created_files() {
        let temp = TempDir::new().expect("temp workspace");
        let modified = temp.path().join("modified.txt");
        let created = temp.path().join("created.txt");
        tokio::fs::write(&modified, b"before").await.expect("seed modified");

        let service = CheckpointService::new();
        let first = service
            .capture_before("chat", "tool", &modified, Some(b"before".to_vec()))
            .await
            .expect("capture modified");
        tokio::fs::write(&modified, b"after").await.expect("mutate modified");
        service.commit("chat", first, Some(b"after".to_vec())).await;

        let second = service
            .capture_before("chat", "tool", &created, None)
            .await
            .expect("capture created");
        tokio::fs::write(&created, b"new").await.expect("create file");
        service.commit("chat", second, Some(b"new".to_vec())).await;

        let result = service.undo_tool_call("chat", "tool", temp.path()).await.expect("undo");
        assert_eq!(result.restored_files, 2);
        assert_eq!(tokio::fs::read(&modified).await.expect("read modified"), b"before");
        assert!(!created.exists());
    }

    #[tokio::test]
    async fn refuses_restore_after_external_change() {
        let temp = TempDir::new().expect("temp workspace");
        let path = temp.path().join("file.txt");
        tokio::fs::write(&path, b"before").await.expect("seed");
        let service = CheckpointService::new();
        let token = service
            .capture_before("chat", "tool", &path, Some(b"before".to_vec()))
            .await
            .expect("capture");
        tokio::fs::write(&path, b"agent").await.expect("agent write");
        service.commit("chat", token, Some(b"agent".to_vec())).await;
        tokio::fs::write(&path, b"user").await.expect("external write");

        let result = service.undo_tool_call("chat", "tool", temp.path()).await.expect("result");
        assert_eq!(result.restored_files, 0);
        assert_eq!(result.conflicts, vec![path.display().to_string()]);
        assert_eq!(tokio::fs::read(&path).await.expect("read"), b"user");
    }
}
