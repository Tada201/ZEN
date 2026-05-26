use crate::agent::utils::now_ms;
use crate::agent::workflow::WorkflowExecution;
/// ISSUE-007: Unified Memory Backend Interface
///
/// Provides a trait-based abstraction (`AgentMemoryBackend`) over the existing
/// `SessionMemoryManager` and `HybridMemoryBackend`. Enables:
/// - Cross-agent memory queries (agent A can search agent B's stored data)
/// - Typed memory entries (Fact, Pattern, Result, Context)
/// - Unified store/retrieve/query/vector_search interface
///
/// The `UnifiedMemoryBackend` struct wraps the existing session memory system
/// and implements this trait without replacing any existing functionality.
use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

// ─── Types ───

/// Type of memory being stored
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MemoryType {
    /// Factual information extracted from sources
    Fact,
    /// Recurring patterns detected by the agent
    Pattern,
    /// Output of a tool call or task
    Result,
    /// Contextual information about the conversation or workload
    Context,
    /// Arbitrary custom type
    Custom(String),
}

impl Default for MemoryType {
    fn default() -> Self {
        MemoryType::Fact
    }
}

/// A unified memory entry that any agent can store and retrieve.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMemory {
    pub id: String,
    /// Which agent created this memory
    pub agent_id: String,
    /// Session/chat scope (empty for global memories)
    pub session_id: String,
    /// The actual content
    pub content: String,
    /// Classification of the memory
    pub memory_type: MemoryType,
    /// Arbitrary metadata
    #[serde(default)]
    pub metadata: HashMap<String, Value>,
    /// Unix epoch ms
    pub timestamp: i64,
}

impl AgentMemory {
    pub fn new(
        agent_id: impl Into<String>,
        session_id: impl Into<String>,
        content: impl Into<String>,
        memory_type: MemoryType,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            agent_id: agent_id.into(),
            session_id: session_id.into(),
            content: content.into(),
            memory_type,
            metadata: HashMap::new(),
            timestamp: now_ms(),
        }
    }

    /// Builder: attach metadata.
    pub fn with_metadata(mut self, key: impl Into<String>, value: Value) -> Self {
        self.metadata.insert(key.into(), value);
        self
    }
}

/// Query filter for memory retrieval.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MemoryQuery {
    /// Filter by agent (None = all agents)
    pub agent_id: Option<String>,
    /// Filter by session (None = all sessions)
    pub session_id: Option<String>,
    /// Filter by memory type (None = all types)
    pub memory_type: Option<MemoryType>,
    /// Text search query (None = no text filter)
    pub text_query: Option<String>,
    /// Max results
    pub limit: usize,
}

/// A memory search result with similarity score.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMemorySearchResult {
    pub memory: AgentMemory,
    pub similarity: f32,
}

// ─── Trait ───

/// Unified memory backend interface.
///
/// Any storage backend (SQLite, LanceDB, hybrid, etc.) can implement this.
#[async_trait::async_trait]
pub trait AgentMemoryBackend: Send + Sync {
    /// Store a memory entry.
    async fn store(&self, memory: AgentMemory) -> Result<AgentMemory>;

    /// Retrieve a memory by ID.
    async fn retrieve(&self, id: &str) -> Result<Option<AgentMemory>>;

    /// Query memories with filters.
    async fn query(&self, query: MemoryQuery) -> Result<Vec<AgentMemory>>;

    /// Vector similarity search (requires embedding backend).
    async fn vector_search(
        &self,
        embedding: &[f32],
        k: usize,
    ) -> Result<Vec<AgentMemorySearchResult>>;

    /// Delete all memories for a specific agent.
    async fn clear_agent(&self, agent_id: &str) -> Result<()>;

    /// Delete all memories in a session.
    async fn clear_session(&self, session_id: &str) -> Result<()>;

    /// Store a serialized workflow execution state.
    async fn store_workflow_state(
        &self,
        workflow_id: &str,
        execution: &WorkflowExecution,
    ) -> Result<()>;

