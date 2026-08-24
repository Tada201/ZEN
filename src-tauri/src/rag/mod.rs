//! App-side re-export shim for zen-rag (BIG_MIGRATION.md Phase 9).
//!
//! Vector stores, embedding backends, the ingestion pipeline and the hybrid
//! session-memory backend now live in the `zen-rag` workspace crate. Every
//! historical `crate::rag::*` path keeps compiling via these re-exports;
//! Phase 14 deletes this shim after rewriting consumers to their deliberate
//! final paths (relocation doctrine, BIG_MIGRATION.md §4.6).

pub use zen_rag::{
    conversation_store, embedding, hybrid_backend, ingestion, lancedb_store, office_extract,
    session_memory,
};
pub use zen_rag::{DocumentChunk, SearchResult, VectorStore};
