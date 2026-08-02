//! Lifecycle commands: bulk-archive, fork, abort, export, import.

use tauri::{AppHandle, State};
use tracing::info;

use crate::commands::AppState;
use crate::db::models::{Chat, Message};
use crate::db::queries;
use crate::error::{ZenError, ZenResult};

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ChatExport {
    pub chat: Chat,
    pub messages: Vec<Message>,
}

#[tauri::command]
pub async fn bulk_archive_chats(
    state: State<'_, AppState>,
    chat_ids: Vec<String>,
) -> ZenResult<()> {
    let db = state.db().await?;
    queries::bulk_archive_chats(&db, &chat_ids).await
}

#[tauri::command]
pub async fn fork_chat(
    state: State<'_, AppState>,
    chat_id: String,
    message_id: String,
) -> ZenResult<Chat> {
    let db = state.db().await?;
    queries::fork_chat(&db, &chat_id, &message_id).await
}

#[tauri::command]
pub async fn abort_chat(state: State<'_, AppState>, chat_id: String) -> ZenResult<()> {
    info!(chat_id = %chat_id, "Aborting chat runner/orchestrator stream requested by user");
    let mut tokens = state.chat_cancellation_tokens.lock().await;
    if let Some(token) = tokens.remove(&chat_id) {
        token.cancel();
        info!(chat_id = %chat_id, "Successfully cancelled active chat stream cancellation token");
    } else {
        info!(chat_id = %chat_id, "No active stream cancellation token found for chat");
    }
    Ok(())
}

#[tauri::command]
pub async fn export_chat(state: State<'_, AppState>, chat_id: String) -> ZenResult<ChatExport> {
    let db = state.db().await?;
    let chat = queries::get_chat(&db, &chat_id).await?;
    let messages = queries::get_messages(&db, &chat_id).await?;
    Ok(ChatExport { chat, messages })
}

#[tauri::command]
pub async fn export_image_to_workspace(
    app: AppHandle,
    state: State<'_, AppState>,
    filename: String,
) -> ZenResult<String> {
    let resolved_source = crate::utils::validate_generated_image_path(&app, &filename)?;

    let workspace_path = state.workspace_folder.read().await.clone();
    let workspace_images_dir = workspace_path.join("generated_images");
    std::fs::create_dir_all(&workspace_images_dir).map_err(|e| {
        ZenError::Custom(format!("Failed to create workspace directory: {}", e))
    })?;

    let destination_path = workspace_images_dir.join(
        resolved_source
            .file_name()
            .ok_or_else(|| ZenError::Custom("Invalid filename".to_string()))?,
    );
    std::fs::copy(&resolved_source, &destination_path).map_err(|e| {
        ZenError::Custom(format!("Failed to copy image to workspace: {}", e))
    })?;

    Ok(destination_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn import_chat(state: State<'_, AppState>, source_path: String) -> ZenResult<Chat> {
    let db = state.db().await?;
    let validated_path = crate::utils::validate_path(&source_path)?;
    let content = std::fs::read_to_string(&validated_path).map_err(|e| {
        ZenError::Custom(format!("Failed to read export file: {}", e))
    })?;
    let export: ChatExport = serde_json::from_str(&content)
        .map_err(|e| ZenError::Custom(format!("Invalid export format: {}", e)))?;

    // Workspace roots are machine-local capabilities, not portable chat data.
    // Preserve the imported conversation, but require the user to explicitly
    // select a local root after import rather than trusting an export path.
    let new_chat = queries::create_chat(
        &db,
        &format!("{} (Imported)", export.chat.title),
        export.chat.model.as_deref(),
        None,
    )
    .await?;

    for msg in export.messages {
        queries::add_message(
            &db,
            &queries::NewMessage {
                chat_id: &new_chat.id,
                id: Some(&msg.id),
                role: &msg.role,
                content: &msg.content,
                model: msg.model.as_deref(),
                is_complete: msg.is_complete.unwrap_or(1) == 1,
                tool_calls: msg.tool_calls.as_deref(),
                tool_call_id: msg.tool_call_id.as_deref(),
                images: msg.images.as_deref(),
                attachments: msg.attachments.as_deref(),
                tokens_in: msg.tokens_in,
                tokens_out: msg.tokens_out,
                reasoning_details: msg.reasoning_details.as_deref(),
                ..Default::default()
            },
        )
        .await?;
    }

    Ok(new_chat)
}
