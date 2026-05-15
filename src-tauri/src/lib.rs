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
use sqlx::sqlite::SqlitePoolOptions;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            // Initialize database in a blocking task to avoid blocking the main thread
            tauri::async_runtime::block_on(async move {
                let app_dir = app_handle.path().app_data_dir().expect("failed to get app data dir");
                if !app_dir.exists() {
                    std::fs::create_dir_all(&app_dir).expect("failed to create app data dir");
                }
                
                let db_path = app_dir.join("novus.db");
                let db_url = format!("sqlite:{}?mode=rwc", db_path.display());
                
                let pool = SqlitePoolOptions::new()
                    .max_connections(5)
                    .connect(&db_url)
                    .await
                    .expect("failed to connect to sqlite");
                
                sqlx::migrate!("./migrations")
                    .run(&pool)
                    .await
                    .expect("failed to run migrations");
                
                let state = app_handle.state::<AppState>();
                let mut db_lock = state.db.write().await;
                *db_lock = Some(pool.clone());

                // Initialize Orchestrator with AppHandle
                let orchestrator = crate::agent::orchestrator::Orchestrator::new(
                    app_handle.clone(),
                    state.agent_registry.clone(),
                    state.tool_registry_v1.clone(),
                    state.hook_registry.clone(),
                    state.tools.clone(),
                    state.agent.event_bus.clone(),
                    state.memory_backend.clone(),
                ).with_db_pool(pool);
                
                let mut orch_lock = state.orchestrator.write().await;
                *orch_lock = Some(Arc::new(orchestrator));
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::get_system_metrics,
            commands::system::get_system_status,
            commands::system::get_system_stats,
            commands::system::get_hardware_info,
            commands::terminal::terminal_spawn,
            commands::terminal::terminal_write,
            commands::terminal::terminal_kill,
            commands::terminal::terminal_resize,
            commands::document::ingest_document,
            commands::document::list_documents,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::get_all_settings,
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
            commands::agent::swarm_get_all_metrics,
            commands::agent::swarm_scale_agents,
            commands::agent::orchestrator_get_status,
            commands::agent::discover_models,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
