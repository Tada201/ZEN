use tauri::{AppHandle, State};
use crate::error::ZenResult;
use crate::commands::AppState;
use crate::db::models::{Chat, Message, ChatMessage};
use crate::db::queries;
use crate::agent::runner::Runner;
use crate::llm::ChatRequestConfig;
use tokio_util::sync::CancellationToken;

#[tauri::command]
pub async fn create_chat(
    state: State<'_, AppState>,
    title: String,
    model: Option<String>,
) -> ZenResult<Chat> {
    let db = state.db().await?;
    queries::create_chat(&db, &title, model.as_deref()).await
}

#[tauri::command]
pub async fn get_chats(state: State<'_, AppState>) -> ZenResult<Vec<Chat>> {
    let db = state.db().await?;
    queries::list_chats(&db).await
}

#[tauri::command]
pub async fn get_messages(state: State<'_, AppState>, chat_id: String) -> ZenResult<Vec<Message>> {
    let db = state.db().await?;
    queries::get_messages(&db, &chat_id).await
}

#[tauri::command]
pub async fn delete_chat(state: State<'_, AppState>, chat_id: String) -> ZenResult<()> {
    let db = state.db().await?;
    queries::delete_chat(&db, &chat_id).await
}

#[derive(Debug, serde::Deserialize)]
pub struct ThinkingConfig {
    pub enabled: bool,
    pub effort: Option<String>,
    pub budget_tokens: Option<i64>,
}

