//! Clarification request handling for agent system
//!
//! This module provides backend support for clarification widgets:
//! - Store clarification requests in database
//! - Handle user responses
//! - Resume agent execution with selected options

use crate::db::queries;
use crate::error::ZenError;
use crate::services::agent_context::AgentContext;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Clarification request structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClarificationRequest {
    pub id: String,
    pub chat_id: String,
    pub question: String,
    pub clarification_type: String, // "single_select", "multi_select", "rank_priorities"
    pub options: Vec<ClarificationOption>,
    pub response: Option<Vec<String>>, // Selected option IDs
    pub created_at: String,
    pub responded_at: Option<String>,
}

/// Individual option in a clarification request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClarificationOption {
    pub id: String,
    pub label: String,
    pub description: Option<String>,
}

/// Payload for clarification response event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClarificationResponsePayload {
    pub chat_id: String,
    pub selected_ids: Vec<String>,
}

/// Create a new clarification request and store in database
pub async fn create_clarification_request(
    app_state: &AgentContext,
    chat_id: &str,
    question: &str,
    clarification_type: &str,
    options: Vec<ClarificationOption>,
) -> Result<ClarificationRequest, ZenError> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().to_rfc3339();

    let pool = app_state.db().await?;

    // Store in database
    let options_json = serde_json::to_string(&options).map_err(ZenError::Json)?;

    queries::add_clarification_request(
        &pool,
        &id,
        chat_id,
        question,
        clarification_type,
        &options_json,
        &created_at,
    )
    .await?;

    Ok(ClarificationRequest {
        id,
        chat_id: chat_id.to_string(),
        question: question.to_string(),
        clarification_type: clarification_type.to_string(),
        options,
        response: None,
        created_at,
        responded_at: None,
    })
}

/// Submit clarification response and resume agent
#[tauri::command]
pub async fn submit_clarification_response(
    state: State<'_, AgentContext>,
    chat_id: String,
    selected_ids: Vec<String>,
) -> Result<(), String> {
    tracing::info!(chat_id = %chat_id, "Clarification response received");

    let pool = state.db().await.map_err(|e| e.to_string())?;

    // Update database
    let response_json = serde_json::to_string(&selected_ids)
        .map_err(|e| format!("Failed to serialize response: {}", e))?;

    let responded_at = chrono::Utc::now().to_rfc3339();

    queries::update_clarification_response(&pool, &chat_id, &response_json, &responded_at)
        .await
        .map_err(|e| format!("Database error: {}", e))?;

    // Emit event to resume agent execution (via the shared EventSink port)
    state.inner().events.emit(
        "clarification:submitted",
        &serde_json::json!({
            "chat_id": chat_id,
            "selected_ids": selected_ids,
        }),
    );

    tracing::info!(chat_id = %chat_id, "Agent resumed with clarification response");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clarification_option_serialization() {
        let option = ClarificationOption {
            id: "opt1".to_string(),
            label: "Option 1".to_string(),
            description: Some("First option".to_string()),
        };

        let json = serde_json::to_string(&option).unwrap();
        assert!(json.contains("Option 1"));

        let deserialized: ClarificationOption = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "opt1");
    }
}
