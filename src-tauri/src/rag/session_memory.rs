/// Session-Scoped Vector Sub-Memory (Hybrid Backend)
///
/// This module provides temporary storage for complex Tier 3 workflows.
/// Now supports:
/// - **Hybrid Backend**: SQLite + LanceDB with HNSW vector index
/// - **Semantic Search**: Cosine similarity on embeddings (Ollama/Candle)
/// - **Fallback**: Text search if embedding backend unavailable
///
/// **Privacy Guarantee:** All embeddings generated locally via Ollama or Candle.
/// No data sent to cloud APIs.

use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use anyhow::Result;

// Re-export MemoryEntry for backward compatibility
pub use crate::rag::hybrid_backend::MemorySearchResult;

// Re-export embedding types for convenience
pub use crate::rag::embedding::{EmbeddingConfig, EmbeddingBackend, EmbeddingModel};
pub use crate::rag::hybrid_backend::{HybridMemoryBackend, HybridBackendConfig};

/// Session memory entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    /// Unique entry ID
    pub id: String,
    /// Session/chat ID this belongs to
    pub session_id: String,
    /// The text content
    pub content: String,
    /// Optional metadata (JSON string)
    pub metadata: Option<String>,
    /// Agent who wrote this
    pub written_by: String,
    /// Timestamp (Unix epoch ms)
    pub timestamp: u64,
}

/// Session memory manager - stores entries with hybrid backend support
pub struct SessionMemoryManager {
    /// In-memory storage: session_id -> entries (fallback)
    memories: Arc<RwLock<HashMap<String, Vec<MemoryEntry>>>>,
    /// Workspace root for persistence
    workspace_root: PathBuf,
    /// Optional hybrid backend (SQLite + LanceDB with embeddings)
    hybrid_backend: Option<Arc<HybridMemoryBackend>>,
}

impl SessionMemoryManager {
    /// Create a new session memory manager (in-memory fallback)
    pub fn new(workspace_root: PathBuf) -> Self {
        Self {
            memories: Arc::new(RwLock::new(HashMap::new())),
            workspace_root,
            hybrid_backend: None,
        }
    }

    /// Create session memory manager with hybrid backend
    pub async fn with_hybrid_backend(
        workspace_root: PathBuf,
        hybrid_backend: Arc<HybridMemoryBackend>,
    ) -> Self {
        Self {
            memories: Arc::new(RwLock::new(HashMap::new())),
            workspace_root,
            hybrid_backend: Some(hybrid_backend),
        }
    }

    /// Check if hybrid backend is available
    pub fn has_hybrid_backend(&self) -> bool {
        self.hybrid_backend.is_some()
    }

    /// Write a memory entry to session storage
    pub async fn write_memory(
        &self,
        session_id: &str,
        entry: MemoryEntry,
    ) -> Result<(), anyhow::Error> {
        // Try hybrid backend first (if available)
        if let Some(ref hybrid) = self.hybrid_backend {
            match hybrid.store(entry.clone()).await {
                Ok(_) => {
                    tracing::debug!("Stored memory in hybrid backend");
                    // Also update in-memory cache for fast access
                    let mut memories = self.memories.write().await;
                    let entries = memories.entry(session_id.to_string()).or_insert_with(Vec::new);
                    entries.push(entry);
                    return Ok(());
                }
                Err(e) => {
                    tracing::warn!("Hybrid backend failed, falling back to in-memory: {}", e);
                    // Fall through to in-memory storage
                }
            }
        }

        // Fallback: in-memory storage
        let mut memories = self.memories.write().await;
        let entries = memories.entry(session_id.to_string()).or_insert_with(Vec::new);
        entries.push(entry);
        let _ = self.persist_session(session_id).await;
        Ok(())
    }

    /// Search within session memory
    /// - If hybrid backend available: semantic search with embeddings
    /// - Fallback: simple text match
    pub async fn search_session_memory(
        &self,
        session_id: &str,
        query: &str,
        limit: usize,
    ) -> Result<Vec<MemoryEntry>, anyhow::Error> {
        // Try hybrid backend first (semantic search)
        if let Some(ref hybrid) = self.hybrid_backend {
            match hybrid.semantic_search(session_id, query, limit).await {
                Ok(results) => {
                    tracing::debug!("Semantic search found {} results", results.len());
                    return Ok(results.into_iter().map(|r| r.memory).collect());
                }
                Err(e) => {
                    tracing::warn!("Hybrid semantic search failed, falling back to text search: {}", e);
                    // Fall through to text search
                }
            }
        }

        // Fallback: simple text search
        let memories = self.memories.read().await;
        if let Some(entries) = memories.get(session_id) {
            let query_lower = query.to_lowercase();
            let mut results: Vec<&MemoryEntry> = entries
                .iter()
                .filter(|e| {
                    e.content.to_lowercase().contains(&query_lower) ||
                    e.metadata.as_ref().map(|m| m.to_lowercase().contains(&query_lower)).unwrap_or(false)
                })
                .take(limit)
                .collect();
            if results.is_empty() {
                results = entries.iter().take(limit).collect();
            }
            Ok(results.into_iter().cloned().collect())
        } else {
            Ok(Vec::new())
        }
    }

