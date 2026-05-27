use crate::agent::tools::AgentTool;
use crate::commands::AppState;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

pub struct VectorSearchTool;

#[derive(Debug, Deserialize)]
struct SearchArgs {
    query: String,
    limit: Option<usize>,
}

#[async_trait]
impl AgentTool for VectorSearchTool {
    fn id(&self) -> &str {
        "vector_search"
    }

    fn description(&self) -> &str {
        "Performs a semantic vector search over all ingested documents in the local knowledge base. \
         Use this to find specific information or answer questions based on the user's private data."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": { "type": "string", "description": "The semantic search query" },
                "limit": { "type": "integer", "description": "Number of results to return (default: 5, max: 20)" }
            },
            "required": ["query"]
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        _chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<
            std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>,
        >,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let args: SearchArgs = serde_json::from_value(input)
            .map_err(|e| anyhow!("Invalid search arguments: {}", e))?;

        let state = app.state::<AppState>();
        let db = state
            .db()
            .await
            .map_err(|_| anyhow::anyhow!("DB Init error"))?;

        // Get embedding model name and provider from settings
        let model_name = crate::db::queries::get_setting(&db, "embedding_model")
            .await
            .unwrap_or_default()
            .unwrap_or_else(|| "nomic-embed-text".to_string());

        let embedding_provider = crate::db::queries::get_setting(&db, "embedding_provider")
            .await
            .unwrap_or_default()
            .unwrap_or_else(|| "ollama".to_string());

        // Get the appropriate base URL based on embedding provider
        let base_url = if embedding_provider == "lmstudio" {
            crate::db::queries::get_setting(&db, "lmstudio_base_url")
                .await
                .unwrap_or_default()
                .unwrap_or_else(|| "http://localhost:1234".to_string())
        } else {
            crate::db::queries::get_setting(&db, "ollama_base_url")
                .await
                .unwrap_or_default()
                .unwrap_or_else(|| "http://localhost:11434".to_string())
        };

        // Generate embedding using the configured provider's endpoint
        let query_vec = generate_embedding(&base_url, &model_name, &args.query)
            .await
            .map_err(|e| anyhow!("Embedding failed: {}", e))?;

        let limit = args.limit.unwrap_or(5).clamp(1, 20);
        let results = state
            .search_rag(query_vec, limit)
            .await
            .map_err(|e| anyhow!("Vector search failed: {}", e))?;

        if results.is_empty() {
            return Ok(json!(format!(
                "No relevant information found for query: '{}'",
                args.query
            )));
        }

        let mut formatted_text = format!("Found {} relevant excerpts:\n\n", results.len());
        for (i, res) in results.iter().enumerate() {
            formatted_text.push_str(&format!(
                "Excerpt {} (Source: {}):\n{}\n\n",
                i + 1,
                res.chunk.source,
                res.chunk.text
            ));
        }

        Ok(json!(formatted_text))
    }
}

/// Generate embedding using Ollama or LM Studio API
/// Both use the same /api/embeddings endpoint format
async fn generate_embedding(base_url: &str, model: &str, text: &str) -> Result<Vec<f32>> {
    let client = crate::utils::default_http_client();

    // Try Ollama-style endpoint first
    let url = format!("{}/api/embeddings", base_url);

    let response = client
        .post(&url)
        .json(&serde_json::json!({
            "model": model,
            "prompt": text,
        }))
        .send()
        .await
        .map_err(|e| {
            anyhow!(
                "Failed to connect to embedding service at {}: {}",
                base_url,
                e
            )
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let error = response.text().await.unwrap_or_default();
        anyhow::bail!("Embedding API error ({}): {}", status, error);
    }

    #[derive(serde::Deserialize)]
    struct EmbeddingResponse {
        embedding: Vec<f32>,
    }

    let result: EmbeddingResponse = response
        .json()
        .await
        .map_err(|e| anyhow!("Failed to parse embedding response: {}", e))?;

    Ok(result.embedding)
}
