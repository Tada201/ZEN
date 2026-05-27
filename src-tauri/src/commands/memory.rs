use crate::commands::pagination::{normalize_page, page_from_fetch, Page};
use crate::commands::AppState;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMemoryItem {
    pub id: String,
    pub session_id: String,
    pub content: String,
    pub metadata: String,
    pub written_by: String,
    pub timestamp: i64,
}

#[tauri::command]
pub async fn get_conversation_memories(
    state: State<'_, AppState>,
    chat_id: Option<String>,
    query: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<crate::rag::conversation_store::ConversationSearchResult>, String> {
    let store = state
        .conversation_store
        .get()
        .await
        .map_err(|e| format!("ConversationStore not initialized: {}", e))?;

    let limit_val = limit.unwrap_or(5).clamp(1, 100);
    let query_str = query.unwrap_or_default();

    if query_str.trim().is_empty() {
        let dummy_vec = vec![0.0f32; store.dimension()];
        let results = store
            .search(dummy_vec, limit_val * 3)
            .await
            .map_err(|e| format!("Memory search failed: {}", e))?;

        let filtered = if let Some(ref cid) = chat_id {
            results
                .into_iter()
                .filter(|r| &r.entry.chat_id == cid)
                .take(limit_val)
                .collect()
        } else {
            results.into_iter().take(limit_val).collect()
        };
        return Ok(filtered);
    }

    // Resolve embedding model
    let pool = state.db().await.map_err(|e| e.to_string())?;
    let model_name = crate::db::queries::get_setting(&pool, "embedding_model")
        .await
        .unwrap_or_default()
        .unwrap_or_else(|| "nomic-embed-text".to_string());

    // Try local Candle embedding model first
    let mut vector = None;
    if let Some(ref model) = *state.documents.embedding_model.read().await {
        if let Ok(vec) = model.encode(&query_str).await {
            vector = Some(vec);
        }
    }

    // Fallback to active LlmProvider's embed
    if vector.is_none() {
        if let Ok(provider) = state.provider().await {
            if let Ok(vec) = provider.embed(&model_name, &query_str).await {
                vector = Some(vec);
            }
        }
    }

    let vec = match vector {
        Some(v) => v,
        None => return Err("Failed to generate embedding for memory search query".to_string()),
    };

    let results = store
        .search(vec, limit_val * 3)
        .await
        .map_err(|e| format!("Memory search failed: {}", e))?;

    let filtered = if let Some(ref cid) = chat_id {
        results
            .into_iter()
            .filter(|r| &r.entry.chat_id == cid)
            .take(limit_val)
            .collect()
    } else {
        results.into_iter().take(limit_val).collect()
    };

    Ok(filtered)
}

#[tauri::command]
pub async fn clear_conversation_memories(
    state: State<'_, AppState>,
    chat_id: Option<String>,
) -> Result<(), String> {
    let store = state
        .conversation_store
        .get()
        .await
        .map_err(|e| format!("ConversationStore not initialized: {}", e))?;

    if let Some(cid) = chat_id {
        store
            .delete_by_chat_id(&cid)
            .await
            .map_err(|e| format!("Failed to delete memories for chat {}: {}", cid, e))?;
    } else {
        store
            .clear_all()
            .await
            .map_err(|e| format!("Failed to clear all memories: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn list_session_memories_page(
    state: State<'_, AppState>,
    session_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Page<SessionMemoryItem>, String> {
    let pool = state.db().await.map_err(|e| e.to_string())?;
    let (limit, offset) = normalize_page(limit, offset);
    let rows = crate::db::queries::get_session_memory_rows_for_session_page(
        &pool,
        &session_id,
        limit + 1,
        offset,
    )
    .await
    .map_err(|e| e.to_string())?;

    let items = rows
        .into_iter()
        .map(|row| SessionMemoryItem {
            id: row.id,
            session_id: row.session_id,
            content: row.content,
            metadata: row.metadata,
            written_by: row.written_by,
            timestamp: row.timestamp,
        })
        .collect();

    Ok(page_from_fetch(items, limit, offset))
}

#[tauri::command]
pub async fn get_memory_stats(
    state: State<'_, AppState>,
) -> Result<crate::rag::conversation_store::ConversationStats, String> {
    let store = state
        .conversation_store
        .get()
        .await
        .map_err(|e| format!("ConversationStore not initialized: {}", e))?;

    store
        .get_stats()
        .await
        .map_err(|e| format!("Failed to get stats: {}", e))
}