    /// Semantic search with similarity scores (hybrid backend only)
    pub async fn semantic_search_with_scores(
        &self,
        session_id: &str,
        query: &str,
        limit: usize,
    ) -> Result<Vec<MemorySearchResult>, anyhow::Error> {
        if let Some(ref hybrid) = self.hybrid_backend {
            hybrid.semantic_search(session_id, query, limit).await
        } else {
            // Fallback: return text search results with dummy scores
            let entries = self.search_session_memory(session_id, query, limit).await?;
            Ok(entries.into_iter().map(|e| MemorySearchResult {
                memory: e,
                similarity: 0.5, // Dummy score
            }).collect())
        }
    }

    /// Delete a session's memory (cleanup)
    pub async fn delete_session_memory(
        &self,
        session_id: &str,
    ) -> Result<(), anyhow::Error> {
        // Delete from hybrid backend first
        if let Some(ref hybrid) = self.hybrid_backend {
            let _ = hybrid.delete_session(session_id).await;
        }

        // Delete from in-memory
        let mut memories = self.memories.write().await;
        memories.remove(session_id);

        // Remove persisted file
        let _ = self.delete_persisted_session(session_id).await;

        Ok(())
    }

    /// Get count of memories in a session
    pub async fn get_memory_count(
        &self,
        session_id: &str,
    ) -> Result<usize, anyhow::Error> {
        // Try hybrid backend first
        if let Some(ref hybrid) = self.hybrid_backend {
            match hybrid.count(session_id).await {
                Ok(count) => return Ok(count),
                Err(e) => {
                    tracing::warn!("Hybrid count failed, falling back to in-memory: {}", e);
                }
            }
        }

        // Fallback: in-memory count
        let memories = self.memories.read().await;
        Ok(memories.get(session_id).map(|v| v.len()).unwrap_or(0))
    }

    /// Persist session to file
    async fn persist_session(&self, session_id: &str) -> Result<(), anyhow::Error> {
        let memories = self.memories.read().await;
        
        if let Some(entries) = memories.get(session_id) {
            let session_path = self.workspace_root
                .join("sessions")
                .join(session_id)
                .join("memory.json");
            
            let json = serde_json::to_string_pretty(entries)?;
            tokio::fs::write(session_path, json).await?;
        }
        
        Ok(())
    }

    /// Delete persisted session file
    async fn delete_persisted_session(&self, session_id: &str) -> Result<(), anyhow::Error> {
        let session_path = self.workspace_root
            .join("sessions")
            .join(session_id)
            .join("memory.json");
        
        if session_path.exists() {
            tokio::fs::remove_file(session_path).await?;
        }
        
        Ok(())
    }

    /// Load session from file (if exists)
    pub async fn load_session(&self, session_id: &str) -> Result<(), anyhow::Error> {
        let session_path = self.workspace_root
            .join("sessions")
            .join(session_id)
            .join("memory.json");
        
        if session_path.exists() {
            let json = tokio::fs::read_to_string(session_path).await?;
            let entries: Vec<MemoryEntry> = serde_json::from_str(&json)?;
            
            let mut memories = self.memories.write().await;
            memories.insert(session_id.to_string(), entries);
        }
        
        Ok(())
    }
}

/// Helper to create a memory entry
pub fn create_memory_entry(
    session_id: &str,
    content: &str,
    written_by: &str,
    metadata: Option<&str>,
) -> MemoryEntry {
    use uuid::Uuid;
    
    MemoryEntry {
        id: Uuid::new_v4().to_string(),
        session_id: session_id.to_string(),
        content: content.to_string(),
        metadata: metadata.map(String::from),
        written_by: written_by.to_string(),
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_write_and_search_memory() {
        let temp_dir = TempDir::new().unwrap();
        let manager = SessionMemoryManager::new(temp_dir.path().to_path_buf());
        
        let session_id = "test-session-123";
        
        // Write memory
        let entry = create_memory_entry(
            session_id,
            "This is a test finding from the research agent",
            "ZEN-DOCS",
            Some("{\"source\": \"web_search\"}"),
        );
        
        let write_result = manager.write_memory(session_id, entry).await;
        assert!(write_result.is_ok());

        // Search memory
        let search_result = manager.search_session_memory(session_id, "test", 10).await;
        assert!(search_result.is_ok());
        assert_eq!(search_result.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn test_delete_session_memory() {
        let temp_dir = TempDir::new().unwrap();
        let manager = SessionMemoryManager::new(temp_dir.path().to_path_buf());
        
        let session_id = "test-session-456";
        
        // Write memory
        let entry = create_memory_entry(session_id, "Test content", "ZEN", None);
        let _ = manager.write_memory(session_id, entry).await;
        
        // Verify exists
        let count = manager.get_memory_count(session_id).await.unwrap();
        assert_eq!(count, 1);
        
        // Delete
        let delete_result = manager.delete_session_memory(session_id).await;
        assert!(delete_result.is_ok());
        
        // Verify deleted
        let count = manager.get_memory_count(session_id).await.unwrap();
        assert_eq!(count, 0);
    }
}
