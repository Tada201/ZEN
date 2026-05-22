use std::sync::Arc;
use tauri::{AppHandle, Manager, Emitter};
use tokio_util::sync::CancellationToken;
use tracing::{info, error};
use serde_json::json;

use crate::db::models::Message;
use crate::db::queries;
use crate::llm::{LlmProvider, ChatRequestConfig};
use crate::search::tool::WebSearchTool;
use crate::tools::web_fetch::WebFetchTool;
use crate::tools::Tool;

pub async fn run_deep_research(
    app: AppHandle,
    db: sqlx::SqlitePool,
    llm_provider: &dyn LlmProvider,
    chat_id: String,
    model: String,
    query: String,
    config: ChatRequestConfig,
    token: CancellationToken,
) {
    info!(chat_id = %chat_id, query = %query, "Starting Deep Research orchestrator");

    // Helper to emit research step events
    let app_clone = app.clone();
    let chat_id_clone = chat_id.clone();
    let emit_step = |text: &str, status: &str, msg_id: &str| {
        let _ = app_clone.emit("chat:research-step", json!({
            "chat_id": chat_id_clone,
            "message_id": msg_id,
            "text": text,
            "status": status,
        }));
    };

    // 1. Create a placeholder assistant message in the database with kind='deep_research'
    let message = match queries::add_message(
        &db,
        &chat_id,
        None,
        "assistant",
        "",
        Some(&model),
        false,
        None,
        None,
        None,
        None,
        None,
        None,
        Some("deep_research"),
        None,
    ).await {
        Ok(msg) => msg,
        Err(e) => {
            error!("Failed to create assistant message for deep research: {}", e);
            return;
        }
    };
    let message_id = message.id.clone();

    // First Step: Web Search
    emit_step("Searching the web for relevant information...", "running", &message_id);

    let search_tool = WebSearchTool;
    let search_args = json!({"query": query});
    let search_result = match search_tool.execute(app.clone(), chat_id.clone(), search_args).await {
        Ok(output) => output,
        Err(e) => {
            error!("WebSearchTool execution failed: {}", e);
            emit_step("Searching the web for relevant information...", "error", &message_id);
            return;
        }
    };

    emit_step("Searching the web for relevant information...", "completed", &message_id);

    // Extract URLs from search results
    let mut urls_to_fetch = Vec::new();
    if let Some(results) = search_result.content.get("results").and_then(|r| r.as_array()) {
        for res in results.iter().take(3) {
            if let Some(url) = res.get("url").and_then(|u| u.as_str()) {
                urls_to_fetch.push(url.to_string());
            }
        }
    }

    // Second Step: Reading top pages
    let mut fetched_contents = Vec::new();
    if !urls_to_fetch.is_empty() {
        emit_step(&format!("Reading {} sources...", urls_to_fetch.len()), "running", &message_id);
        
        let fetch_tool = WebFetchTool;
        for url in urls_to_fetch {
            if token.is_cancelled() {
                break;
            }
            match fetch_tool.execute(app.clone(), chat_id.clone(), json!({"url": url})).await {
                Ok(output) => {
                    if let Some(content) = output.content.get("content").and_then(|c| c.as_str()) {
                        fetched_contents.push(format!("Source URL: {}\nContent:\n{}\n", url, content));
                    }
                }
                Err(e) => {
                    error!("Failed to fetch URL {}: {}", url, e);
                }
            }
        }
        
        emit_step("Reading sources...", "completed", &message_id);
    } else {
        emit_step("No sources found to read.", "completed", &message_id);
    }

    // Third Step: Synthesizing Report
    emit_step("Synthesizing final research report...", "running", &message_id);

    let system_prompt = "You are a Deep Research AI assistant. Your goal is to provide a comprehensive, well-structured, and highly detailed markdown report based on the provided search results and source contents. Synthesize the information intelligently, avoid repetition, and cite your sources where applicable.";
    let user_prompt = format!("User Query: {}\n\nSearch Summary:\n{}\n\nFetched Source Content:\n{}", 
        query, 
        serde_json::to_string_pretty(&search_result.content).unwrap_or_default(),
        fetched_contents.join("\n\n---\n\n")
    );

    let llm_messages = vec![
        crate::db::models::ChatMessage {
            role: "system".to_string(),
            content: system_prompt.to_string(),
            images: None,
            tool_calls: None,
            tool_call_id: None,
        },
        crate::db::models::ChatMessage {
            role: "user".to_string(),
            content: user_prompt,
            images: None,
            tool_calls: None,
            tool_call_id: None,
        },
    ];

    let app_clone2 = app.clone();
    let chat_id_clone2 = chat_id.clone();
    let message_id_clone = message_id.clone();
    let on_chunk = Box::new(move |chunk: crate::llm::LlmChunk| {
        let text = match chunk {
            crate::llm::LlmChunk::Text(t) => t,
            crate::llm::LlmChunk::Thought(t) => t,
        };
        if !text.is_empty() {
            let _ = app_clone2.emit("chat:chunk", json!({
                "chat_id": chat_id_clone2,
                "id": message_id_clone,
                "delta": text,
            }));
        }
    });

    let res = match llm_provider.chat_stream(&model, llm_messages, None, config, on_chunk, token.clone()).await {
        Ok(res) => res,
        Err(e) => {
            error!("Failed to start LLM synthesis stream: {}", e);
            emit_step("Synthesizing final research report...", "error", &message_id);
            return;
        }
    };

    let full_response = res.content;

    emit_step("Synthesizing final research report...", "completed", &message_id);

    // Finalize the message
    if let Err(e) = queries::update_message(
        &db,
        &message_id,
        &chat_id,
        &full_response,
        true, // is_complete
        None,
        None,
        None, // tool_calls
    ).await {
        error!(
            message_id = %message_id,
            chat_id = %chat_id,
            error = %e,
            response_len = %full_response.len(),
            response_snippet = %&full_response[..std::cmp::min(100, full_response.len())],
            "Failed to finalize deep research message in database"
        );
        emit_step("Failed to save final research report to database", "error", &message_id);
        return;
    }

    // Send final message payload
    let _ = app.emit("chat:message", json!({
        "chat_id": chat_id,
        "id": message_id,
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "role": "assistant",
        "kind": "deep_research",
        "content": full_response,
    }));

    info!("Deep Research orchestrator completed");
}