#[tauri::command]
pub async fn send_message(
    app: AppHandle,
    state: State<'_, AppState>,
    chat_id: String,
    content: String,
    model: Option<String>,
    _provider: Option<String>,
    web_search: Option<bool>,
    thinking: Option<ThinkingConfig>,
    _generative_ui: Option<bool>,
    tools: Option<Vec<String>>,
    _attachments: Option<Vec<crate::db::models::Attachment>>,
) -> ZenResult<()> {
    let db = state.db().await?;
    
    // 1. Add user message to DB
    queries::add_message(
        &db,
        &chat_id,
        None,
        "user",
        &content,
        model.as_deref(),
        true,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    ).await?;

    // 2. Get active provider and model
    let llm_provider = state.provider().await?;
    let active_model = model.unwrap_or_else(|| "gpt-4o-mini".to_string());

    // 3. Prepare config
    let mut config = ChatRequestConfig::default();
    if let Some(t) = thinking {
        if t.enabled {
            config.reasoning_effort = t.effort;
            config.thinking_budget = t.budget_tokens;
        }
    }
    
    let token = CancellationToken::new();
    
    // Register cancellation token
    {
        let mut tokens = state.chat_cancellation_tokens.lock().await;
        tokens.insert(chat_id.clone(), token.clone());
    }

    // 4. Fetch history for context
    let history = queries::get_messages(&db, &chat_id).await?;
    let chat_messages: Vec<ChatMessage> = history.into_iter().map(|m| ChatMessage {
        role: m.role,
        content: m.content,
        images: None,
        tool_calls: None,
        tool_call_id: None,
    }).collect();

    // 5. Build Agent
    let mut tool_ids = vec![];
    if web_search.unwrap_or(false) {
        tool_ids.push("web_search".to_string());
    }
    
    // If specific tools were requested, use them. Otherwise default to a few core tools.
    if let Some(requested_tools) = tools {
        tool_ids.extend(requested_tools);
    } else {
        tool_ids.extend(vec!["read_file".to_string(), "list_dir".to_string(), "run_command".to_string()]);
    }

    let agent = crate::agent::types::Agent {
        id: "zen_assistant".to_string(),
        name: "Zen".to_string(),
        instructions: "You are Zen, a powerful agentic AI assistant. Use tools to solve the user's request directly.".to_string(),
        tool_ids,
        model_override: None,
        max_iterations: Some(20),
        description: Some("Customized assistant".to_string()),
        model_tier: crate::agent::types::ModelTier::Local,
    };

    let chat_id_clone = chat_id.clone();
    
    // 6. Check if we should use Orchestrator (Phase 3)
    let use_orchestrator = web_search.unwrap_or(false) || content.len() > 500; // Heuristic
    
    if use_orchestrator {
        let orchestrator_opt = {
            let lock = state.orchestrator.read().await;
            lock.clone()
        };

        if let Some(orchestrator) = orchestrator_opt {
            let provider_clone = llm_provider.clone();
            let chat_id_inner = chat_id.clone();
            let content_inner = content.clone();
            let model_inner = active_model.clone();
            let config_clone = config.clone();
            let token_clone = token.clone();
            
            tokio::spawn(async move {
                if let Err(e) = orchestrator.run_orchestrator_loop(
                    provider_clone,
                    &model_inner,
                    chat_messages,
                    &chat_id_inner,
                    &content_inner,
                    config_clone,
                    token_clone,
                    None,
                ).await {
                    tracing::error!("Orchestrator error: {:?}", e);
                }
            });
            return Ok(());
        }
    }
    // Fallback to Runner
    let runner = Runner::new(
        app.clone(),
        state.tool_registry_v1.clone(),
        state.agent_registry.clone(),
        state.hook_registry.clone(),
        state.tools.clone(),
    ).with_db_pool(db.clone());

    tokio::spawn(async move {
        if let Err(e) = runner.run(
            &*llm_provider,
            chat_id_clone,
            active_model,
            chat_messages,
            agent,
            config,
            token,
        ).await {
            tracing::error!("Error in chat runner: {:?}", e);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn update_chat_title(state: State<'_, AppState>, chat_id: String, title: String) -> ZenResult<()> {
    let db = state.db().await?;
    queries::update_chat_title(&db, &chat_id, &title).await
}

#[tauri::command]
pub async fn toggle_pin_chat(state: State<'_, AppState>, chat_id: String) -> ZenResult<()> {
    let db = state.db().await?;
    queries::toggle_pin_chat(&db, &chat_id).await
}

#[tauri::command]
pub async fn archive_chat(state: State<'_, AppState>, chat_id: String) -> ZenResult<()> {
    let db = state.db().await?;
    queries::archive_chat(&db, &chat_id).await
}

#[tauri::command]
pub async fn unarchive_chat(state: State<'_, AppState>, chat_id: String) -> ZenResult<()> {
    let db = state.db().await?;
    queries::unarchive_chat(&db, &chat_id).await
}

#[tauri::command]
pub async fn list_archived_chats(state: State<'_, AppState>) -> ZenResult<Vec<Chat>> {
    let db = state.db().await?;
    queries::list_archived_chats(&db).await
}

#[tauri::command]
pub async fn search_chats(state: State<'_, AppState>, query: String, limit: Option<i64>) -> ZenResult<Vec<crate::db::models::SearchResult>> {
    let db = state.db().await?;
    queries::search_chats(&db, &query, limit).await
}

#[tauri::command]
pub async fn bulk_delete_chats(state: State<'_, AppState>, chat_ids: Vec<String>) -> ZenResult<()> {
    let db = state.db().await?;
    queries::bulk_delete_chats(&db, &chat_ids).await
}

// --- Folders ---

#[tauri::command]
pub async fn create_chat_folder(
    state: State<'_, AppState>,
    name: String,
    color: Option<String>,
    icon: Option<String>,
) -> ZenResult<crate::db::models::ChatFolder> {
    let db = state.db().await?;
    queries::create_chat_folder(&db, &name, color.as_deref(), icon.as_deref()).await
}

#[tauri::command]
pub async fn list_chat_folders(state: State<'_, AppState>) -> ZenResult<Vec<crate::db::models::ChatFolder>> {
    let db = state.db().await?;
    queries::list_chat_folders(&db).await
}

#[tauri::command]
pub async fn move_chat_to_folder(state: State<'_, AppState>, chat_id: String, folder_id: String) -> ZenResult<()> {
    let db = state.db().await?;
    queries::move_chat_to_folder(&db, &chat_id, &folder_id).await
}

#[tauri::command]
pub async fn delete_chat_folder(state: State<'_, AppState>, folder_id: String) -> ZenResult<()> {
    let db = state.db().await?;
    queries::delete_chat_folder(&db, &folder_id).await
}
#[tauri::command]
pub async fn update_chat_folder(
    state: State<'_, AppState>,
    folder_id: String,
    name: Option<String>,
    color: Option<String>,
) -> ZenResult<()> {
    let db = state.db().await?;
    queries::update_chat_folder(&db, &folder_id, name.as_deref(), color.as_deref()).await
}

#[tauri::command]
pub async fn remove_chat_from_folder(state: State<'_, AppState>, chat_id: String) -> ZenResult<()> {
    let db = state.db().await?;
    queries::remove_chat_from_folder(&db, &chat_id).await
}

#[tauri::command]
pub async fn bulk_archive_chats(state: State<'_, AppState>, chat_ids: Vec<String>) -> ZenResult<()> {
    let db = state.db().await?;
    queries::bulk_archive_chats(&db, &chat_ids).await
}

#[tauri::command]
pub async fn fork_chat(state: State<'_, AppState>, chat_id: String, message_id: String) -> ZenResult<Chat> {
    let db = state.db().await?;
    queries::fork_chat(&db, &chat_id, &message_id).await
}

#[tauri::command]
pub async fn abort_chat(
    app: AppHandle,
    state: State<'_, AppState>,
    chat_id: String,
) -> ZenResult<()> {
    let mut tokens = state.chat_cancellation_tokens.lock().await;
    if let Some(token) = tokens.remove(&chat_id) {
        token.cancel();
        
        use tauri::Emitter;
        let _ = app.emit("chat:done", serde_json::json!({
            "chat_id": chat_id,
            "content": "Chat aborted by user.",
            "done": true,
            "reason": "aborted"
        }));
    }
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ChatExport {
    pub chat: Chat,
    pub messages: Vec<Message>,
}

#[tauri::command]
pub async fn export_chat(
    state: State<'_, AppState>,
    chat_id: String,
) -> ZenResult<ChatExport> {
    let db = state.db().await?;
    let chat = queries::get_chat(&db, &chat_id).await?;
    let messages = queries::get_messages(&db, &chat_id).await?;
    Ok(ChatExport { chat, messages })
}

#[tauri::command]
pub async fn import_chat(
    state: State<'_, AppState>,
    source_path: String,
) -> ZenResult<Chat> {
    let db = state.db().await?;
    let content = std::fs::read_to_string(&source_path).map_err(|e| crate::error::ZenError::Custom(format!("Failed to read export file: {}", e)))?;
    let export: ChatExport = serde_json::from_str(&content).map_err(|e| crate::error::ZenError::Custom(format!("Invalid export format: {}", e)))?;
    
    let new_chat = queries::create_chat(&db, &format!("{} (Imported)", export.chat.title), export.chat.model.as_deref()).await?;

    for msg in export.messages {
        queries::add_message(
            &db,
            &new_chat.id,
            Some(&msg.id),
            &msg.role,
            &msg.content,
            msg.model.as_deref(),
            msg.is_complete.unwrap_or(1) == 1,
            msg.tool_calls.as_deref(),
            msg.tool_call_id.as_deref(),
            msg.images.as_deref(),
            msg.attachments.as_deref(),
            msg.tokens_in,
            msg.tokens_out,
            None,
            None,
        ).await?;
    }
    
    Ok(new_chat)
}