    /// Retrieve a serialized workflow execution state.
    async fn retrieve_workflow_state(&self, workflow_id: &str)
        -> Result<Option<WorkflowExecution>>;

    /// List all saved workflow IDs.
    async fn list_saved_workflows(&self) -> Result<Vec<String>>;

    /// Delete a saved workflow state.
    async fn delete_workflow_state(&self, workflow_id: &str) -> Result<()>;
}

// ─── In-Memory Implementation ───

/// Simple in-memory implementation for testing and as a fallback.
///
/// Production code should use `UnifiedMemoryBackend` which wraps the
/// existing `SessionMemoryManager` + `HybridMemoryBackend`.
pub struct InMemoryBackend {
    memories: RwLock<Vec<AgentMemory>>,
}

impl InMemoryBackend {
    pub fn new() -> Self {
        Self {
            memories: RwLock::new(Vec::new()),
        }
    }
}

#[async_trait::async_trait]
impl AgentMemoryBackend for InMemoryBackend {
    async fn store(&self, memory: AgentMemory) -> Result<AgentMemory> {
        let mut store = self.memories.write().await;
        store.push(memory.clone());
        Ok(memory)
    }

    async fn retrieve(&self, id: &str) -> Result<Option<AgentMemory>> {
        let store = self.memories.read().await;
        Ok(store.iter().find(|m| m.id == id).cloned())
    }

    async fn query(&self, query: MemoryQuery) -> Result<Vec<AgentMemory>> {
        let store = self.memories.read().await;

        let results: Vec<AgentMemory> = store
            .iter()
            .filter(|m| {
                if let Some(ref agent_id) = query.agent_id {
                    if m.agent_id != *agent_id {
                        return false;
                    }
                }
                if let Some(ref session_id) = query.session_id {
                    if m.session_id != *session_id {
                        return false;
                    }
                }
                if let Some(ref mt) = query.memory_type {
                    if m.memory_type != *mt {
                        return false;
                    }
                }
                if let Some(ref text) = query.text_query {
                    let lower = text.to_lowercase();
                    if !m.content.to_lowercase().contains(&lower) {
                        return false;
                    }
                }
                true
            })
            .take(query.limit.max(1))
            .cloned()
            .collect();

        Ok(results)
    }

    async fn vector_search(
        &self,
        _embedding: &[f32],
        _k: usize,
    ) -> Result<Vec<AgentMemorySearchResult>> {
        // In-memory backend doesn't support vector search
        Ok(Vec::new())
    }

    async fn clear_agent(&self, agent_id: &str) -> Result<()> {
        let mut store = self.memories.write().await;
        store.retain(|m| m.agent_id != agent_id);
        Ok(())
    }

    async fn clear_session(&self, session_id: &str) -> Result<()> {
        let mut store = self.memories.write().await;
        store.retain(|m| m.session_id != session_id);
        Ok(())
    }

    async fn store_workflow_state(
        &self,
        workflow_id: &str,
        execution: &WorkflowExecution,
    ) -> Result<()> {
        let json = serde_json::to_string(execution)?;
        let memory = AgentMemory::new("workflow-system", "workflows", json, MemoryType::Context)
            .with_metadata("workflow_id".to_string(), serde_json::json!(workflow_id));

        let mut store = self.memories.write().await;
        store.retain(|m| m.metadata.get("workflow_id") != Some(&serde_json::json!(workflow_id)));
        store.push(memory);
        Ok(())
    }

    async fn retrieve_workflow_state(
        &self,
        workflow_id: &str,
    ) -> Result<Option<WorkflowExecution>> {
        let store = self.memories.read().await;
        let found = store
            .iter()
            .find(|m| m.metadata.get("workflow_id") == Some(&serde_json::json!(workflow_id)));

        if let Some(memory) = found {
            let execution: WorkflowExecution = serde_json::from_str(&memory.content)?;
            Ok(Some(execution))
        } else {
            Ok(None)
        }
    }

