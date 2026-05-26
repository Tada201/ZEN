use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::agent::tools::AgentTool;

pub(super) struct VectorSearchStandalone;

impl VectorSearchStandalone {
    pub(super) fn new_standalone() -> Self {
        Self
    }
}

#[async_trait]
impl AgentTool for VectorSearchStandalone {
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
        let query = input["query"]
            .as_str()
            .ok_or_else(|| anyhow!("query is required"))?;
        let limit = input
            .get("limit")
            .and_then(|v| v.as_u64())
            .unwrap_or(5)
            .clamp(1, 20) as usize;

        let state = app.state::<crate::commands::AppState>();
        let db = state
            .db()
            .await
            .map_err(|_| anyhow::anyhow!("DB Init error"))?;

        let model_name = crate::db::queries::get_setting(&db, "embedding_model")
            .await
            .unwrap_or_default()
            .unwrap_or_else(|| "nomic-embed-text".to_string());

        let embedding_provider = crate::db::queries::get_setting(&db, "embedding_provider")
            .await
            .unwrap_or_default()
            .unwrap_or_else(|| "ollama".to_string());

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

        let query_vec = generate_embedding(&base_url, &model_name, query)
            .await
            .map_err(|e| anyhow!("Embedding failed: {}", e))?;

        let rag = state
            .rag
            .get()
            .await
            .map_err(|_| anyhow!("RAG not initialized"))?;
        let results = rag
            .search(query_vec, limit)
            .await
            .map_err(|e| anyhow!("Vector search failed: {}", e))?;

        if results.is_empty() {
            return Ok(json!(format!(
                "No relevant information found for query: '{}'",
                query
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

async fn generate_embedding(base_url: &str, model: &str, text: &str) -> Result<Vec<f32>> {
    let client = reqwest::Client::new();
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
