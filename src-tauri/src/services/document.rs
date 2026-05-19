use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::{AppResult, AppError};
use crate::rag::{DocumentChunk, VectorStore, ingestion::IngestionEngine};
use crate::rag::embedding::EmbeddingModel;
use crate::db::models::Document;

pub struct DocumentService {
    pub db_pool: Arc<RwLock<Option<SqlitePool>>>,
    pub rag_store: Arc<RwLock<Option<Arc<dyn VectorStore>>>>,
    pub embedding_model: Arc<RwLock<Option<Box<dyn EmbeddingModel>>>>,
    ingestion_engine: IngestionEngine,
}

impl DocumentService {
    pub fn new() -> Self {
        Self {
            db_pool: Arc::new(RwLock::new(None)),
            rag_store: Arc::new(RwLock::new(None)),
            embedding_model: Arc::new(RwLock::new(None)),
            ingestion_engine: IngestionEngine::default(),
        }
    }

    pub async fn set_db_pool(&self, pool: SqlitePool) {
        let mut lock = self.db_pool.write().await;
        *lock = Some(pool);
    }

    pub async fn set_rag_store(&self, store: Arc<dyn VectorStore>, model: Box<dyn EmbeddingModel>) {
        let mut store_lock = self.rag_store.write().await;
        *store_lock = Some(store);
        let mut model_lock = self.embedding_model.write().await;
        *model_lock = Some(model);
    }

    fn guess_mime_type(path: &PathBuf) -> String {
        match path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase().as_str() {
            "pdf" => "application/pdf".to_string(),
            "txt" => "text/plain".to_string(),
            "md" => "text/markdown".to_string(),
            "csv" => "text/csv".to_string(),
            "json" => "application/json".to_string(),
            "rs" => "text/x-rust".to_string(),
            "js" => "text/javascript".to_string(),
            "ts" => "text/typescript".to_string(),
            "py" => "text/x-python".to_string(),
            "html" => "text/html".to_string(),
            "css" => "text/css".to_string(),
            "xml" => "application/xml".to_string(),
            "yaml" | "yml" => "application/x-yaml".to_string(),
            "toml" => "application/toml".to_string(),
            _ => "application/octet-stream".to_string(),
        }
    }

    fn guess_doc_type(path: &PathBuf) -> &'static str {
        match path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase().as_str() {
            "pdf" => "pdf",
            "md" => "md",
            "txt" | "csv" | "json" => "txt",
            _ => "txt", // code files and others treated as plain text
        }
    }

    pub async fn ingest(&self, path: PathBuf) -> AppResult<Document> {
        // 1. Read file metadata
        let metadata = tokio::fs::metadata(&path).await
            .map_err(|e| AppError::Custom(format!("Cannot read file '{}': {}", path.display(), e)))?;
        
        if !metadata.is_file() {
            return Err(AppError::Custom(format!("'{}' is not a file", path.display())));
        }

        let file_size = metadata.len() as i64;
        let filename = path.file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();
        let mime_type = Self::guess_mime_type(&path);
        let doc_type = Self::guess_doc_type(&path);
        let doc_id = Uuid::new_v4().to_string();

        // 2. Extract text & chunk via IngestionEngine
        let chunks: Vec<DocumentChunk> = self.ingestion_engine.process_file(&path).await
            .map_err(|e| AppError::Custom(format!("Failed to extract text from '{}': {}", path.display(), e)))?;

        // 3. Get DB pool
        let pool = self.db_pool.read().await.clone()
            .ok_or_else(|| AppError::Custom("Database not initialized".into()))?;

        // 4. Store document metadata in SQLite
        let _doc = crate::db::queries::add_document(
            &pool,
            &doc_id,
            &filename,
            &path.to_string_lossy(),
            file_size,
            doc_type,
            "nomic-embed-text", // default embedding model name
            &mime_type,
        ).await?;

        // 5. Store chunks in document_chunks table
        for (i, chunk) in chunks.iter().enumerate() {
            let chunk_id = format!("{}-chunk-{}", doc_id, i);
            // Rough token estimate: ~4 chars per token
            let token_count = (chunk.text.len() / 4) as i64;

            sqlx::query(
                "INSERT INTO document_chunks (id, document_id, chunk_index, content, token_count) VALUES (?, ?, ?, ?, ?)"
            )
            .bind(&chunk_id)
            .bind(&doc_id)
            .bind(i as i64)
            .bind(&chunk.text)
            .bind(token_count)
            .execute(&pool)
            .await
            .map_err(|e| AppError::Custom(format!("Failed to store chunk {}: {}", i, e)))?;
        }

        // 6. Optional: Embed chunks and store in vector DB
        let has_rag = self.rag_store.read().await.is_some()
            && self.embedding_model.read().await.is_some();

        if has_rag {
            let rag_store_opt = self.rag_store.read().await.clone();
            let embed_guard = self.embedding_model.read().await;

            if let (Some(rag_store), Some(embed_model_box)) = (rag_store_opt, embed_guard.as_ref()) {
                let embed_model: &dyn EmbeddingModel = &**embed_model_box;

                // Generate embeddings for all chunks
                let texts: Vec<&str> = chunks.iter().map(|c| c.text.as_str()).collect();
                match embed_model.encode_batch(&texts).await {
                    Ok(embeddings) => {
                        // Store in vector DB
                        if let Err(e) = rag_store.add_chunks(chunks.clone(), embeddings).await {
                            eprintln!("Warning: Failed to store chunks in vector DB: {}", e);
                            // Don't fail the whole ingest — doc is still in SQLite
                        } else {
                            // Update status to indexed
                            let _ = crate::db::queries::update_document_status(
                                &pool, &doc_id, "indexed", None
                            ).await;
                        }
                    }
                    Err(e) => {
                        eprintln!("Warning: Failed to generate embeddings: {}", e);
                        // Chunks still stored in SQLite for text search
                    }
                }
            }
        }

        // 7. Return the stored document
        let stored = crate::db::queries::get_document(&pool, &doc_id).await?;
        Ok(stored)
    }

    pub async fn list(&self) -> AppResult<Vec<Document>> {
        let pool = self.db_pool.read().await.clone()
            .ok_or_else(|| AppError::Custom("Database not initialized".into()))?;
        crate::db::queries::list_documents(&pool).await
    }

    pub async fn get_by_id(&self, doc_id: &str) -> AppResult<Document> {
        let pool = self.db_pool.read().await.clone()
            .ok_or_else(|| AppError::Custom("Database not initialized".into()))?;
        crate::db::queries::get_document(&pool, doc_id).await
    }

    pub async fn delete(&self, doc_id: &str) -> AppResult<()> {
        let pool = self.db_pool.read().await.clone()
            .ok_or_else(|| AppError::Custom("Database not initialized".into()))?;

        // Remove from vector store if available
        if let Some(store) = self.rag_store.read().await.as_ref() {
            // Try to find the source path from the doc record
            if let Ok(doc) = crate::db::queries::get_document(&pool, doc_id).await {
                if let Some(ref path) = doc.file_path {
                    let _ = store.delete_by_source(path).await;
                }
            }
        }

        // Remove from SQLite (cascades to document_chunks)
        crate::db::queries::delete_document(&pool, doc_id).await
    }
}