    async fn list_saved_workflows(&self) -> Result<Vec<String>> {
        let store = self.memories.read().await;
        let ids: Vec<String> = store
            .iter()
            .filter(|m| m.metadata.get("workflow_id").is_some())
            .filter_map(|m| {
                m.metadata
                    .get("workflow_id")
                    .and_then(|v| v.as_str().map(String::from))
            })
            .collect();
        Ok(ids)
    }

    async fn delete_workflow_state(&self, workflow_id: &str) -> Result<()> {
        let mut store = self.memories.write().await;
        store.retain(|m| m.metadata.get("workflow_id") != Some(&serde_json::json!(workflow_id)));
        Ok(())
    }
}

// ─── Unified Backend (wraps existing SessionMemoryManager) ───

/// Production backend that wraps the existing `SessionMemoryManager`.
///
/// Converts between `AgentMemory` ↔ `MemoryEntry` internally,
/// delegating storage to the session memory system.
pub struct UnifiedMemoryBackend {
    session_memory: Arc<crate::rag::session_memory::SessionMemoryManager>,
    /// Local index for cross-agent queries (agent_id → memory IDs)
    agent_index: RwLock<HashMap<String, Vec<String>>>,
    /// ID → AgentMemory lookup for fast retrieval
    memory_cache: RwLock<HashMap<String, AgentMemory>>,
}

impl UnifiedMemoryBackend {
    pub fn new(session_memory: Arc<crate::rag::session_memory::SessionMemoryManager>) -> Self {
        Self {
            session_memory,
            agent_index: RwLock::new(HashMap::new()),
            memory_cache: RwLock::new(HashMap::new()),
        }
    }

    /// Convert an AgentMemory into the existing MemoryEntry format.
    fn to_memory_entry(memory: &AgentMemory) -> crate::rag::session_memory::MemoryEntry {
        let metadata = serde_json::to_string(&serde_json::json!({
            "agent_id": memory.agent_id,
            "memory_type": memory.memory_type,
            "metadata": memory.metadata,
        }))
        .ok();

        crate::rag::session_memory::MemoryEntry {
            id: memory.id.clone(),
            session_id: memory.session_id.clone(),
            content: memory.content.clone(),
            metadata,
            written_by: memory.agent_id.clone(),
            timestamp: memory.timestamp as u64,
        }
    }
}

#[async_trait::async_trait]
impl AgentMemoryBackend for UnifiedMemoryBackend {
    async fn store(&self, memory: AgentMemory) -> Result<AgentMemory> {
        let entry = Self::to_memory_entry(&memory);
        self.session_memory
            .write_memory(&memory.session_id, entry)
            .await?;

        // Update local indices
        {
            let mut index = self.agent_index.write().await;
            index
                .entry(memory.agent_id.clone())
                .or_insert_with(Vec::new)
                .push(memory.id.clone());
        }
        {
            let mut cache = self.memory_cache.write().await;
            cache.insert(memory.id.clone(), memory.clone());
        }

        Ok(memory)
    }

    async fn retrieve(&self, id: &str) -> Result<Option<AgentMemory>> {
        let cache = self.memory_cache.read().await;
        Ok(cache.get(id).cloned())
    }

    async fn query(&self, query: MemoryQuery) -> Result<Vec<AgentMemory>> {
        let cache = self.memory_cache.read().await;

        let results: Vec<AgentMemory> = cache
            .values()
            .filter(|m| {
                if let Some(ref agent_id) = query.agent_id {
                    if m.agent_id != *agent_id {
                        return false;
                    }
                }
                if let Some(ref session_id) = query.session_id {
                    if m.session_id != *session_id {
                        return false;
                    }
                }
                if let Some(ref mt) = query.memory_type {
                    if m.memory_type != *mt {
                        return false;
                    }
                }
                if let Some(ref text) = query.text_query {
                    let lower = text.to_lowercase();
                    if !m.content.to_lowercase().contains(&lower) {
                        return false;
                    }
                }
                true
            })
            .take(query.limit.max(1))
            .cloned()
            .collect();

        Ok(results)
    }

