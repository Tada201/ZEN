use sqlx::SqlitePool;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::db::models::Document;
use crate::error::{AppError, AppResult};
use crate::rag::embedding::EmbeddingModel;
use crate::rag::{ingestion::IngestionEngine, DocumentChunk, VectorStore};

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

    fn guess_mime_type(path: &Path) -> String {
        match path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase()
            .as_str()
        {
            "pdf" => "application/pdf".to_string(),
            "doc" => "application/msword".to_string(),
            "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                .to_string(),
            "ppt" => "application/vnd.ms-powerpoint".to_string(),
            "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation"
                .to_string(),
            "xls" => "application/vnd.ms-excel".to_string(),
            "xlsx" => {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".to_string()
            }
            "rtf" => "application/rtf".to_string(),
            "odt" => "application/vnd.oasis.opendocument.text".to_string(),
            "ods" => "application/vnd.oasis.opendocument.spreadsheet".to_string(),
            "odp" => "application/vnd.oasis.opendocument.presentation".to_string(),
            "epub" => "application/epub+zip".to_string(),
            "png" => "image/png".to_string(),
            "jpg" | "jpeg" => "image/jpeg".to_string(),
            "webp" => "image/webp".to_string(),
            "tif" | "tiff" => "image/tiff".to_string(),
            "bmp" => "image/bmp".to_string(),
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

    fn guess_doc_type(path: &Path) -> &'static str {
        match path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase()
            .as_str()
        {
            "pdf" => "pdf",
            "md" => "md",
            "doc" | "docx" | "rtf" | "odt" | "epub" => "document",
            "ppt" | "pptx" | "odp" => "presentation",
            "xls" | "xlsx" | "ods" | "csv" => "spreadsheet",
            "png" | "jpg" | "jpeg" | "webp" | "tif" | "tiff" | "bmp" => "image",
            "txt" | "json" => "txt",
            _ => "txt", // code files and others treated as plain text
        }
    }

    pub async fn ingest(&self, path: String, workspace: PathBuf) -> AppResult<Document> {
        let path = crate::workspace::resolve_workspace_path(&workspace, &path)
            .map_err(|e| AppError::Custom(format!("Workspace violation: {}", e)))?;

        // 1. Read file metadata
        let metadata = tokio::fs::metadata(&path).await.map_err(|e| {
            AppError::Custom(format!("Cannot read file '{}': {}", path.display(), e))
        })?;

        if !metadata.is_file() {
            return Err(AppError::Custom(format!(
                "'{}' is not a file",
                path.display()
            )));
        }

        let file_size = metadata.len() as i64;
        let filename = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();
        let mime_type = Self::guess_mime_type(&path);
        let doc_type = Self::guess_doc_type(&path);
        let doc_id = Uuid::new_v4().to_string();

        // 2. Extract text & chunk via IngestionEngine
        let chunks: Vec<DocumentChunk> =
            self.ingestion_engine
                .process_file(&path)
                .await
                .map_err(|e| {
                    AppError::Custom(format!(
                        "Failed to extract text from '{}': {}",
                        path.display(),
                        e
                    ))
                })?;

        // 3. Get DB pool
        let pool = self
            .db_pool
            .read()
            .await
            .clone()
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
        )
        .await?;

        // 5. Store chunks in document_chunks table
        for (i, chunk) in chunks.iter().enumerate() {
            let chunk_id = format!("{}-chunk-{}", doc_id, i);
            // Rough token estimate: ~4 chars per token
            let token_count = (chunk.text.len() / 4) as i64;

            crate::db::queries::add_document_chunk(
                &pool,
                &chunk_id,
                &doc_id,
                i as i64,
                &chunk.text,
                token_count,
            )
            .await
            .map_err(|e| AppError::Custom(format!("Failed to store chunk {}: {}", i, e)))?;
        }

        // 6. Optional: Embed chunks and store in vector DB
        let has_rag =
            self.rag_store.read().await.is_some() && self.embedding_model.read().await.is_some();

        if has_rag {
            let rag_store_opt = self.rag_store.read().await.clone();
            let embed_guard = self.embedding_model.read().await;

            if let (Some(rag_store), Some(embed_model_box)) = (rag_store_opt, embed_guard.as_ref())
            {
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
                                &pool, &doc_id, "indexed", None,
                            )
                            .await;
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
        let pool = self
            .db_pool
            .read()
            .await
            .clone()
            .ok_or_else(|| AppError::Custom("Database not initialized".into()))?;
        crate::db::queries::list_documents(&pool).await
    }

    pub async fn list_page(&self, limit: i64, offset: i64) -> AppResult<Vec<Document>> {
        let pool = self
            .db_pool
            .read()
            .await
            .clone()
            .ok_or_else(|| AppError::Custom("Database not initialized".into()))?;
        crate::db::queries::list_documents_page(&pool, limit, offset).await
    }

    pub async fn get_by_id(&self, doc_id: &str) -> AppResult<Document> {
        let pool = self
            .db_pool
            .read()
            .await
            .clone()
            .ok_or_else(|| AppError::Custom("Database not initialized".into()))?;
        crate::db::queries::get_document(&pool, doc_id).await
    }

    pub async fn delete(&self, doc_id: &str) -> AppResult<()> {
        let pool = self
            .db_pool
            .read()
            .await
            .clone()
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

impl Default for DocumentService {
    fn default() -> Self {
        Self::new()
    }
}
