//! Retained for a future session-memory redesign only. These tools are not
//! registered, discoverable, or present in any active agent allowlist.

use crate::commands::AppState;
use crate::rag::session_memory::create_memory_entry;
use anyhow::Result;
use async_trait::async_trait;
/// Agent Tools for Session-Scoped Vector Memory
///
/// These tools allow agents to:
/// 1. Write findings to session memory (write_to_memory)
/// 2. Search within session memory (search_session_memory)
/// 3. Get memory count (get_memory_stats)
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

// ─── Write to Memory Tool ───

#[derive(serde::Deserialize)]
struct WriteMemoryArgs {
    content: String,
    metadata: Option<String>,
}

pub struct WriteToMemoryTool;

#[async_trait]
impl zen_tools::AgentTool<tauri::AppHandle> for WriteToMemoryTool {
    fn id(&self) -> &str {
        "write_to_memory"
    }

    fn description(&self) -> &str {
        "Writes a finding, observation, or intermediate result to session-scoped vector memory. \
         Use this during complex multi-agent workflows to share context between agents without \
         bloating the conversation. Data is automatically cleaned up when the session ends. \
         Ideal for: research notes, code analysis results, data summaries, intermediate conclusions."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "The text content to store in session memory"
                },
                "metadata": {
                    "type": "string",
                    "description": "Optional JSON metadata (e.g., source, confidence, tags)"
                }
            },
            "required": ["content"],
            "additionalProperties": false
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<
            std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>,
        >,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let args: WriteMemoryArgs = serde_json::from_value(input)?;

        // Get AppState
        let state = app.state::<AppState>();

        // Get session memory manager
        let memory_mgr = state.session_memory.read().await;

        // Create memory entry
        let entry = create_memory_entry(
            &chat_id,
            &args.content,
            "agent", // Could be made more specific with agent name
            args.metadata.as_deref(),
        );

        // Write to session memory
        match memory_mgr.write_memory(&chat_id, entry).await {
            Ok(()) => Ok(json!({
                "success": true,
                "message": "Memory written successfully",
                "session_id": chat_id,
            })),
            Err(e) => Ok(json!({
                "success": false,
                "error": e.to_string(),
            })),
        }
    }
}

// ─── Search Session Memory Tool ───

#[derive(serde::Deserialize)]
struct SearchMemoryArgs {
    query: String,
    limit: Option<usize>,
}

pub struct SearchSessionMemoryTool;

#[async_trait]
impl zen_tools::AgentTool<tauri::AppHandle> for SearchSessionMemoryTool {
    fn id(&self) -> &str {
        "search_session_memory"
    }

    fn description(&self) -> &str {
        "Searches within the current session's vector memory for relevant findings. \
         Use this to retrieve context written by other agents during the same workflow. \
         Returns matching entries with their content and metadata. \
         Perfect for: gathering research notes, reviewing analysis results, finding related observations."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query to find relevant memories"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of results to return (default: 5)",
                    "default": 5
                }
            },
            "required": ["query"],
            "additionalProperties": false
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<
            std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>,
        >,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let args: SearchMemoryArgs = serde_json::from_value(input)?;
        let limit = args.limit.unwrap_or(5);

        // Get AppState
        let state = app.state::<AppState>();

        // Get session memory manager
        let memory_mgr = state.session_memory.read().await;

        // Try semantic search with scores first (if hybrid backend available)
        match memory_mgr
            .semantic_search_with_scores(&chat_id, &args.query, limit)
            .await
        {
            Ok(results) => {
                let memories: Vec<Value> = results
                    .iter()
                    .map(|r| {
                        json!({
                            "id": r.memory.id,
                            "content": r.memory.content,
                            "metadata": r.memory.metadata,
                            "written_by": r.memory.written_by,
                            "timestamp": r.memory.timestamp,
                            "similarity": format!("{:.4}", r.similarity), // 0-1 score
                        })
                    })
                    .collect();

                Ok(json!({
                    "success": true,
                    "count": memories.len(),
                    "search_type": "semantic", // Indicates semantic search was used
                    "memories": memories,
                }))
            }
            Err(e) => Ok(json!({
                "success": false,
                "error": e.to_string(),
            })),
        }
    }
}

// ─── Get Memory Stats Tool ───

pub struct GetMemoryStatsTool;

#[async_trait]
impl zen_tools::AgentTool<tauri::AppHandle> for GetMemoryStatsTool {
    fn id(&self) -> &str {
        "get_memory_stats"
    }

    fn description(&self) -> &str {
        "Returns statistics about the current session's vector memory, including entry count. \
         Use this to check how much context has been accumulated during the workflow."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {},
            "additionalProperties": false
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        chat_id: String,
        _input: Value,
        _depth: u32,
        _allowed_tools: Option<
            std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>,
        >,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        // Get AppState
        let state = app.state::<AppState>();

        // Get session memory manager
        let memory_mgr = state.session_memory.read().await;

        // Get count
        match memory_mgr.get_memory_count(&chat_id).await {
            Ok(count) => Ok(json!({
                "success": true,
                "session_id": chat_id,
                "memory_count": count,
            })),
            Err(e) => Ok(json!({
                "success": false,
                "error": e.to_string(),
            })),
        }
    }
}
