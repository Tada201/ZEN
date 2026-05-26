extern crate pdf_inspector;

pub mod agent;
pub mod canvas;
pub mod commands;
pub mod db;
pub mod error;
pub mod llm;
pub mod mcp;
pub mod models;
pub mod rag;
pub mod search;
pub mod services;
pub mod terminal;
pub mod tools;
pub mod utils;
pub mod workspace;

use crate::rag::VectorStore;
use commands::AppState;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Initialize database in a blocking task to avoid blocking the main thread
            tauri::async_runtime::block_on(async move {
                let app_dir = match app_handle.path().app_data_dir() {
                    Ok(dir) => dir,
                    Err(e) => {
                        eprintln!("FATAL: Failed to get app data directory: {}. Application cannot start.", e);
                        return;
                    }
                };
                if !app_dir.exists() {
                    if let Err(e) = std::fs::create_dir_all(&app_dir) {
                        eprintln!("FATAL: Failed to create app data directory: {}. Application cannot start.", e);
                        return;
                    }
                }

                match crate::services::init_backend_logging(&app_dir) {
                    Ok(log_dir) => {
                        tracing::info!(log_dir = %log_dir.display(), "Backend logging initialized");
                    }
                    Err(e) => {
                        eprintln!("Warning: Backend logging initialization failed: {}", e);
                    }
                }

                let db_path = app_dir.join("novus.db");
                let pool = match crate::db::init_pool(&db_path).await {
                    Ok(p) => p,
                    Err(e) => {
                        tracing::error!(error = %e, "Failed to initialize database");
                        eprintln!("FATAL: Failed to initialize database: {}. Application cannot start.", e);
                        return;
                    }
                };

                let state = app_handle.state::<AppState>();
                state.db.set(pool.clone()).await;
                state.security.set_db_pool(pool.clone()).await;

                // Start bridging EventBus events to the Tauri frontend
                state.agent.event_bus.bridge_to_tauri(app_handle.clone());

                // Initialize settings service with the database pool
                state.settings_manager.set_db_pool(pool.clone()).await;
                if let Err(e) = state.settings_manager.load_all().await {
                    tracing::warn!(error = %e, "Failed to load settings from database");
                    eprintln!("Warning: Failed to load settings from database: {}", e);
                }

                // Auto-sync tool permissions from loaded settings into ToolManager
                {
                    use crate::tools::manager::ToolManager;
                    let all_settings = match state.settings_manager.get_all().await {
                        Ok(s) => s,
                        Err(e) => {
                            tracing::warn!(error = %e, "Failed to read settings for tool permission sync");
                            eprintln!("Warning: Failed to read settings for tool permission sync: {}", e);
                            std::collections::HashMap::new()
                        }
                    };
                    let permissions = ToolManager::build_permissions(&all_settings);
                    state.tool_manager.update_permissions(permissions);
                }

                // Initialize Speech service
                let resource_dir = app_handle.path().resource_dir().unwrap_or_default();
                let hardware_info = state.hardware.lock().await.get_info().clone();
                let speech_service = crate::services::SpeechService::new(&app_dir, &resource_dir, hardware_info);
                let mut speech_write = state.speech.write().await;
                *speech_write = Some(speech_service);
                drop(speech_write);

                // Initialize TTS service
                let tts_service = crate::services::TtsService::new(&app_dir, &resource_dir).unwrap_or_else(|e| {
                    tracing::warn!(error = %e, "Failed to initialize TTS service");
                    eprintln!("Warning: Failed to initialize TTS service: {}", e);
                    crate::services::TtsService::new_dummy()
                });
                let mut tts_write = state.tts.write().await;
                *tts_write = Some(tts_service);
                drop(tts_write);

                // Initialize document service with the database pool
                state.documents.set_db_pool(pool.clone()).await;

                // Initialize RAG (LanceDB vector store + Ollama embeddings) for document indexing
                let rag_dir = app_dir.join("lancedb");
                let rag_uri = rag_dir.to_string_lossy().to_string();
                let collection_name = "documents".to_string();
                let dimension: usize = 768; // nomic-embed-text dimension

                let lance_store = Arc::new(
                    crate::rag::lancedb_store::LanceDbStore::new(
                        rag_uri.clone(),
                        collection_name,
                        dimension,
                    )
                );

                // Initialize the LanceDB table
                if let Err(e) = lance_store.init().await {
                    tracing::warn!(error = %e, "Failed to initialize LanceDB vector store");
                    eprintln!("Warning: Failed to initialize LanceDB vector store: {}", e);
                } else {
                    // Store the vector store in app state
                    state.rag.set(lance_store.clone() as Arc<dyn crate::rag::VectorStore>).await;
                    tracing::info!(path = %rag_dir.display(), "LanceDB vector store initialized");
                    eprintln!("LanceDB vector store initialized at: {}", rag_dir.display());

                    // Initialize and store Conversation Store
                    let conversation_store = Arc::new(
                        crate::rag::conversation_store::ConversationStore::new(
                            rag_uri.clone(),
                            "conversation_vectors".to_string(),
                            dimension,
                        )
                    );
                    if let Err(e) = conversation_store.init().await {
                        tracing::warn!(error = %e, "Failed to initialize LanceDB conversation vector store");
                        eprintln!("Warning: Failed to initialize LanceDB conversation vector store: {}", e);
                    } else {
                        state.conversation_store.set(conversation_store).await;
                        tracing::info!("LanceDB conversation vector store initialized");
                        eprintln!("LanceDB conversation vector store initialized.");
                    }

                    // Try to initialize Ollama embeddings
                    match crate::rag::embedding::create_default_ollama_embedding().await {
                        Ok(embed_model) => {
                            state.documents.set_rag_store(
                                lance_store as Arc<dyn crate::rag::VectorStore>,
                                embed_model,
                            ).await;
                            tracing::info!("Document service RAG pipeline initialized");
                            eprintln!("Document service: Full RAG pipeline initialized (LanceDB + Ollama embeddings)");
                        }
                        Err(e) => {
                            tracing::warn!(error = %e, "Document service RAG store initialized without Ollama embeddings");
                            eprintln!("Document service: RAG store initialized, but Ollama not available ({}). Documents will be stored in SQLite only.", e);
                        }
                    }
                }

                // Initialize Orchestrator with AppHandle
                let orchestrator = crate::agent::orchestrator::Orchestrator::new(
                    app_handle.clone(),
                    state.agent_registry.clone(),
                    state.tool_registry_v1.clone(),
                    state.hook_registry.clone(),
                    state.tools.clone(),
                    state.tool_manager.clone(),
                ).with_db_pool(pool);

                // Pass live AppHandle into the McpServer
                {
                    let mut mcp_guard = state.mcp_server.write().await;
                    mcp_guard.set_app_handle(app_handle.clone());
                    mcp_guard.set_tool_service(state.tool_service.clone());
                }

                state.orchestrator.set(Arc::new(orchestrator)).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::get_system_metrics,
            commands::system::get_system_status,
            commands::system::get_system_stats,
            commands::system::get_hardware_info,
            commands::system::browse_folder,
            commands::terminal::terminal_spawn,
            commands::terminal::terminal_write,
            commands::terminal::terminal_kill,
            commands::terminal::terminal_resize,
            commands::document::ingest_document,
            commands::document::list_documents,
            commands::document::get_document,
            commands::document::delete_document,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::set_settings,
            commands::settings::get_all_settings,
            commands::settings::discover_models,
            commands::settings::get_all_available_models,
            commands::settings::test_provider_connection,
            commands::settings::sync_tool_permissions,
            commands::settings::list_tool_metadata,
            commands::chat::create_chat,
            commands::chat::get_chats,
            commands::chat::get_messages,
            commands::chat::send_message,
            commands::chat::delete_chat,
            commands::chat::update_chat_title,
            commands::chat::toggle_pin_chat,
            commands::chat::archive_chat,
            commands::chat::unarchive_chat,
            commands::chat::list_archived_chats,
            commands::chat::search_chats,
            commands::chat::bulk_delete_chats,
            commands::chat::create_chat_folder,
            commands::chat::list_chat_folders,
            commands::chat::move_chat_to_folder,
            commands::chat::delete_chat_folder,
            commands::chat::update_chat_folder,
            commands::chat::remove_chat_from_folder,
            commands::chat::bulk_archive_chats,
            commands::chat::fork_chat,
            commands::chat::abort_chat,
            commands::chat::export_chat,
            commands::chat::import_chat,
            commands::agent::list_agents,
            commands::agent::list_agents_with_configs,
            commands::agent::spawn_agent,
            commands::agent::swarm_get_all_metrics,
            commands::agent::swarm_scale_agents,
            commands::agent::orchestrator_get_status,
            commands::agent::run_tool_command,
            commands::agent::resolve_tool_approval,
            commands::voice::download_whisper_model,
            commands::voice::transcribe_audio,
            commands::voice::transcribe_stream,
            commands::voice::speak_text,
            commands::voice::stop_speech,
            commands::voice::list_voice_models,
            commands::voice::add_voice_model,
            commands::canvas::get_canvas_summary,
            commands::canvas::get_canvas_screenshot_base64,
            commands::canvas::validate_canvas_layout,
            commands::canvas::auto_fix_canvas_layout,
            commands::canvas::get_geometry_context,
            commands::canvas::resolve_anchor,
            commands::canvas::compile_anchor_draw_command,
            commands::canvas::plot_mathematical,
            commands::canvas::create_graph_session,
            commands::canvas::apply_session_action,
            commands::canvas::get_session_state,
            commands::canvas::rollback_session,
            commands::canvas::load_graph_sessions_from_db,
            commands::canvas::save_drawing_canvas_to_db,
            commands::canvas::load_drawing_canvas_from_db,
            commands::spatial::get_satellites,
            commands::spatial::get_flights,
            commands::spatial::get_earthquakes,
            commands::spatial::get_weather,
            commands::spatial::get_weather_grid,
            commands::spatial::get_military_aircraft,
            commands::spatial::calculate_route,
            commands::spatial::geocode_search,
            commands::spatial::reverse_geocode,
            commands::spatial::create_geofence,
            commands::spatial::list_geofences,
            commands::spatial::remove_geofence,
            commands::spatial::get_fusion_events,
            commands::spatial::compute_navigation_route,
            commands::spatial::get_telemetry_history,
            commands::spatial::get_entity_track,
            commands::spatial::get_telemetry_stats,
            commands::spatial::list_geofences_db,
            commands::spatial::save_geofence_db,
            commands::spatial::delete_geofence_db,
            commands::spatial::list_markers_db,
            commands::spatial::save_marker_db,
            commands::spatial::delete_marker_db,
            commands::memory::get_conversation_memories,
            commands::memory::clear_conversation_memories,
            commands::memory::get_memory_stats,
            commands::mcp::mcp_get_config,
            commands::mcp::mcp_save_config,
            commands::mcp::mcp_get_status,
            commands::mcp::mcp_start_server,
            commands::mcp::mcp_stop_server,
            commands::mcp::mcp_list_tools,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("FATAL: Error while running Tauri application: {}", e);
            std::process::exit(1);
        });
}
