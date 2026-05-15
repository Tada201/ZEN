use async_trait::async_trait;
use serde_json::json;
use tauri::{AppHandle, Manager};
use serde::Deserialize;

use crate::commands::AppState;
use super::{permission::RiskLevel, Tool, ToolError, ToolOutput};

// ─── 1. VectorSearchTool ───
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

    async fn execute(
        &self,
        app: AppHandle,
        _chat_id: String,
        args: serde_json::Value,
    ) -> Result<ToolOutput, ToolError> {
        let parsed_args: VectorSearchArgs = serde_json::from_value(args)
            .map_err(|e| ToolError::InvalidArguments { details: format!("Invalid arguments: {}", e) })?;

        let state = app.state::<AppState>();
        
        let pool = state.db().await.map_err(|e| ToolError::ExecutionFailed { message: format!("DB error: {}", e) })?;
        let model_name = crate::db::queries::get_setting(&pool, "embedding_model")
            .await
            .unwrap_or_default()
            .unwrap_or_else(|| "nomic-embed-text".to_string());

        let llm_lock = state.llm.read().await;
        let llm = llm_lock.as_deref().ok_or_else(|| ToolError::ExecutionFailed { message: "LLM not initialized".into() })?;
        let query_vec = llm.embed(&model_name, &parsed_args.query).await
            .map_err(|e| ToolError::ExecutionFailed { message: format!("Embedding failed: {}", e) })?;

        let limit = parsed_args.limit.unwrap_or(5).clamp(1, 20);
        let rag_lock = state.rag.read().await;
        let rag = rag_lock.as_deref().ok_or_else(|| ToolError::ExecutionFailed { message: "RAG not initialized".into() })?;
        let results = rag.search(query_vec, limit).await
            .map_err(|e| ToolError::ExecutionFailed { message: format!("Vector search failed: {}", e) })?;

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

// ─── 2. ListDocumentsTool ───
pub struct ListDocumentsTool;

#[async_trait]
impl Tool for ListDocumentsTool {
    fn name(&self) -> &str {
        "list_documents"
    }

    fn description(&self) -> &str {
        "Lists all documents currently ingested and available in the local knowledge base."
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {},
            "required": []
        })
    }

    fn risk_level(&self) -> RiskLevel {
        RiskLevel::Low
    }

    async fn execute(
        &self,
        app: AppHandle,
        _chat_id: String,
        _args: serde_json::Value,
    ) -> Result<ToolOutput, ToolError> {
        let state = app.state::<AppState>();
        let pool = state.db().await.map_err(|e| ToolError::ExecutionFailed { message: format!("DB error: {}", e) })?;
        let docs = crate::db::queries::list_documents(&pool).await
            .map_err(|e| ToolError::ExecutionFailed { message: format!("Failed to list docs: {}", e) })?;

        let mut formatted_docs = Vec::new();
        for doc in docs {
            formatted_docs.push(json!({
                "id": doc.id,
                "file_name": doc.filename,
                "file_path": doc.file_path,
                "status": doc.status,
            }));
        }

        Ok(ToolOutput {
            content: json!({"documents": formatted_docs}),
            metadata: None,
        })
    }
}

// ─── 3. ReadDocumentTool ───
pub struct ReadDocumentTool;

#[derive(Deserialize)]
struct ReadDocumentArgs {
    file_path: String,
}

#[async_trait]
impl Tool for ReadDocumentTool {
    fn name(&self) -> &str {
        "read_document_content"
    }

