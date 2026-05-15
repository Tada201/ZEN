//! Clarification request handling for agent system
//! 
//! This module provides backend support for clarification widgets:
//! - Store clarification requests in database
//! - Handle user responses
//! - Resume agent execution with selected options

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{Emitter, State};
use crate::error::ZenError;
use crate::commands::AppState;

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
    app_state: &AppState,
    chat_id: &str,
    question: &str,
    clarification_type: &str,
    options: Vec<ClarificationOption>,
) -> Result<ClarificationRequest, ZenError> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().to_rfc3339();

    let pool = app_state.db.read().await;
    let pool = pool.as_ref().ok_or_else(|| ZenError::Internal("Database not initialized".to_string()))?;

    // Store in database
    let options_json = serde_json::to_string(&options)
        .map_err(|e| ZenError::Json(e))?;

    sqlx::query(
        r#"
        INSERT INTO clarification_requests (id, chat_id, question, clarification_type, options, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        "#
    )
    .bind(&id)
    .bind(chat_id)
    .bind(question)
    .bind(clarification_type)
    .bind(&options_json)
    .bind(&created_at)
    .execute(pool)
    .await
    .map_err(|e| ZenError::Database(e))?;

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
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    chat_id: String,
    selected_ids: Vec<String>,
) -> Result<(), String> {
    tracing::info!(chat_id = %chat_id, "Clarification response received");

    let pool = state.db.read().await;
    let pool = pool.as_ref().ok_or("Database not initialized")?;

    // Update database
    let response_json = serde_json::to_string(&selected_ids)
        .map_err(|e| format!("Failed to serialize response: {}", e))?;
    
    let responded_at = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        r#"
        UPDATE clarification_requests
        SET response = ?, responded_at = ?
        WHERE chat_id = ?
        "#
    )
    .bind(&response_json)
    .bind(&responded_at)
    .bind(&chat_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    // Emit event to resume agent execution
    app.emit("clarification:submitted", ClarificationResponsePayload {
        chat_id: chat_id.clone(),
        selected_ids,
    })
    .map_err(|e| format!("Failed to emit event: {}", e))?;

    tracing::info!(chat_id = %chat_id, "Agent resumed with clarification response");
    Ok(())
}

/// Database migration for clarification requests table
pub async fn run_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS clarification_requests (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            question TEXT NOT NULL,
            clarification_type TEXT NOT NULL,
            options TEXT NOT NULL,
            response TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            responded_at DATETIME,
            FOREIGN KEY (chat_id) REFERENCES chats(id)
        )
        "#
    )
    .execute(pool)
    .await?;

    tracing::info!("Clarification requests table created/migrated");
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