    async fn vector_search(
        &self,
        _embedding: &[f32],
        _k: usize,
    ) -> Result<Vec<AgentMemorySearchResult>> {
        // Delegating vector search to the underlying hybrid backend would
        // require access to the embedding pipeline. For now, return empty.
        // Phase 2 will wire this when HybridMemoryBackend is refactored.
        Ok(Vec::new())
    }

    async fn clear_agent(&self, agent_id: &str) -> Result<()> {
        let mut index = self.agent_index.write().await;
        let mut cache = self.memory_cache.write().await;

        if let Some(ids) = index.remove(agent_id) {
            for id in ids {
                cache.remove(&id);
            }
        }

        Ok(())
    }

    async fn clear_session(&self, session_id: &str) -> Result<()> {
        self.session_memory
            .delete_session_memory(session_id)
            .await?;

        // Clean local caches
        let mut cache = self.memory_cache.write().await;
        let mut index = self.agent_index.write().await;

        let ids_to_remove: Vec<String> = cache
            .values()
            .filter(|m| m.session_id == session_id)
            .map(|m| m.id.clone())
            .collect();

        for id in &ids_to_remove {
            cache.remove(id);
        }

        for ids in index.values_mut() {
            ids.retain(|id| !ids_to_remove.contains(id));
        }

        Ok(())
    }

    async fn store_workflow_state(
        &self,
        workflow_id: &str,
        execution: &WorkflowExecution,
    ) -> Result<()> {
        let json = serde_json::to_string(execution)?;
        let memory = AgentMemory::new("workflow-system", "workflows", json, MemoryType::Context)
            .with_metadata("workflow_id".to_string(), serde_json::json!(workflow_id));

        self.store(memory).await?;
        Ok(())
    }

    async fn retrieve_workflow_state(
        &self,
        workflow_id: &str,
    ) -> Result<Option<WorkflowExecution>> {
        let results = self
            .query(MemoryQuery {
                agent_id: Some("workflow-system".to_string()),
                session_id: Some("workflows".to_string()),
                memory_type: Some(MemoryType::Context),
                text_query: Some(workflow_id.to_string()),
                limit: 1,
            })
            .await?;

        for memory in results {
            if memory.metadata.get("workflow_id") == Some(&serde_json::json!(workflow_id)) {
                let execution: WorkflowExecution = serde_json::from_str(&memory.content)?;
                return Ok(Some(execution));
            }
        }

        Ok(None)
    }

    async fn list_saved_workflows(&self) -> Result<Vec<String>> {
        let results = self
            .query(MemoryQuery {
                agent_id: Some("workflow-system".to_string()),
                session_id: Some("workflows".to_string()),
                memory_type: Some(MemoryType::Context),
                limit: 100,
                ..Default::default()
            })
            .await?;

        let ids: Vec<String> = results
            .iter()
            .filter_map(|m| {
                m.metadata
                    .get("workflow_id")
                    .and_then(|v| v.as_str().map(String::from))
            })
            .collect();
        Ok(ids)
    }

    async fn delete_workflow_state(&self, workflow_id: &str) -> Result<()> {
        let results = self
            .query(MemoryQuery {
                agent_id: Some("workflow-system".to_string()),
                session_id: Some("workflows".to_string()),
                memory_type: Some(MemoryType::Context),
                text_query: Some(workflow_id.to_string()),
                limit: 10,
            })
            .await?;

        let mut cache = self.memory_cache.write().await;
        for memory in results {
            if memory.metadata.get("workflow_id") == Some(&serde_json::json!(workflow_id)) {
                cache.remove(&memory.id);
            }
        }

        Ok(())
    }
}

