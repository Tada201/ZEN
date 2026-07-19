//! Semantic vector search over the RAG knowledge base.

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::json;
use tauri::{AppHandle, Manager};

use crate::commands::AppState;
use crate::tools::permission::RiskLevel;
use crate::tools::{Tool, ToolError, ToolOutput};

pub struct VectorSearchTool;

#[derive(Deserialize)]
struct VectorSearchArgs {
    query: String,
    limit: Option<usize>,
}

#[async_trait]
impl Tool for VectorSearchTool {
    fn name(&self) -> &str {
        "vector_search"
    }

    fn description(&self) -> &str {
        "Performs a semantic vector search over all ingested documents in the local knowledge base. Use this to find information relevant to a semantic query."
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The semantic search query"
                },
                "limit": {
                    "type": "integer",
                    "description": "Number of results to return (default: 5)"
                }
            },
            "required": ["query"]
        })
    }

    fn risk_level(&self) -> RiskLevel {
        RiskLevel::Low
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    async fn execute(
        &self,
        app: AppHandle,
        _chat_id: String,
        args: serde_json::Value,
    ) -> Result<ToolOutput, ToolError> {
        let parsed_args: VectorSearchArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArguments {
                details: format!("Invalid arguments: {}", e),
            })?;

        let state = app.state::<AppState>();

        let pool = state.db().await.map_err(|e| ToolError::ExecutionFailed {
            message: format!("DB error: {}", e),
        })?;
        let model_name = crate::db::queries::get_setting(&pool, "embedding_model")
            .await
            .unwrap_or_default()
            .unwrap_or_else(|| "nomic-embed-text".to_string());

        let provider = state
            .provider()
            .await
            .map_err(|e| ToolError::ExecutionFailed {
                message: format!("LLM not initialized: {}", e),
            })?;
        let query_vec = provider
            .embed(&model_name, &parsed_args.query)
            .await
            .map_err(|e| ToolError::ExecutionFailed {
                message: format!("Embedding failed: {}", e),
            })?;

        let limit = parsed_args.limit.unwrap_or(5).clamp(1, 20);
        let results =
            state
                .search_rag(query_vec, limit)
                .await
                .map_err(|e| ToolError::ExecutionFailed {
                    message: format!("Vector search failed: {}", e),
                })?;

        if results.is_empty() {
            return Ok(ToolOutput {
                content: json!({"status": "no results found for query"}),
                metadata: None,
            });
        }

        let mut formatted_results = Vec::new();
        for res in results {
            formatted_results.push(json!({
                "source": res.chunk.source,
                "text": res.chunk.text,
                "score": res.score,
            }));
        }

        Ok(ToolOutput {
            content: json!({"results": formatted_results}),
            metadata: None,
        })
    }
}
