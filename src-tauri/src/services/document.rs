use sqlx::SqlitePool;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

use zen_db::models::Document;
use zen_core::error::{AppError, AppResult};
use zen_rag::embedding::EmbeddingModel;
use zen_rag::{ingestion::IngestionEngine, DocumentChunk, VectorStore};

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
            .map_err(|e| AppError::Custom(format!("Workspace violation: {e}")))?;

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
        let _doc = zen_db::queries::add_document(
            &pool,
            &zen_db::queries::NewDocument {
                id: &doc_id,
                filename: &filename,
                file_path: &path.to_string_lossy(),
                file_size,
                doc_type,
                embedding_model: "nomic-embed-text",
                mime_type: &mime_type,
            },
        )
        .await?;

        // 5. Store chunks in document_chunks table
        for (i, chunk) in chunks.iter().enumerate() {
            let chunk_id = format!("{doc_id}-chunk-{i}");
            // Rough token estimate: ~4 chars per token
            let token_count = (chunk.text.len() / 4) as i64;

            zen_db::queries::add_document_chunk(
                &pool,
                &chunk_id,
                &doc_id,
                i as i64,
                &chunk.text,
                token_count,
            )
            .await
            .map_err(|e| AppError::Custom(format!("Failed to store chunk {i}: {e}")))?;
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
                            eprintln!("Warning: Failed to store chunks in vector DB: {e}");
                            // Don't fail the whole ingest — doc is still in SQLite
                        } else {
                            // Update status to indexed
                            let _ = zen_db::queries::update_document_status(
                                &pool, &doc_id, "indexed", None,
                            )
                            .await;
                        }
                    }
                    Err(e) => {
                        eprintln!("Warning: Failed to generate embeddings: {e}");
                        // Chunks still stored in SQLite for text search
                    }
                }
            }
        }

        // 7. Return the stored document
        let stored = zen_db::queries::get_document(&pool, &doc_id).await?;
        Ok(stored)
    }

    pub async fn list(&self) -> AppResult<Vec<Document>> {
        let pool = self
            .db_pool
            .read()
            .await
            .clone()
            .ok_or_else(|| AppError::Custom("Database not initialized".into()))?;
        zen_db::queries::list_documents(&pool).await
    }

    pub async fn list_page(&self, limit: i64, offset: i64) -> AppResult<Vec<Document>> {
        let pool = self
            .db_pool
            .read()
            .await
            .clone()
            .ok_or_else(|| AppError::Custom("Database not initialized".into()))?;
        zen_db::queries::list_documents_page(&pool, limit, offset).await
    }

    pub async fn get_by_id(&self, doc_id: &str) -> AppResult<Document> {
        let pool = self
            .db_pool
            .read()
            .await
            .clone()
            .ok_or_else(|| AppError::Custom("Database not initialized".into()))?;
        zen_db::queries::get_document(&pool, doc_id).await
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
            if let Ok(doc) = zen_db::queries::get_document(&pool, doc_id).await {
                if let Some(ref path) = doc.file_path {
                    let _ = store.delete_by_source(path).await;
                }
            }
        }

        // Remove from SQLite (cascades to document_chunks)
        zen_db::queries::delete_document(&pool, doc_id).await
    }

    // ─── Per-chat attachments (Phase 1) ───
    //
    // Distinct from `ingest`: an attachment is owned by a chat, stored in the
    // blob store under appdata, extracted to plain text once, and retrieved by
    // the agent ON DEMAND via list/read tools — its content is NOT injected
    // into the prompt. No vector embedding (that's the RAG `ingest` path).

    async fn require_pool(&self) -> AppResult<SqlitePool> {
        self.db_pool
            .read()
            .await
            .clone()
            .ok_or_else(|| AppError::Custom("Database not initialized".into()))
    }

    /// Validate, store, extract, and record one chat attachment.
    /// `bytes` are the raw file contents; `filename` is the user display name.
    pub async fn attach_to_chat(
        &self,
        app_data_dir: PathBuf,
        chat_id: String,
        filename: String,
        bytes: Vec<u8>,
    ) -> AppResult<Document> {
        use crate::services::attachment_store as store;

        if bytes.is_empty() {
            return Err(AppError::Custom("Attachment is empty".into()));
        }
        if bytes.len() > store::MAX_ATTACHMENT_BYTES {
            return Err(AppError::Custom(format!(
                "Attachment exceeds the {} MB limit",
                store::MAX_ATTACHMENT_BYTES / (1024 * 1024)
            )));
        }

        let pool = self.require_pool().await?;

        // Per-chat file-count cap.
        let existing = zen_db::queries::count_documents_for_chat(&pool, &chat_id).await?;
        if existing >= store::MAX_ATTACHMENTS_PER_CHAT {
            return Err(AppError::Custom(format!(
                "This chat already has the maximum of {} attachments",
                store::MAX_ATTACHMENTS_PER_CHAT
            )));
        }

        // Magic-byte sniff. `infer` recognizes binary container formats
        // (pdf/docx/xlsx/images); plain text returns None, which we accept.
        // When a signature IS detected it must be an allowed type, and it must
        // agree with the extension — reject a .txt that is really a zip, etc.
        let ext = std::path::Path::new(&filename)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        if let Some(kind) = infer::get(&bytes) {
            let sniffed = kind.extension();
            if !Self::is_allowed_sniffed(sniffed) {
                return Err(AppError::Custom(format!(
                    "Unsupported file type '{sniffed}' (detected from contents)"
                )));
            }
            if !Self::extension_matches_sniff(&ext, sniffed) {
                return Err(AppError::Custom(format!(
                    "File contents ('{sniffed}') do not match the '.{ext}' extension"
                )));
            }
        } else if !Self::is_allowed_text_ext(&ext) {
            // No magic signature and not a known text extension → reject
            // rather than sending mojibake to the model.
            return Err(AppError::Custom(format!(
                "Unsupported or unrecognized file type '.{ext}'"
            )));
        }

        let doc_id = Uuid::new_v4().to_string();
        let mime_type = {
            let p = PathBuf::from(&filename);
            Self::guess_mime_type(&p)
        };
        let doc_type = {
            let p = PathBuf::from(&filename);
            Self::guess_doc_type(&p)
        };

        // Persist original bytes first (so a preview exists even if extraction
        // is thin), then extract text from the stored blob.
        let stored = store::store_attachment(
            &app_data_dir,
            &chat_id,
            &doc_id,
            &filename,
            &bytes,
            "",
        )
        .await
        .map_err(AppError::Custom)?;

        let extracted = match self.ingestion_engine.extract_text(&stored.blob_path).await {
            Ok(text) => text,
            Err(e) => {
                // Roll back the stored bytes so we don't orphan a blob.
                store::delete_attachment_files(&stored.blob_path, &stored.text_path).await;
                return Err(AppError::Custom(format!(
                    "Could not extract text from '{filename}': {e}"
                )));
            }
        };

        // Re-write the extracted sidecar now that we have the text.
        if let Err(e) = tokio::fs::write(&stored.text_path, extracted.as_bytes()).await {
            store::delete_attachment_files(&stored.blob_path, &stored.text_path).await;
            return Err(AppError::Custom(format!(
                "Failed to persist extracted text: {e}"
            )));
        }

        let token_estimate = crate::agent::runner::helpers::estimate_tokens(&extracted) as i64;

        // Metadata cards: sheet names for spreadsheets (cheap re-open, no cell
        // scan); page_count is left for the frontend/PDF path in a later phase.
        let sheet_names: Option<String> = if matches!(ext.as_str(), "xls" | "xlsx" | "xlsb" | "ods")
        {
            tokio::task::spawn_blocking({
                let p = stored.blob_path.clone();
                move || zen_rag::office_extract::spreadsheet_sheet_names(&p)
            })
            .await
            .ok()
            .and_then(|r| r.ok())
            .filter(|names| !names.is_empty())
            .and_then(|names| serde_json::to_string(&names).ok())
        } else {
            None
        };

        let doc = zen_db::queries::add_chat_attachment(
            &pool,
            &zen_db::queries::NewChatAttachment {
                id: &doc_id,
                chat_id: &chat_id,
                filename: &filename,
                // file_path points at the ORIGINAL blob; read tool uses the
                // extracted sidecar via content_hash lookup, preview uses this.
                file_path: &stored.blob_path.to_string_lossy(),
                file_size: stored.size,
                doc_type,
                mime_type: &mime_type,
                content_hash: &stored.content_hash,
                token_estimate,
                page_count: None,
                sheet_names: sheet_names.as_deref(),
            },
        )
        .await?;

        Ok(doc)
    }

    /// Allowed types when detected by magic bytes.
    fn is_allowed_sniffed(sniffed: &str) -> bool {
        matches!(
            sniffed,
            "pdf" | "docx" | "xlsx" | "pptx" | "odt" | "ods" | "odp" | "epub"
                | "png" | "jpg" | "webp" | "gif" | "bmp" | "tif"
        )
    }

    /// Text/code extensions that legitimately have no magic signature.
    fn is_allowed_text_ext(ext: &str) -> bool {
        matches!(
            ext,
            "txt" | "md" | "csv" | "json" | "html" | "css" | "xml" | "yaml" | "yml" | "toml"
                | "rs" | "js" | "ts" | "tsx" | "jsx" | "py" | "go" | "c" | "cpp" | "h" | "rst"
                | "org" | "adoc" | "log"
        )
    }

    /// Whether a claimed extension is consistent with the sniffed type. OOXML
    /// (docx/xlsx/pptx) and ODF and epub are all ZIP containers, so `infer`
    /// may report the specific subtype or fall back to a sibling — accept any
    /// ZIP-family document extension for a ZIP-family sniff.
    fn extension_matches_sniff(ext: &str, sniffed: &str) -> bool {
        let zip_family = ["docx", "xlsx", "pptx", "odt", "ods", "odp", "epub", "zip"];
        if zip_family.contains(&sniffed) && zip_family.contains(&ext) {
            return true;
        }
        match sniffed {
            "jpg" => matches!(ext, "jpg" | "jpeg"),
            "tif" => matches!(ext, "tif" | "tiff"),
            other => ext == other,
        }
    }

    /// List one chat's attachments (metadata only).
    pub async fn list_for_chat(&self, chat_id: &str) -> AppResult<Vec<Document>> {
        let pool = self.require_pool().await?;
        zen_db::queries::list_documents_for_chat(&pool, chat_id).await
    }

    /// Delete one chat attachment: remove the DB row and its blob + sidecar.
    pub async fn delete_chat_attachment(
        &self,
        app_data_dir: &std::path::Path,
        doc_id: &str,
    ) -> AppResult<()> {
        use crate::services::attachment_store as store;
        let pool = self.require_pool().await?;
        let doc = zen_db::queries::get_document(&pool, doc_id).await?;
        zen_db::queries::delete_document(&pool, doc_id).await?;
        // Blob path is stored in file_path; the extracted sidecar sits next to
        // it under `<doc_id>.extracted.txt`.
        if let Some(blob) = doc.file_path.as_deref() {
            let blob_path = std::path::PathBuf::from(blob);
            let text_path = blob_path
                .parent()
                .map(|d| d.join(format!("{doc_id}.extracted.txt")))
                .unwrap_or_else(|| {
                    store::attachments_root(app_data_dir)
                        .join(format!("{doc_id}.extracted.txt"))
                });
            store::delete_attachment_files(&blob_path, &text_path).await;
        }
        Ok(())
    }

    /// GC every stored file for a deleted chat, after its rows are gone.
    pub async fn purge_chat_attachments(
        &self,
        app_data_dir: &std::path::Path,
        chat_id: &str,
    ) -> AppResult<()> {
        crate::services::attachment_store::delete_chat_attachments(app_data_dir, chat_id)
            .await
            .map_err(AppError::Custom)
    }

    /// Read the extracted text sidecar for one attachment, capped so a giant
    /// spreadsheet can't blow up the IPC payload / the preview pane. The full
    /// text stays on disk for the agent's read tool; this is a preview.
    pub async fn read_chat_attachment_text(&self, doc_id: &str) -> AppResult<String> {
        const PREVIEW_CAP: usize = 256 * 1024;
        let pool = self.require_pool().await?;
        let doc = zen_db::queries::get_document(&pool, doc_id).await?;
        let blob = doc
            .file_path
            .as_deref()
            .ok_or_else(|| AppError::Custom("Attachment has no stored file".into()))?;
        let text_path = std::path::PathBuf::from(blob)
            .parent()
            .map(|d| d.join(format!("{doc_id}.extracted.txt")))
            .ok_or_else(|| AppError::Custom("Could not resolve extracted sidecar".into()))?;
        let text = tokio::fs::read_to_string(&text_path)
            .await
            .map_err(|e| AppError::Custom(format!("Could not read extracted text: {e}")))?;
        if text.len() > PREVIEW_CAP {
            let cut = crate::tools::fs_tools::truncate_utf8(&text, PREVIEW_CAP);
            Ok(format!("{cut}\n\n… preview truncated ({} bytes total)", text.len()))
        } else {
            Ok(text)
        }
    }
}

impl Default for DocumentService {
    fn default() -> Self {
        Self::new()
    }
}
