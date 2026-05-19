use std::fs::File;
use std::io::Read;
use std::path::Path;
use anyhow::{Result, Context};
use text_splitter::{TextSplitter, ChunkConfig};
use tiktoken_rs::cl100k_base;

use super::DocumentChunk;

/// Configuration for document chunking
pub struct IngestionConfig {
    pub max_tokens: usize,
    pub overlap_tokens: usize,
}

impl Default for IngestionConfig {
    fn default() -> Self {
        Self {
            max_tokens: 512,
            overlap_tokens: 50,
        }
    }
}

pub struct IngestionEngine {
    config: IngestionConfig,
}

impl Default for IngestionEngine {
    fn default() -> Self {
        Self::new(IngestionConfig::default())
    }
}

impl IngestionEngine {
    pub fn new(config: IngestionConfig) -> Self {
        Self { config }
    }

    /// Read file content and extract text based on extension extension
    pub async fn extract_text(&self, path: &Path) -> Result<String> {
        let extension = path.extension()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_lowercase();

        match extension.as_str() {
            "pdf" => self.extract_pdf(path).await,
            "txt" | "md" | "csv" | "json" | "rs" | "js" | "ts" | "py" | "html" | "css" => {
                self.extract_plaintext(path).await
            }
            _ => Err(anyhow::anyhow!("Unsupported file extension: {}", extension)),
        }
    }

    async fn extract_plaintext(&self, path: &Path) -> Result<String> {
        let mut file = File::open(path)?;
        let mut text = String::new();
        file.read_to_string(&mut text)?;
        Ok(text)
    }

    async fn extract_pdf(&self, path: &Path) -> Result<String> {
        let path_buf = path.to_path_buf();
        let text = tokio::task::spawn_blocking(move || -> Result<String> {
            let result = pdf_inspector::process_pdf(&path_buf)
                .map_err(|e| anyhow::anyhow!("PDF extraction failed: {}", e))?;

            // Prefer markdown output (preserves structure, handles Identity-H/CMap encodings)
            if let Some(md) = result.markdown {
                if !md.trim().is_empty() {
                    return Ok(md);
                }
            }

            // Fallback to plain text extraction
            let plain = pdf_inspector::extract_text(&path_buf)
                .map_err(|e| anyhow::anyhow!("PDF text extraction failed: {}", e))?;

            if plain.trim().is_empty() {
                Err(anyhow::anyhow!(
                    "PDF appears to be scanned/image-based (type: {:?}). Text extraction returned empty.",
                    result.pdf_type
                ))
            } else {
                Ok(plain)
            }
        })
        .await
        .context("Async blocking task failed")??;
        
        Ok(text)
    }

    /// Split extracted text into semantic chunks for vector embeddings
    pub fn chunk_text(&self, source_path: &str, text: &str) -> Result<Vec<DocumentChunk>> {
        // Use tiktoken tokenizer for accurate token counting
        let _tokenizer = cl100k_base()?;
        
        let chunk_config = ChunkConfig::new(self.config.max_tokens)
            .with_overlap(self.config.overlap_tokens)
            .context("Failed to configure chunk overlap")?;

        let splitter = TextSplitter::new(chunk_config);

        let chunks: Vec<DocumentChunk> = splitter
            .chunks(text)
            .enumerate()
            .map(|(i, chunk_text)| {
                DocumentChunk {
                    id: format!("{}-chunk-{}", source_path, i),
                    source: source_path.to_string(),
                    text: chunk_text.to_string(),
                    metadata: serde_json::json!({
                        "chunk_index": i,
                        "file_type": source_path.split('.').last().unwrap_or_default(),
                    }).to_string(),
                }
            })
            .collect();

        Ok(chunks)
    }

    /// Pipeline: Read -> Extract -> Chunk
    pub async fn process_file(&self, path: &Path) -> Result<Vec<DocumentChunk>> {
        let text = self.extract_text(path).await?;
        let source_name = path.to_string_lossy().to_string();
        self.chunk_text(&source_name, &text)
    }
}
