use async_trait::async_trait;
use serde::{Deserialize, Serialize};

pub mod conversation_store;
pub mod embedding;
pub mod hybrid_backend;
pub mod ingestion;
pub mod lancedb_store;
pub mod office_extract;
pub mod session_memory;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentChunk {
    pub id: String,
    pub source: String,   // File path or URL
    pub text: String,     // The actual chunk payload
    pub metadata: String, // JSON string of extra context
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub chunk: DocumentChunk,
    pub score: f32, // Distance/Similarity score
}

#[async_trait]
pub trait VectorStore: Send + Sync {
    /// Initialize the collection/table
    async fn init(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>>;

    /// Insert embedded document chunks
    async fn add_chunks(
        &self,
        chunks: Vec<DocumentChunk>,
        embeddings: Vec<Vec<f32>>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>>;

    /// Search for semantically similar chunks based on a query embedding
    async fn search(
        &self,
        query_embedding: Vec<f32>,
        limit: usize,
    ) -> Result<Vec<SearchResult>, Box<dyn std::error::Error + Send + Sync>>;

    /// Delete all vector chunks whose source matches the given file path.
    async fn delete_by_source(
        &self,
        source: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>>;
}
