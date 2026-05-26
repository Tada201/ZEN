/// Local Embedding Model Wrapper (Privacy-First)
///
/// This module provides local embedding generation for RAG workflows.
/// Supports multiple backends:
/// - **Ollama**: Uses local Ollama instance with nomic-embed-text or mxbai-embed-large
/// - **Candle**: Pure Rust inference with HF models (all-MiniLM-L6-v2)
///
/// **Privacy Guarantee:** Embeddings are ALWAYS generated locally.
/// No data is ever sent to cloud APIs (OpenAI, Anthropic, etc.)
use anyhow::{Context, Result};
use candle_core::Tensor;
use candle_transformers::models::bert::{BertModel, Config as BertConfig};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Embedding model configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingConfig {
    /// Backend to use: "ollama" or "candle"
    pub backend: EmbeddingBackend,

    /// Model name/path
    pub model: String,

    /// Embedding dimensions (384 for MiniLM, 768 for nomic-embed-text, 1024 for mxbai)
    pub dimensions: usize,

    /// Ollama base URL (if using ollama backend)
    pub ollama_url: Option<String>,

    /// Model path for candle (if using candle backend)
    pub model_path: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EmbeddingBackend {
    /// Ollama embedding API (http://localhost:11434/api/embeddings)
    Ollama,
    /// Candle Transformers (pure Rust, offline)
    Candle,
}

impl Default for EmbeddingConfig {
    fn default() -> Self {
        Self {
            backend: EmbeddingBackend::Ollama, // Default to Ollama (easier setup)
            model: "nomic-embed-text".to_string(),
            dimensions: 768,
            ollama_url: Some("http://localhost:11434".to_string()),
            model_path: None,
        }
    }
}

/// Embedding model trait
#[async_trait::async_trait]
pub trait EmbeddingModel: Send + Sync {
    /// Generate embedding for a single text
    async fn encode(&self, text: &str) -> Result<Vec<f32>>;

    /// Generate embeddings for multiple texts (batched)
    async fn encode_batch(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>>;

    /// Get embedding dimensions
    fn dimensions(&self) -> usize;
}

/// Ollama embedding backend
pub struct OllamaEmbedding {
    config: EmbeddingConfig,
    client: reqwest::Client,
}

impl OllamaEmbedding {
    pub fn new(config: EmbeddingConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::new(),
        }
    }

    /// Check if Ollama is available and model is loaded
    pub async fn health_check(&self) -> bool {
        let url = format!("{}/api/tags", self.ollama_url());
        match self.client.get(&url).send().await {
            Ok(resp) => resp.status().is_success(),
            Err(_) => false,
        }
    }

    fn ollama_url(&self) -> &str {
        self.config
            .ollama_url
            .as_deref()
            .unwrap_or("http://localhost:11434")
    }
}

#[async_trait::async_trait]
impl EmbeddingModel for OllamaEmbedding {
    async fn encode(&self, text: &str) -> Result<Vec<f32>> {
        let url = format!("{}/api/embeddings", self.ollama_url());

        let response = self
            .client
            .post(&url)
            .json(&serde_json::json!({
                "model": self.config.model,
                "prompt": text,
            }))
            .send()
            .await
            .context("Failed to send embedding request to Ollama")?;

        if !response.status().is_success() {
            let status = response.status();
            let error = response.text().await.unwrap_or_default();
            anyhow::bail!("Ollama embedding API error ({}): {}", status, error);
        }

        let result: OllamaEmbeddingResponse = response.json().await?;
        Ok(result.embedding)
    }

    async fn encode_batch(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>> {
        // Ollama doesn't support batch embeddings, so we do them sequentially
        // (could be optimized with parallel requests if needed)
        let mut embeddings = Vec::with_capacity(texts.len());
        for text in texts {
            let embedding = self.encode(text).await?;
            embeddings.push(embedding);
        }
        Ok(embeddings)
    }

    fn dimensions(&self) -> usize {
        self.config.dimensions
    }
}

#[derive(Debug, Deserialize)]
struct OllamaEmbeddingResponse {
    embedding: Vec<f32>,
}

// ── Candle Embedding Backend ─────────────────────────────────

/// Candle embedding backend (pure Rust, offline)
///
/// Uses the all-MiniLM-L6-v2 model to generate 384-dimension embeddings
/// entirely locally with no external API calls.
///
/// # Model files required
///
/// Place these in the model directory:
/// - `model.safetensors` — BERT weights
/// - `tokenizer.json` — HuggingFace tokenizer
/// - `config.json` — Model configuration
pub struct CandleEmbedding {
    model: BertModel,
    tokenizer: tokenizers::Tokenizer,
    hidden_size: usize,
    device: candle_core::Device,
}

impl CandleEmbedding {
    /// Create a new CandleEmbedding from a config.
    ///
    /// Expects `model_path` to point to a directory containing
    /// `model.safetensors`, `tokenizer.json`, and `config.json`.
    pub fn new(config: EmbeddingConfig) -> Result<Self> {
        let model_path = config
            .model_path
            .as_ref()
            .context("Candle backend requires model_path")?;

        let model_dir = PathBuf::from(model_path);
        if !model_dir.exists() {
            anyhow::bail!(
                "Model directory does not exist: {}. Download all-MiniLM-L6-v2 files into this directory.",
                model_dir.display()
            );
        }

        let weights_path = model_dir.join("model.safetensors");
        if !weights_path.exists() {
            anyhow::bail!(
                "Missing model.safetensors in {}. Download from HuggingFace: sentence-transformers/all-MiniLM-L6-v2",
                model_dir.display()
            );
        }

        let tokenizer_path = model_dir.join("tokenizer.json");
        if !tokenizer_path.exists() {
            anyhow::bail!(
                "Missing tokenizer.json in {}. Download from HuggingFace: sentence-transformers/all-MiniLM-L6-v2",
                model_dir.display()
            );
        }

        // Load tokenizer
        let tokenizer = tokenizers::Tokenizer::from_file(&tokenizer_path)
            .map_err(|e| anyhow::anyhow!("Failed to load tokenizer: {}", e))?;

        // Determine device (CUDA if available, else CPU)
        let device = candle_core::Device::cuda_if_available(0)?;

        // Load model weights
        let weights = candle_core::safetensors::load(&weights_path, &device)
            .context("Failed to load model weights")?;

        // Build VarBuilder from weights
        let vb = candle_nn::VarBuilder::from_tensors(weights, candle_core::DType::F32, &device);

        // Build BERT model
        // Config for all-MiniLM-L6-v2 (384-dim embeddings)
        let bert_config = BertConfig {
            vocab_size: 30522,
            hidden_size: 384,
            num_hidden_layers: 6,
            num_attention_heads: 6,
            intermediate_size: 1536,
            hidden_act: candle_transformers::models::bert::HiddenAct::Gelu,
            hidden_dropout_prob: 0.1,
            max_position_embeddings: 512,
            type_vocab_size: 2,
            initializer_range: 0.02,
            layer_norm_eps: 1e-12,
            pad_token_id: 0,
            position_embedding_type:
                candle_transformers::models::bert::PositionEmbeddingType::Absolute,
            use_cache: true,
            classifier_dropout: None,
            model_type: None,
        };
        let bert = BertModel::load(vb, &bert_config)?;

        let hidden_size = bert_config.hidden_size;

        Ok(Self {
            model: bert,
            tokenizer,
            hidden_size,
            device,
        })
    }

    /// Check whether the model files exist at `model_path` without loading them.
    pub fn check_model_exists(model_path: &str) -> bool {
        let dir = PathBuf::from(model_path);
        dir.exists()
            && dir.join("model.safetensors").exists()
            && dir.join("tokenizer.json").exists()
    }

    /// Tokenize input text, returning token IDs and attention mask.
    fn tokenize(&self, text: &str) -> Result<(candle_core::Tensor, candle_core::Tensor)> {
        let encoding = self
            .tokenizer
            .encode(text, true)
            .map_err(|e| anyhow::anyhow!("Failed to tokenize input: {}", e))?;

        let ids: Vec<u32> = encoding.get_ids().to_vec();
        let attention_mask: Vec<u32> = encoding.get_attention_mask().to_vec();

        let ids_tensor = Tensor::from_slice(&ids, (1, ids.len()), &self.device)?;
        let mask_tensor =
            Tensor::from_slice(&attention_mask, (1, attention_mask.len()), &self.device)?;

        Ok((ids_tensor, mask_tensor))
    }

    /// Extract embedding via mean pooling + normalization.
    fn extract_embedding(
        &self,
        token_embeddings: &candle_core::Tensor,
        attention_mask: &candle_core::Tensor,
    ) -> Result<Vec<f32>> {
        // attention_mask: (1, seq_len) -> (1, seq_len, 1)
        let mask_expanded = attention_mask
            .unsqueeze(2)?
            .to_dtype(candle_core::DType::F32)?;

        // Apply mask: zero out padding token embeddings
        let masked = (token_embeddings * mask_expanded.as_ref())?;

        // Sum over sequence dimension
        let sum_embeddings = masked.sum(1)?;

        // Count number of non-masked tokens per position
        let token_counts = mask_expanded.sum(1)?;

        // Avoid division by zero
        let token_counts =
            token_counts.maximum(&candle_core::Tensor::new(&[1e-9f32], &self.device)?)?;

        // Mean pooling
        let mean_pooled = (sum_embeddings / token_counts.as_ref())?;

        // Squeeze to 1D
        let embedding_1d = mean_pooled.squeeze(0)?;

        // L2 normalize
        let norm = embedding_1d.sqr()?.sum_all()?.sqrt()?;
        let norm_val: f32 = norm.to_scalar()?;
        if norm_val < 1e-9 {
            return Ok(vec![0.0f32; self.hidden_size]);
        }
        let normalized = embedding_1d.broadcast_div(&norm)?;

        // Convert to Vec<f32>
        let result: Vec<f32> = normalized.to_vec1()?;
        Ok(result)
    }
}

#[async_trait::async_trait]
impl EmbeddingModel for CandleEmbedding {
    async fn encode(&self, text: &str) -> Result<Vec<f32>> {
        let (ids, mask) = self.tokenize(text)?;

        // Forward pass through BERT
        let token_embeddings = self.model.forward(&ids, &mask, None)?;

        // token_embeddings is (1, seq_len, hidden_size)
        let embedding = self.extract_embedding(&token_embeddings, &mask)?;
        Ok(embedding)
    }

    async fn encode_batch(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>> {
        // Process one at a time for simplicity (no padding/masking across batch)
        let mut embeddings = Vec::with_capacity(texts.len());
        for text in texts {
            let embedding = self.encode(text).await?;
            embeddings.push(embedding);
        }
        Ok(embeddings)
    }

    fn dimensions(&self) -> usize {
        self.hidden_size
    }
}

// ── Factory Functions ────────────────────────────────────────

/// Factory function to create embedding model from config
pub async fn create_embedding_model(config: &EmbeddingConfig) -> Result<Box<dyn EmbeddingModel>> {
    match config.backend {
        EmbeddingBackend::Ollama => {
            let model = OllamaEmbedding::new(config.clone());

            // Health check
            if !model.health_check().await {
                tracing::warn!(
                    "Ollama health check failed — ensure Ollama is running with '{}' model",
                    config.model
                );
            } else {
                tracing::info!(
                    "Ollama embedding backend ready (model: {}, dimensions: {})",
                    config.model,
                    config.dimensions
                );
            }

            Ok(Box::new(model))
        }
        EmbeddingBackend::Candle => {
            let model = CandleEmbedding::new(config.clone())?;
            tracing::info!(
                "Candle embedding backend ready (model: {}, dimensions: {})",
                config.model,
                model.dimensions()
            );
            Ok(Box::new(model))
        }
    }
}

/// Convenience function: create default Ollama embedding model
pub async fn create_default_ollama_embedding() -> Result<Box<dyn EmbeddingModel>> {
    let config = EmbeddingConfig::default();
    create_embedding_model(&config).await
}

// ── Utils ────────────────────────────────────────────────────

/// Compute cosine similarity between two vectors
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }

    let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }

    dot_product / (norm_a * norm_b)
}

