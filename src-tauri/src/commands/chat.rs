use tauri::{AppHandle, State};
use crate::error::ZenResult;
use crate::commands::AppState;
use crate::db::models::{Chat, Message, ChatMessage};
use crate::db::queries;
use crate::agent::runner::Runner;
use crate::llm::ChatRequestConfig;
use tokio_util::sync::CancellationToken;
use tracing::info;

#[tauri::command]
pub async fn create_chat(
    state: State<'_, AppState>,
    title: String,
    model: Option<String>,
) -> ZenResult<Chat> {
    info!(title = ?title, model = ?model, "Creating new chat session");
    let db = state.db().await?;
    let chat = queries::create_chat(&db, &title, model.as_deref()).await?;
    info!(chat_id = %chat.id, "Chat session created successfully");
    Ok(chat)
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
    // 1. Remove SQLite rows first (primary source of truth)
    queries::delete_chat(&db, &chat_id).await?;
    // 2. Best-effort: remove conversation vectors from LanceDB so deleted
    //    content cannot resurface via semantic recall.
    if let Ok(store) = state.conversation_store.get().await {
        if let Err(e) = store.delete_by_chat_id(&chat_id).await {
            tracing::warn!(
                chat_id = %chat_id,
                error = %e,
                "delete_chat: failed to remove conversation vectors from LanceDB (stale vectors may remain)"
            );
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn bulk_delete_chats(state: State<'_, AppState>, chat_ids: Vec<String>) -> ZenResult<()> {
    let db = state.db().await?;
    // 1. Remove SQLite rows first
    queries::bulk_delete_chats(&db, &chat_ids).await?;
    // 2. Best-effort vector cleanup — same lifecycle as single delete
    if let Ok(store) = state.conversation_store.get().await {
        for chat_id in &chat_ids {
            if let Err(e) = store.delete_by_chat_id(chat_id).await {
                tracing::warn!(
                    chat_id = %chat_id,
                    error = %e,
                    "bulk_delete_chats: failed to remove conversation vectors from LanceDB"
                );
            }
        }
    }
    Ok(())
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
    provider: Option<String>,
    web_search: Option<bool>,
    deep_research: Option<bool>,
    temperature: Option<f64>,
    max_tokens: Option<i64>,
    top_p: Option<f64>,
    top_k: Option<i64>,
    presence_penalty: Option<f64>,
    frequency_penalty: Option<f64>,
    repeat_penalty: Option<f64>,
    seed: Option<i64>,
    stop: Option<Vec<String>>,
    thinking: Option<ThinkingConfig>,
    generative_ui: Option<bool>,
    tools: Option<Vec<String>>,
    _attachments: Option<Vec<crate::db::models::Attachment>>,
    system_prompt: Option<String>,
) -> ZenResult<()> {
    info!(
        chat_id = %chat_id,
        content_len = %content.len(),
        model = ?model,
        provider = ?provider,
        web_search = ?web_search,
        deep_research = ?deep_research,
        "Received send_message command"
    );
    let db = state.db().await?;
    
    // 1. Add user message to DB
    info!(chat_id = %chat_id, "Inserting user message into database");
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
    info!(chat_id = %chat_id, "User message successfully saved to database");

    // 2. Get active provider and model
    let resolved_provider_name = match provider.as_deref() {
        Some(p) if !p.is_empty() => p.to_string(),
        _ => {
            let active_setting = crate::db::queries::get_setting(&db, "active_provider")
                .await
                .unwrap_or_default();
            active_setting.unwrap_or_else(|| "ollama".to_string())
        }
    };
    info!(
        chat_id = %chat_id,
        resolved_provider_name = %resolved_provider_name,
        "Resolving active LLM provider instance"
    );
    let active_model = model.ok_or_else(|| crate::error::ZenError::Custom(
        "No model selected. Open Settings → Models to choose a model.".to_string()
    ))?;

    info!(
        chat_id = %chat_id,
        resolved_provider_name = %resolved_provider_name,
        active_model = %active_model,
        "Fetching provider, history, and settings in parallel"
    );
    let (llm_provider, history, tools_enabled_str, custom_prompt_setting) = tokio::try_join!(
        state.provider_registry.create(&resolved_provider_name),
        queries::get_messages(&db, &chat_id),
        state.settings_manager.get("tools_enabled"),
        async { queries::get_setting(&db, "system_prompt").await },
    )?;
    info!(
        chat_id = %chat_id,
        history_count = %history.len(),
        resolved_provider = %resolved_provider_name,
        "Retrieved provider, chat history, and settings in parallel"
    );

    // 3. Prepare config
    let mut config = ChatRequestConfig::default();
    config.temperature = temperature;
    config.max_tokens = max_tokens;
    config.top_p = top_p;
    config.top_k = top_k;
    config.presence_penalty = presence_penalty;
    config.frequency_penalty = frequency_penalty;
    config.repeat_penalty = repeat_penalty;
    config.seed = seed;
    config.stop = stop;
    
    if let Some(t) = thinking {
        if t.enabled {
            config.reasoning_effort = t.effort;
            config.thinking_budget = t.budget_tokens;
        }
    }
    
    let token = CancellationToken::new();
    
    // Register cancellation token
    let cancel_tokens = state.chat_cancellation_tokens.clone();
    {
        let mut tokens = cancel_tokens.lock().await;
        tokens.insert(chat_id.clone(), token.clone());
    }

    // 4. Convert history to ChatMessage format (already fetched in parallel)
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
    
    // If specific tools were requested, use them. Otherwise default to a few core tools if enabled and supported.
    if let Some(requested_tools) = tools {
        tool_ids.extend(requested_tools);
    } else {
        let tools_enabled = tools_enabled_str
            .map(|s| s.trim() == "true")
            .unwrap_or(true);

        if tools_enabled && llm_provider.supports_tools(&active_model) {
            tool_ids.extend(vec![
                "read_document_content".to_string(),
                "list_documents".to_string(),
                "run_command".to_string(),
            ]);
        }
    }

    // (custom_prompt_setting was already fetched in parallel above)
    
    let default_instructions = "You are Zen, a powerful agentic AI assistant. Keep responses direct, short, and highly concise. Avoid redundant conversational fluff.

## 🌟 Rich Content Markdown Support
Always use these specialized code blocks for visual scenarios:
1. 📊 CHARTS: Use ```chart with JSON schema: {\"type\":\"bar|line|area|pie\",\"title\":\"...\",\"xAxis\":\"x_key\",\"keys\":[\"y_key\"],\"data\":[{\"x_key\":\"val\",\"y_key\":num}]}.
2. 📐 ARCHITECTURE: Use ```mermaid code blocks for flowcharts, sequences, or component relationships.
3. 📁 STRUCTURE: Use ```tree with indentations to describe folder trees or directory structures.
4. 🧪 CANVAS (openui): Use ```openui containing layout primitive tags to render live interactive canvas widgets (when Gen UI is enabled).
5. 📢 ALERTS: Wrap callouts in standard blockquotes with headers (> [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING], > [!CAUTION]).

## 🚫 Critical Limitations & Strict Syntax Constraints
- Do not render raw HTML/React tags directly in plain text. All designs must be enclosed in the structural markdown blocks listed above.
- **CHART BLOCKS**: The content of ```chart MUST be RAW, VALID, PARSABLE JSON ONLY. Do NOT write markdown fences like ` ``` ` or the word `chart` INSIDE the block itself. Never double-escape characters or introduce control characters (like raw newlines, tabs, or backslashes inside string properties) that violate JSON standards.
- **MERMAID BLOCKS**: The content of ```mermaid MUST be strictly valid Mermaid syntax. Double check all bracket matchups, parentheses, arrow combinations, and diagram definitions (e.g. use standard flowcharts, sequence diagrams). Do NOT invent invalid keywords like `graph0]}}` or bad punctuation inside node definitions.
- **NEVER** write prefix markdown or metadata tags inside the code blocks. The code block opening tag (e.g. ```chart) must be immediately followed by the content (JSON/Mermaid code) and nothing else.".to_string();

    let mut instructions = match system_prompt {
        Some(p) if !p.trim().is_empty() => p,
        _ => match custom_prompt_setting {
            Some(p) if !p.trim().is_empty() => p,
            _ => default_instructions,
        }
    };

    // Inject state watcher directive to prevent LLM context confusion
    if generative_ui.unwrap_or(false) {
        instructions.push_str("\n\n[SYSTEM STATE WARNING]\nIMPORTANT: The Generative UI feature is currently ENABLED for this message turn. You MUST generate any visual mockups, dashboards, grids, stacks, or styled templates inside ```openui ... ``` code blocks using the specified DSL catalog.");
    } else {
        instructions.push_str("\n\n[SYSTEM STATE WARNING]\nIMPORTANT: The Generative UI feature is currently DISABLED for this message turn. Do NOT generate any 'openui' or visual sandbox layout blocks. Provide all responses in plain, standard markdown or text.");
    }

    let agent = crate::agent::types::Agent {
        id: "zen_assistant".to_string(),
        name: "Zen".to_string(),
        instructions,
        tool_ids,
        model_override: None,
        max_iterations: Some(20),
        description: Some("Customized assistant".to_string()),
        model_tier: crate::agent::types::ModelTier::Local,
    };

    let chat_id_clone = chat_id.clone();
    
    // Deep Research branch
    if deep_research.unwrap_or(false) {
        let chat_id_inner = chat_id.clone();
        let active_model_inner = active_model.clone();
        let content_inner = content.clone();
        let provider_clone = llm_provider.clone();
        let cancel_tokens_clone = cancel_tokens.clone();
        let db_clone = db.clone();
        
        info!(chat_id = %chat_id, "Routing request to Deep Research Orchestrator");
        tokio::spawn(async move {
            crate::agent::deep_research::run_deep_research(
                app.clone(),
                db_clone,
                &*provider_clone,
                chat_id_inner.clone(),
                active_model_inner,
                content_inner,
                config,
                token,
            ).await;
            
            let mut tokens = cancel_tokens_clone.lock().await;
            tokens.remove(&chat_id_inner);
        });
        return Ok(());
    }

    // 6. Check if we should use Orchestrator (Phase 3)
    let use_orchestrator = web_search.unwrap_or(false) || (content.len() > 3000 && has_complexity_markers(&content));

    if use_orchestrator {
        match state.orchestrator.get().await {
            Ok(orchestrator) => {
                let provider_clone = llm_provider.clone();
                let chat_id_inner = chat_id.clone();
                let content_inner = content.clone();
                let model_inner = active_model.clone();
                let config_clone = config.clone();
                let token_clone = token.clone();

                info!(chat_id = %chat_id, "Routing request to Orchestrator (multi-agent loop)");
                let cancel_tokens_clone = cancel_tokens.clone();
                tokio::spawn(async move {
                    let result = orchestrator.run_orchestrator_loop(
                        provider_clone,
                        &model_inner,
                        chat_messages,
                        &chat_id_inner,
                        &content_inner,
                        config_clone,
                        token_clone,
                        None,
                    ).await;
                    // Clean up cancellation token on completion
                    let mut tokens = cancel_tokens_clone.lock().await;
                    tokens.remove(&chat_id_inner);
                    if let Err(e) = &result {
                        tracing::error!("Orchestrator error: {:?}", e);
                    }
                });
                return Ok(());
            }
            Err(e) => {
                tracing::warn!("Orchestrator not available: {:?}. Falling back to Runner.", e);
            }
        }
    }
    // Fallback to Runner
    info!(chat_id = %chat_id_clone, "Routing request to standard Agent Chat Runner");
    let runner = Runner::new(
        app.clone(),
        state.tool_registry_v1.clone(),
        state.agent_registry.clone(),
        state.hook_registry.clone(),
        state.tools.clone(),
        state.tool_manager.clone(),
    ).with_db_pool(db.clone());

    let cancel_tokens_runner = cancel_tokens.clone();
    tokio::spawn(async move {
        let result = runner.run(
            &*llm_provider,
            chat_id_clone.clone(),
            active_model,
            chat_messages,
            agent,
            config,
            token,
        ).await;
        // Clean up cancellation token on completion
        let mut tokens = cancel_tokens_runner.lock().await;
        tokens.remove(&chat_id_clone);
        if let Err(e) = result {
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
    state: State<'_, AppState>,
    chat_id: String,
) -> ZenResult<()> {
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
    let validated_path = crate::utils::validate_path(&source_path)?;
    let content = std::fs::read_to_string(&validated_path).map_err(|e| crate::error::ZenError::Custom(format!("Failed to read export file: {}", e)))?;
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

fn has_complexity_markers(content: &str) -> bool {
    // 1. Check for 3 or more code blocks
    let code_block_count = content.matches("```").count() / 2;
    if code_block_count >= 3 {
        return true;
    }

    // 2. Check for complex semantic keywords
    let complex_keywords = [
        "refactor", "architect", "database schema", "system design", 
        "class diagram", "design pattern", "multi-agent", "orchestrate", 
        "performance optimization", "memory leak", "race condition"
    ];
    let lower_content = content.to_lowercase();
    for keyword in complex_keywords.iter() {
        if lower_content.contains(keyword) {
            return true;
        }
    }

    false
}