// ─── Tests ───

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_store_and_retrieve() {
        let backend = InMemoryBackend::new();

        let mem = AgentMemory::new("zen", "session-1", "The sky is blue", MemoryType::Fact);
        let id = mem.id.clone();

        let stored = backend.store(mem).await.unwrap();
        assert_eq!(stored.id, id);

        let retrieved = backend.retrieve(&id).await.unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().content, "The sky is blue");
    }

    #[tokio::test]
    async fn test_query_by_agent() {
        let backend = InMemoryBackend::new();

        backend
            .store(AgentMemory::new("zen", "s1", "Content A", MemoryType::Fact))
            .await
            .unwrap();
        backend
            .store(AgentMemory::new(
                "zen-docs",
                "s1",
                "Content B",
                MemoryType::Result,
            ))
            .await
            .unwrap();
        backend
            .store(AgentMemory::new(
                "zen",
                "s1",
                "Content C",
                MemoryType::Pattern,
            ))
            .await
            .unwrap();

        let results = backend
            .query(MemoryQuery {
                agent_id: Some("zen".to_string()),
                limit: 10,
                ..Default::default()
            })
            .await
            .unwrap();

        assert_eq!(results.len(), 2);
    }

    #[tokio::test]
    async fn test_query_by_type() {
        let backend = InMemoryBackend::new();

        backend
            .store(AgentMemory::new("zen", "s1", "Fact 1", MemoryType::Fact))
            .await
            .unwrap();
        backend
            .store(AgentMemory::new(
                "zen",
                "s1",
                "Pattern 1",
                MemoryType::Pattern,
            ))
            .await
            .unwrap();

        let results = backend
            .query(MemoryQuery {
                memory_type: Some(MemoryType::Pattern),
                limit: 10,
                ..Default::default()
            })
            .await
            .unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].content, "Pattern 1");
    }

    #[tokio::test]
    async fn test_text_search() {
        let backend = InMemoryBackend::new();

        backend
            .store(AgentMemory::new(
                "zen",
                "s1",
                "Rust is fast",
                MemoryType::Fact,
            ))
            .await
            .unwrap();
        backend
            .store(AgentMemory::new(
                "zen",
                "s1",
                "Python is easy",
                MemoryType::Fact,
            ))
            .await
            .unwrap();

        let results = backend
            .query(MemoryQuery {
                text_query: Some("rust".to_string()),
                limit: 10,
                ..Default::default()
            })
            .await
            .unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].content, "Rust is fast");
    }

    #[tokio::test]
    async fn test_clear_agent() {
        let backend = InMemoryBackend::new();

        backend
            .store(AgentMemory::new("zen", "s1", "A", MemoryType::Fact))
            .await
            .unwrap();
        backend
            .store(AgentMemory::new("zen-docs", "s1", "B", MemoryType::Fact))
            .await
            .unwrap();

        backend.clear_agent("zen").await.unwrap();

        let all = backend
            .query(MemoryQuery {
                limit: 10,
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].agent_id, "zen-docs");
    }

    #[tokio::test]
    async fn test_clear_session() {
        let backend = InMemoryBackend::new();

        backend
            .store(AgentMemory::new("zen", "s1", "A", MemoryType::Fact))
            .await
            .unwrap();
        backend
            .store(AgentMemory::new("zen", "s2", "B", MemoryType::Fact))
            .await
            .unwrap();

        backend.clear_session("s1").await.unwrap();

        let all = backend
            .query(MemoryQuery {
                limit: 10,
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].session_id, "s2");
    }

    #[tokio::test]
    async fn test_cross_agent_search() {
        let backend = InMemoryBackend::new();

        // Agent A stores findings
        backend
            .store(AgentMemory::new(
                "zen-docs",
                "s1",
                "Found 5 related papers",
                MemoryType::Result,
            ))
            .await
            .unwrap();

        // Agent B can search Agent A's findings
        let results = backend
            .query(MemoryQuery {
                agent_id: Some("zen-docs".to_string()),
                text_query: Some("papers".to_string()),
                limit: 10,
                ..Default::default()
            })
            .await
            .unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].agent_id, "zen-docs");
    }
}