/// Normalize a vector to unit length
pub fn normalize_vector(vector: &[f32]) -> Vec<f32> {
    let norm: f32 = vector.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm == 0.0 {
        return vector.to_vec();
    }
    vector.iter().map(|x| x / norm).collect()
}

/// Default model cache directory
pub fn default_model_cache_dir() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("zen").join("models").join("all-MiniLM-L6-v2")
}

/// Download all-MiniLM-L6-v2 model files from HuggingFace.
///
/// Returns the path to the model directory.
pub async fn download_default_model(cache_dir: Option<PathBuf>) -> Result<PathBuf> {
    let dir = cache_dir.unwrap_or_else(default_model_cache_dir);
    std::fs::create_dir_all(&dir).context("Failed to create model cache directory")?;

    let files = [
        ("https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/model.safetensors", "model.safetensors"),
        ("https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/tokenizer.json", "tokenizer.json"),
        ("https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/config.json", "config.json"),
    ];

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .context("Failed to create HTTP client")?;

    for (url, filename) in &files {
        let path = dir.join(filename);
        if path.exists() {
            tracing::info!("{} already exists, skipping download", filename);
            continue;
        }

        tracing::info!("Downloading {} ...", filename);
        let response = client
            .get(*url)
            .send()
            .await
            .context(format!("Failed to download {}", filename))?;

        if !response.status().is_success() {
            anyhow::bail!(
                "Failed to download {} (HTTP {})",
                filename,
                response.status()
            );
        }

        let bytes = response
            .bytes()
            .await
            .context(format!("Failed to read response for {}", filename))?;

        tokio::fs::write(&path, &bytes)
            .await
            .context(format!("Failed to write {}", filename))?;

        tracing::info!("Downloaded {} ({} bytes)", filename, bytes.len());
    }

    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity() {
        // Identical vectors = 1.0
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];
        assert!((cosine_similarity(&a, &b) - 1.0).abs() < 0.001);

        // Orthogonal vectors = 0.0
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![0.0, 1.0, 0.0];
        assert!((cosine_similarity(&a, &b) - 0.0).abs() < 0.001);

        // Opposite vectors = -1.0
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![-1.0, 0.0, 0.0];
        assert!((cosine_similarity(&a, &b) - (-1.0)).abs() < 0.001);
    }

    #[test]
    fn test_normalize_vector() {
        let v = vec![3.0, 4.0];
        let normalized = normalize_vector(&v);
        let norm: f32 = normalized.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_default_model_cache_dir() {
        let dir = default_model_cache_dir();
        assert!(dir.to_string_lossy().contains("all-MiniLM-L6-v2"));
    }
}
