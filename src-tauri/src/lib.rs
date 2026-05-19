extern crate pdf_inspector;

pub mod error;
pub mod models;
pub mod db;
pub mod rag;
pub mod llm;
pub mod agent;
pub mod tools;
pub mod services;
pub mod commands;
pub mod mcp;
pub mod canvas;
pub mod terminal;
pub mod workspace;
pub mod search;

use commands::AppState;
use tauri::Manager;
use std::sync::Arc;
use crate::rag::VectorStore;

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

                let db_path = app_dir.join("novus.db");
                let pool = match crate::db::init_pool(&db_path).await {
                    Ok(p) => p,
                    Err(e) => {
                        eprintln!("FATAL: Failed to initialize database: {}. Application cannot start.", e);
                        return;
                    }
                };
                
                let state = app_handle.state::<AppState>();
                state.db.set(pool.clone()).await;

                // Start bridging EventBus events to the Tauri frontend
                state.agent.event_bus.bridge_to_tauri(app_handle.clone());

                // Initialize settings service with the database pool
                state.settings_manager.set_db_pool(pool.clone()).await;
                if let Err(e) = state.settings_manager.load_all().await {
                    eprintln!("Warning: Failed to load settings from database: {}", e);
                }

                // Auto-sync tool permissions from loaded settings into ToolManager
                {
                    use crate::tools::manager::ToolManager;
                    let all_settings = match state.settings_manager.get_all().await {
                        Ok(s) => s,
                        Err(e) => {
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
                        rag_uri,
                        collection_name,
                        dimension,
                    )
                );

                // Initialize the LanceDB table
                if let Err(e) = lance_store.init().await {
                    eprintln!("Warning: Failed to initialize LanceDB vector store: {}", e);
                } else {
                    // Store the vector store in app state
                state.rag.set(lance_store.clone() as Arc<dyn crate::rag::VectorStore>).await;
                eprintln!("LanceDB vector store initialized at: {}", rag_dir.display());

                    // Try to initialize Ollama embeddings
                    match crate::rag::embedding::create_default_ollama_embedding().await {
                        Ok(embed_model) => {
                            state.documents.set_rag_store(
                                lance_store as Arc<dyn crate::rag::VectorStore>,
                                embed_model,
                            ).await;
                            eprintln!("Document service: Full RAG pipeline initialized (LanceDB + Ollama embeddings)");
                        }
                        Err(e) => {
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
                    state.agent.event_bus.clone(),
                    state.memory_backend.clone(),
                ).with_db_pool(pool);

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
            commands::settings::get_all_settings,
            commands::settings::discover_models,
            commands::settings::get_all_available_models,
            commands::settings::test_provider_connection,
            commands::settings::sync_tool_permissions,
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
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("FATAL: Error while running Tauri application: {}", e);
            std::process::exit(1);
        });
}
