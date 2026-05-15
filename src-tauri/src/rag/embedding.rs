/// Local Embedding Model Wrapper (Privacy-First)
///
/// This module provides local embedding generation for RAG workflows.
/// Supports multiple backends:
/// - **Ollama**: Uses local Ollama instance with nomic-embed-text or mxbai-embed-large
/// - **Candle**: Pure Rust inference with HF models (all-MiniLM-L6-v2)
///
/// **Privacy Guarantee:** Embeddings are ALWAYS generated locally.
/// No data is ever sent to cloud APIs (OpenAI, Anthropic, etc.)

use anyhow::{Result, Context};
use serde::{Deserialize, Serialize};

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
        self.config.ollama_url.as_deref().unwrap_or("http://localhost:11434")
    }
}

#[async_trait::async_trait]
impl EmbeddingModel for OllamaEmbedding {
    async fn encode(&self, text: &str) -> Result<Vec<f32>> {
        let url = format!("{}/api/embeddings", self.ollama_url());
        
        let response = self.client
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

/// Candle embedding backend (pure Rust, offline)
pub struct CandleEmbedding {
    config: EmbeddingConfig,
    // Note: Full Candle implementation would include:
    // - Model loading (onnx or safetensors)
    // - Tokenizer
    // - Inference session
    // This is a placeholder - full implementation requires significant code
}

impl CandleEmbedding {
    pub fn new(config: EmbeddingConfig) -> Result<Self> {
        // Validate model path
        let model_path = config.model_path.as_ref()
            .context("Candle backend requires model_path")?;
        
        if !std::path::Path::new(model_path).exists() {
            anyhow::bail!("Model path does not exist: {}", model_path);
        }
        
        Ok(Self { config })
    }
    
    /// Create with default MiniLM model (downloads if needed)
    pub fn with_default_model() -> Result<Self> {
        // Default: all-MiniLM-L6-v2 (384 dimensions)
        let _config = EmbeddingConfig {
            backend: EmbeddingBackend::Candle,
            model: "all-MiniLM-L6-v2".to_string(),
            dimensions: 384,
            ollama_url: None,
            model_path: None, // Would need to download/load
        };
        
        // Note: Full implementation would download/load model here
        // For now, this is a placeholder
        anyhow::bail!("Candle backend not fully implemented - use Ollama backend instead")
    }
}

#[async_trait::async_trait]
impl EmbeddingModel for CandleEmbedding {
    async fn encode(&self, _text: &str) -> Result<Vec<f32>> {
        // Placeholder - full implementation would:
        // 1. Tokenize input
        // 2. Run through transformer model
        // 3. Extract [CLS] token embedding
        // 4. Normalize vector
        
        anyhow::bail!("Candle embedding not implemented - use Ollama backend")
    }
    
    async fn encode_batch(&self, _texts: &[&str]) -> Result<Vec<Vec<f32>>> {
        anyhow::bail!("Candle embedding not implemented - use Ollama backend")
    }
    
    fn dimensions(&self) -> usize {
        self.config.dimensions
    }
}

/// Factory function to create embedding model from config
pub async fn create_embedding_model(config: &EmbeddingConfig) -> Result<Box<dyn EmbeddingModel>> {
    match config.backend {
        EmbeddingBackend::Ollama => {
            let model = OllamaEmbedding::new(config.clone());
            
            // Health check
            if !model.health_check().await {
                tracing::warn!("Ollama health check failed - ensure Ollama is running with '{}' model", config.model);
            } else {
                tracing::info!("Ollama embedding backend ready (model: {}, dimensions: {})", 
                    config.model, config.dimensions);
            }
            
            Ok(Box::new(model))
        }
        EmbeddingBackend::Candle => {
            let model = CandleEmbedding::new(config.clone())?;
            Ok(Box::new(model))
        }
    }
}

/// Convenience function: create default Ollama embedding model
pub async fn create_default_ollama_embedding() -> Result<Box<dyn EmbeddingModel>> {
    let config = EmbeddingConfig::default();
    create_embedding_model(&config).await
}

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
}
