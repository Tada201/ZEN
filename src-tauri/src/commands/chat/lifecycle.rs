//! Lifecycle commands: bulk-archive, fork, abort, export, import.

use tauri::{AppHandle, Emitter, State};
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
    app: AppHandle,
    state: State<'_, AppState>,
    chat_ids: Vec<String>,
) -> ZenResult<()> {
    let db = state.db().await?;
    queries::bulk_archive_chats(&db, &chat_ids).await?;
    // Archived chats have no visible goal controls; pause goals so they stop
    // auto-continuing (mirrors single-chat archive_chat).
    for chat_id in &chat_ids {
        let _ = crate::services::goal::update_status(&app, &db, chat_id, "paused").await;
    }
    Ok(())
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
pub async fn pause_chat(app: AppHandle, state: State<'_, AppState>, chat_id: String) -> ZenResult<bool> {
    let control = state.chat_pause_controls.lock().await.get(&chat_id).cloned();
    let accepted = if let Some(control) = control {
        control.pause();
        let _ = app.emit("chat:status", serde_json::json!({
            "chat_id": chat_id,
            "message": "Paused at the next safe execution boundary",
            "phase": "paused",
            "iteration": 0,
        }));
        info!(chat_id = %chat_id, "Cooperative pause requested");
        true
    } else {
        info!(chat_id = %chat_id, "No active chat execution found to pause");
        false
    };
    Ok(accepted)
}

#[tauri::command]
pub async fn continue_chat(app: AppHandle, state: State<'_, AppState>, chat_id: String) -> ZenResult<bool> {
    let control = state.chat_pause_controls.lock().await.get(&chat_id).cloned();
    let accepted = if let Some(control) = control {
        control.resume();
        let _ = app.emit("chat:status", serde_json::json!({
            "chat_id": chat_id,
            "message": "Resuming execution",
            "phase": "resumed",
            "iteration": 0,
        }));
        info!(chat_id = %chat_id, "Cooperative resume requested");
        true
    } else {
        info!(chat_id = %chat_id, "No active chat execution found to resume");
        false
    };
    Ok(accepted)
}

#[tauri::command]
pub async fn abort_chat(state: State<'_, AppState>, chat_id: String) -> ZenResult<bool> {
  info!(chat_id = %chat_id, "Aborting chat runner/orchestrator stream requested by user");
  if let Some(control) = state.chat_pause_controls.lock().await.remove(&chat_id) {
    control.resume();
  }
  let mut tokens = state.chat_cancellation_tokens.lock().await;
  let cancelled = if let Some(token) = tokens.remove(&chat_id) {
    token.cancel();
    info!(chat_id = %chat_id, "Successfully cancelled active chat stream cancellation token");
    true
  } else {
    info!(chat_id = %chat_id, "No active stream cancellation token found for chat");
    false
  };
  Ok(cancelled)
}

/// Cancel one delegated child without stopping the parent chat run.
#[tauri::command]
pub async fn cancel_subagent(
  state: State<'_, AppState>,
  chat_id: String,
  spawn_id: String,
) -> ZenResult<bool> {
  if chat_id.trim().is_empty() || spawn_id.trim().is_empty() {
    return Err(ZenError::Custom("A chat id and subagent id are required".to_string()));
  }

  let token = state
    .subagent_cancellation_tokens
    .lock()
    .await
    .remove(&spawn_id);
  if let Some(token) = token {
    token.cancel();
    info!(chat_id = %chat_id, spawn_id = %spawn_id, "Cancelled delegated subagent");
    Ok(true)
  } else {
    info!(chat_id = %chat_id, spawn_id = %spawn_id, "Subagent was already complete or unavailable");
    Ok(false)
  }
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
