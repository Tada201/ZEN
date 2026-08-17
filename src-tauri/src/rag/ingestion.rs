use anyhow::{Context, Result};
use std::fs::File;
use std::io::Read;
use std::path::Path;
use text_splitter::{ChunkConfig, TextSplitter};
use tiktoken_rs::cl100k_base;
use tokio::process::Command;

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

struct ExtractedText {
    text: String,
    extractor: &'static str,
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

    /// Read file content and extract text based on extension.
    pub async fn extract_text(&self, path: &Path) -> Result<String> {
        Ok(self.extract(path).await?.text)
    }

    async fn extract(&self, path: &Path) -> Result<ExtractedText> {
        let extension = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_lowercase();

        match extension.as_str() {
            "pdf" => match self.extract_pdf(path).await {
                Ok(text) => Ok(text),
                Err(pdf_error) => self
                    .extract_with_markitdown(path)
                    .await
                    .with_context(|| format!("{}; MarkItDown fallback also failed", pdf_error)),
            },
            "txt" | "md" | "csv" | "json" | "rs" | "js" | "ts" | "py" | "html" | "css" => {
                self.extract_plaintext(path).await
            }
            // Spreadsheets: native calamine (pure Rust, MSI-safe).
            "xls" | "xlsx" | "xlsb" | "ods" => self.extract_spreadsheet(path).await,
            // Word/PowerPoint OOXML: native zip + quick-xml.
            "docx" | "pptx" => self.extract_ooxml(path).await,
            // Legacy binary / other office formats have no native reader yet —
            // fall back to markitdown only if the optional binary is present.
            "doc" | "ppt" | "rtf" | "odt" | "odp" | "epub" | "xml" | "yaml" | "yml" | "toml" => {
                self.extract_with_markitdown(path).await
            }
            "png" | "jpg" | "jpeg" | "webp" | "tif" | "tiff" | "bmp" => {
                self.extract_image_ocr(path).await
            }
            _ => Err(anyhow::anyhow!("Unsupported file extension: {}", extension)),
        }
    }

    async fn extract_plaintext(&self, path: &Path) -> Result<ExtractedText> {
        let mut file = File::open(path)?;
        let mut text = String::new();
        file.read_to_string(&mut text)?;
        Ok(ExtractedText {
            text,
            extractor: "plaintext",
        })
    }

    /// Native spreadsheet extraction via calamine (sync → spawn_blocking).
    async fn extract_spreadsheet(&self, path: &Path) -> Result<ExtractedText> {
        let path_buf = path.to_path_buf();
        let (text, _sheets) = tokio::task::spawn_blocking(move || {
            crate::rag::office_extract::extract_spreadsheet(&path_buf)
        })
        .await
        .context("spreadsheet extraction task failed")??;
        Ok(ExtractedText {
            text,
            extractor: "calamine",
        })
    }

    /// Native docx/pptx extraction via zip + quick-xml (sync → spawn_blocking).
    async fn extract_ooxml(&self, path: &Path) -> Result<ExtractedText> {
        let path_buf = path.to_path_buf();
        let text =
            tokio::task::spawn_blocking(move || crate::rag::office_extract::extract_ooxml(&path_buf))
                .await
                .context("OOXML extraction task failed")??;
        Ok(ExtractedText {
            text,
            extractor: "ooxml",
        })
    }

    async fn extract_pdf(&self, path: &Path) -> Result<ExtractedText> {
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

        Ok(ExtractedText {
            text,
            extractor: "pdf_inspector",
        })
    }

    async fn extract_with_markitdown(&self, path: &Path) -> Result<ExtractedText> {
        let bin = std::env::var("ZEN_MARKITDOWN_BIN").unwrap_or_else(|_| "markitdown".to_string());
        let output = Command::new(&bin)
            .arg(path)
            .output()
            .await
            .with_context(|| {
                format!(
                    "Failed to run MarkItDown extractor '{}'. Install with: pip install 'markitdown[all]' or set ZEN_MARKITDOWN_BIN.",
                    bin
                )
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!(
                "MarkItDown extractor failed for '{}': {}",
                path.display(),
                stderr.trim()
            );
        }

        let text = String::from_utf8(output.stdout).context("MarkItDown output was not UTF-8")?;
        if text.trim().is_empty() {
            anyhow::bail!("MarkItDown extracted no text from '{}'", path.display());
        }

        Ok(ExtractedText {
            text,
            extractor: "markitdown",
        })
    }

    async fn extract_image_ocr(&self, path: &Path) -> Result<ExtractedText> {
        let bin = std::env::var("ZEN_TESSERACT_BIN").unwrap_or_else(|_| "tesseract".to_string());
        let lang = std::env::var("ZEN_TESSERACT_LANG").unwrap_or_else(|_| "eng".to_string());
        let output = Command::new(&bin)
            .arg(path)
            .arg("stdout")
            .arg("-l")
            .arg(&lang)
            .arg("--psm")
            .arg("3")
            .output()
            .await
            .with_context(|| {
                format!(
                    "Failed to run Tesseract OCR '{}'. Install Tesseract or set ZEN_TESSERACT_BIN.",
                    bin
                )
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!(
                "Tesseract OCR failed for '{}': {}",
                path.display(),
                stderr.trim()
            );
        }

        let text = String::from_utf8(output.stdout).context("Tesseract output was not UTF-8")?;
        if text.trim().is_empty() {
            anyhow::bail!("Tesseract OCR extracted no text from '{}'", path.display());
        }

        Ok(ExtractedText {
            text,
            extractor: "tesseract",
        })
    }

    /// Split extracted text into semantic chunks for vector embeddings
    pub fn chunk_text(&self, source_path: &str, text: &str) -> Result<Vec<DocumentChunk>> {
        self.chunk_text_with_extractor(source_path, text, "unknown")
    }

    fn chunk_text_with_extractor(
        &self,
        source_path: &str,
        text: &str,
        extractor: &str,
    ) -> Result<Vec<DocumentChunk>> {
        // Use tiktoken tokenizer for accurate token counting
        let _tokenizer = cl100k_base()?;

        let chunk_config = ChunkConfig::new(self.config.max_tokens)
            .with_overlap(self.config.overlap_tokens)
            .context("Failed to configure chunk overlap")?;

        let splitter = TextSplitter::new(chunk_config);

        let chunks: Vec<DocumentChunk> = splitter
            .chunks(text)
            .enumerate()
            .map(|(i, chunk_text)| DocumentChunk {
                id: format!("{}-chunk-{}", source_path, i),
                source: source_path.to_string(),
                text: chunk_text.to_string(),
                metadata: serde_json::json!({
                    "chunk_index": i,
                    "file_type": source_path.split('.').next_back().unwrap_or_default(),
                    "extractor": extractor,
                })
                .to_string(),
            })
            .collect();

        Ok(chunks)
    }

    /// Pipeline: Read -> Extract -> Chunk
    pub async fn process_file(&self, path: &Path) -> Result<Vec<DocumentChunk>> {
        let extracted = self.extract(path).await?;
        let source_name = path.to_string_lossy().to_string();
        self.chunk_text_with_extractor(&source_name, &extracted.text, extracted.extractor)
    }
}