    fn description(&self) -> &str {
        "Reads the raw text content of a specific file. Provide an absolute path, a relative path, or just the filename."
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to the file or just the filename"
                }
            },
            "required": ["file_path"]
        })
    }

    fn risk_level(&self) -> RiskLevel {
        RiskLevel::Medium
    }

    async fn execute(
        &self,
        app: AppHandle,
        _chat_id: String,
        args: serde_json::Value,
    ) -> Result<ToolOutput, ToolError> {
        let parsed_args: ReadDocumentArgs = serde_json::from_value(args)
            .map_err(|e| ToolError::InvalidArguments { details: format!("Invalid arguments: {}", e) })?;

        let state = app.state::<AppState>();
        let pool = state.db().await.map_err(|e| ToolError::ExecutionFailed { message: format!("DB error: {}", e) })?;
        
        // 1. First try as direct absolute path
        let mut target_path = std::path::PathBuf::from(&parsed_args.file_path);
        
        // 2. If it doesn't exist, check if it's a known ingested document by filename or ID
        if !target_path.exists() {
            if let Ok(docs) = crate::db::queries::list_documents(&pool).await {
                if let Some(doc) = docs.into_iter().find(|d| d.filename == parsed_args.file_path || d.id == parsed_args.file_path) {
                    if let Some(doc_path) = doc.file_path {
                        target_path = std::path::PathBuf::from(doc_path);
                    }
                }
            }
        }
        
        // 3. If STILL not found, let's try assuming it's relative to the current working directory of the app
        if !target_path.exists() {
             if let Ok(cwd) = std::env::current_dir() {
                 let relative_path = cwd.join(&parsed_args.file_path);
                 if relative_path.exists() {
                     target_path = relative_path;
                 }
             }
        }

        if !target_path.exists() {
            return Err(ToolError::ExecutionFailed { message: format!("File not found. Searched database and local paths for: {}", parsed_args.file_path) });
        }

        let content = tokio::fs::read_to_string(&target_path).await
            .map_err(|e| ToolError::ExecutionFailed { message: format!("Failed to read file (might be binary?): {}", e) })?;

        // Truncate if too long (e.g. max 32KB of text)
        let max_len = 32 * 1024;
        let final_text = if content.len() > max_len {
            format!("{}... [TRUNCATED - Content exceeded 32KB limit]", &content[..max_len])
        } else {
            content
        };

        Ok(ToolOutput {
            content: json!({
                "file_path": target_path.to_string_lossy(),
                "content": final_text
            }),
            metadata: None,
        })
    }
}

// ─── Grep Documents Tool ───

#[derive(Deserialize)]
pub struct GrepDocumentsArgs {
    pub query: String,
    pub case_sensitive: Option<bool>,
}

pub struct GrepDocumentsTool;

#[async_trait]
impl Tool for GrepDocumentsTool {
    fn name(&self) -> &str {
        "grep_documents"
    }

    fn description(&self) -> &str {
        "Performs a text-based search (grep) for a substring query across all documents in the workspace. Use this to find specific keywords or patterns in the codebase/linked documents when vector search is unavailable or imprecise."
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The text pattern to search for"
                },
                "case_sensitive": {
                    "type": "boolean",
                    "description": "Whether the search should be case sensitive (default: false)"
                }
            },
            "required": ["query"]
        })
    }

    fn risk_level(&self) -> RiskLevel {
        RiskLevel::Low
    }

    async fn execute(
        &self,
        app: AppHandle,
        _chat_id: String,
        args: serde_json::Value,
    ) -> Result<ToolOutput, ToolError> {
        let parsed_args: GrepDocumentsArgs = serde_json::from_value(args)
            .map_err(|e| ToolError::InvalidArguments { details: format!("Invalid arguments: {}", e) })?;

        let state = app.state::<AppState>();
        let pool = state.db().await.map_err(|e| ToolError::ExecutionFailed { message: format!("DB error: {}", e) })?;
        let docs = crate::db::queries::list_documents(&pool).await
            .map_err(|e| ToolError::ExecutionFailed { message: e.to_string() })?;

        let mut results = Vec::new();
        let query = if parsed_args.case_sensitive.unwrap_or(false) {
            parsed_args.query.clone()
        } else {
            parsed_args.query.to_lowercase()
        };

        for doc in docs {
            if let Some(path_str) = doc.file_path {
                let path = std::path::Path::new(&path_str);
                if path.exists() {
                    if let Ok(content) = tokio::fs::read_to_string(path).await {
                        let search_content = if parsed_args.case_sensitive.unwrap_or(false) {
                            content.clone()
                        } else {
                            content.to_lowercase()
                        };

                        if search_content.contains(&query) {
                            // Find matching lines
                            let mut matches = Vec::new();
                            for (idx, line) in content.lines().enumerate() {
                                let search_line = if parsed_args.case_sensitive.unwrap_or(false) {
                                    line.to_string()
                                } else {
                                    line.to_lowercase()
                                };

                                if search_line.contains(&query) {
                                    matches.push(json!({
                                        "line": idx + 1,
                                        "content": line.trim()
                                    }));
                                }
                                
                                if matches.len() >= 10 { // Limit matches per file
                                    break;
                                }
                            }

                            results.push(json!({
                                "filename": doc.filename,
                                "path": path_str,
                                "matches": matches
                            }));
                        }
                    }
                }
            }
            
            if results.len() >= 20 { // Limit total files
                break;
            }
        }

        Ok(ToolOutput {
            content: json!({
                "results": results,
                "count": results.len()
            }),
            metadata: None,
        })
    }
}

