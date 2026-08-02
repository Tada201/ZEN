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
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let _start_total = std::time::Instant::now();

            // Initialize MediaService with the resolved app data dir before any command runs.
            if let Err(e) = app.state::<AppState>().media.setup(&app_handle) {
                tracing::warn!(error = %e, "MediaService setup failed. Wallpaper features will be unavailable until restart.");
            }

            // ═══════════════════════════════════════════════════════════════
            // CRITICAL INIT — spawned so the window loads immediately.
            // The BootScreen polls get_init_status() and waits for
            // critical_complete before transitioning to the workspace.
            // ═══════════════════════════════════════════════════════════════
            let critical_handle = app_handle.clone();

            // Prevent early transparency flash: Show the splashscreen window
            // only once it has fully loaded its content and is ready to paint.
            if let Some(splash) = app_handle.get_webview_window("splashscreen") {
                let splash_clone = splash.clone();
                splash.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        // ignore
                    }
                });
                // Once window setup runs, schedule showing the window after a tiny delay
                // to let Webview2 initialize and apply background colors.
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(150)).await;
                    splash_clone.show().ok();
                });
            }

            tauri::async_runtime::spawn(async move {
                let state = critical_handle.state::<AppState>();

                let _start_phase = std::time::Instant::now();

                let app_dir = match critical_handle.path().app_data_dir() {
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

                // Backend logging (instant)
                if let Err(e) =                        crate::services::init_backend_logging(&app_dir) {
                    eprintln!("Warning: Backend logging initialization failed: {}", e);
                }
                state.init_progress.set_status(&critical_handle, "critical.fs", "done", Some(_start_phase.elapsed().as_millis() as u64)).await;
                tracing::info!(
                    elapsed_ms = _start_phase.elapsed().as_millis(),
                    "init.critical.fs: app dir + logging"
                );
                let _start_phase = std::time::Instant::now();

                // SQLite database + migrations (near-instant, ~10ms)
                // Path isolation is handled by the per-channel `identifier` in
                // tauri.conf.json (prod) vs tauri.dev.conf.json (dev), so the
                // same `novus.db` filename lives in separate `app_data_dir`s.
                let db_name = if cfg!(debug_assertions) { "novus-dev.db" } else { "novus.db" };
                let db_path = app_dir.join(db_name);
                let pool = match crate::db::init_pool(&db_path).await {
                    Ok(p) => p,
                    Err(e) => {
                        tracing::error!(error = %e, "Failed to initialize database");
                        eprintln!("FATAL: Failed to initialize database: {}. Application cannot start.", e);
                        return;
                    }
                };
                state.init_progress.set_status(&critical_handle, "critical.db", "done", Some(_start_phase.elapsed().as_millis() as u64)).await;
                tracing::info!(
                    elapsed_ms = _start_phase.elapsed().as_millis(),
                    "init.critical.db: SQLite pool + migrations"
                );
                let _start_phase = std::time::Instant::now();
                state.db.set(pool.clone()).await;
                state.security.set_db_pool(pool.clone()).await;

                // Event bus bridge
                state.agent.event_bus.bridge_to_tauri(critical_handle.clone());

                // Settings service (near-instant)
                state.settings_manager.set_db_pool(pool.clone()).await;
                if let Err(e) = state.settings_manager.load_all().await {
                    tracing::warn!(error = %e, "Failed to load settings from database");
                    eprintln!("Warning: Failed to load settings from database: {}", e);
                }

                // Load skill disabled names from persisted settings
                {
                    let all_settings = state.settings_manager.get_all().await.unwrap_or_default();
                    let disabled: Vec<String> = all_settings
                        .iter()
                        .filter(|(k, v)| {
                            k.starts_with("skill:") && k.ends_with(":enabled") && v.as_str() == "false"
                        })
                        .filter_map(|(k, _)| {
                            k.strip_prefix("skill:")
                                .and_then(|s| s.strip_suffix(":enabled"))
                        })
                        .map(|s| s.to_string())
                        .collect();
                    if !disabled.is_empty() {
                        state.skills_manager.set_disabled_names(disabled).await;
                    }
                }

                // Persisted workspace root
                let persisted_workspace_root = match state.settings_manager.get("workspace.root").await {
                    Ok(Some(value)) if !value.trim().is_empty() => Some(value),
                    Ok(_) => match state.settings_manager.get("workspace_path").await {
                        Ok(Some(value)) if !value.trim().is_empty() => Some(value),
                        Ok(_) => None,
                        Err(e) => {
                            tracing::warn!(error = %e, "Failed to read legacy persisted workspace root");
                            None
                        }
                    },
                    Err(e) => {
                        tracing::warn!(error = %e, "Failed to read persisted workspace root");
                        None
                    }
                };
                if let Some(workspace_root) = persisted_workspace_root {
                    if let Err(e) = state.set_workspace_folder(workspace_root).await {
                        tracing::warn!(
                            error = %e,
                            "Failed to apply persisted workspace root; using default workspace"
                        );
                        eprintln!(
                            "Warning: Failed to apply persisted workspace root: {}",
                            e
                        );
                    }
                }

                // Secret migration
                match state.secret_manager.migrate_plaintext_settings_to_keyring().await {
                    Ok(count) if count > 0 => {
                        tracing::info!(count, "Migrated plaintext secrets to OS keyring");
                    }
                    Ok(_) => {}
                    Err(e) => {
                        tracing::warn!(error = %e, "Secret migration failed");
                    }
                }

                state.init_progress.set_status(&critical_handle, "critical.settings", "done", Some(_start_phase.elapsed().as_millis() as u64)).await;
                tracing::info!(
                    elapsed_ms = _start_phase.elapsed().as_millis(),
                    "init.critical.settings: settings + workspace + secrets"
                );
                let _start_phase = std::time::Instant::now();

                // Tool permissions sync
                {
                    use crate::tools::manager::ToolManager;
                    let all_settings = match state.settings_manager.get_all().await {
                        Ok(s) => s,
                        Err(e) => {
                            tracing::warn!(error = %e, "Failed to read settings for tool permission sync");
                            std::collections::HashMap::new()
                        }
                    };
                    let workspace_root = state.workspace_folder.read().await.clone();
                    let permissions =
                        ToolManager::build_permissions(&all_settings, Some(workspace_root));
                    if let Err(e) = state.tool_manager.update_permissions(permissions).await {
                        tracing::warn!(error = %e, "Initial tool permission install failed");
                    }
                }

                // Document service DB pool (instant)
                state.documents.set_db_pool(pool.clone()).await;

                // Sync external MCP servers from .mcp.json (best-effort).
                // Pass `None` so the boot path stays event-free; the
                // typed settings UI re-triggers with `Some(&app_handle)`
                // when the user adds/removes/edits a row.
                let client = state.mcp_client.clone();
                tokio::spawn(async move {
                    client.sync_external_servers(None).await;
                });

                state.init_progress.set_status(&critical_handle, "critical.finalize", "done", Some(_start_phase.elapsed().as_millis() as u64)).await;
                tracing::info!(
                    elapsed_ms = _start_phase.elapsed().as_millis(),
                    "init.critical.finalize: tools + docs + MCP"
                );

                tracing::info!(
                    elapsed_ms = _start_total.elapsed().as_millis(),
                    "init.critical.total: critical init complete"
                );
            });

            // ═══════════════════════════════════════════════════════════════
            // BACKGROUND INIT — runs after setup() returns, window loads
            // immediately. Speech, TTS, RAG, and Orchestrator initialize
            // here — the app works without them being fully ready.
            // ═══════════════════════════════════════════════════════════════
            let bg_app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _start_bg = std::time::Instant::now();
                let state = bg_app_handle.state::<AppState>();

                // Wait for critical init to finish setting up the DB pool.
                // Previously block_on guaranteed this; now both are spawned.
                let mut waited = 0u32;
                while !state.db.is_initialized().await {
                    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                    waited += 50;
                    if waited > 30_000 {
                        tracing::error!("Background init timed out waiting for DB (30s). Aborting.");
                        return;
                    }
                }
                if waited > 0 {
                    tracing::info!(waited_ms = waited, "Background init waited for critical init to set DB");
                }

                let app_dir = match bg_app_handle.path().app_data_dir() {
                    Ok(d) => d,
                    Err(e) => {
                        tracing::warn!(error = %e, "Background init skipped: no app data dir");
                        return;
                    }
                };
                let resource_dir = bg_app_handle.path().resource_dir().unwrap_or_default();

                // ── Speech service ──
                state.init_progress.set_status(&bg_app_handle, "bg.speech", "running", None).await;
                let _p = std::time::Instant::now();
                let hardware_info = state.hardware.lock().await.get_info().clone();
                let speech_service = crate::services::SpeechService::with_process_manager(
                    &app_dir,
                    &resource_dir,
                    hardware_info,
                    state.process_manager.clone(),
                );
                *state.speech.write().await = Some(speech_service);
                state.init_progress.set_status(&bg_app_handle, "bg.speech", "done", Some(_p.elapsed().as_millis() as u64)).await;
                tracing::info!(
                    elapsed_ms = _p.elapsed().as_millis(),
                    "init.bg.speech"
                );

                // ── TTS service ──
                state.init_progress.set_status(&bg_app_handle, "bg.tts", "running", None).await;
                let _p = std::time::Instant::now();
                let tts_service = crate::services::TtsService::with_process_manager(
                    &app_dir,
                    &resource_dir,
                    state.process_manager.clone(),
                )
                .unwrap_or_else(|e| {
                    tracing::warn!(error = %e, "Failed to initialize TTS service (background)");
                    crate::services::TtsService::new_dummy()
                });
                *state.tts.write().await = Some(tts_service);
                state.init_progress.set_status(&bg_app_handle, "bg.tts", "done", Some(_p.elapsed().as_millis() as u64)).await;
                tracing::info!(
                    elapsed_ms = _p.elapsed().as_millis(),
                    "init.bg.tts"
                );

                // ── RAG: LanceDB vector store ──
                state.init_progress.set_status(&bg_app_handle, "bg.lancedb", "running", None).await;
                let _p = std::time::Instant::now();
                // Same identifier-based isolation as the SQLite DB above.
                let lancedb_name = if cfg!(debug_assertions) { "lancedb-dev" } else { "lancedb" };
                let rag_dir = app_dir.join(lancedb_name);
                let rag_uri = rag_dir.to_string_lossy().to_string();
                let dimension: usize = 768;

                let lance_store = Arc::new(
                    crate::rag::lancedb_store::LanceDbStore::new(
                        rag_uri.clone(),
                        "documents".to_string(),
                        dimension,
                    )
                );

                if let Err(e) = lance_store.init().await {
                    state.init_progress.set_status(&bg_app_handle, "bg.lancedb", "error", Some(_p.elapsed().as_millis() as u64)).await;
                    tracing::warn!(error = %e, "Failed to initialize LanceDB vector store (background)");
                } else {
                    state.rag.set(lance_store.clone() as Arc<dyn crate::rag::VectorStore>).await;
                    state.init_progress.set_status(&bg_app_handle, "bg.lancedb", "done", Some(_p.elapsed().as_millis() as u64)).await;
                    tracing::info!(
                        elapsed_ms = _p.elapsed().as_millis(),
                        path = %rag_dir.display(),
                        "init.bg.lancedb"
                    );

                    // ── Conversation store ──
                    state.init_progress.set_status(&bg_app_handle, "bg.conversation_store", "running", None).await;
                    let _p = std::time::Instant::now();
                    let conversation_store = Arc::new(
                        crate::rag::conversation_store::ConversationStore::new(
                            rag_uri.clone(),
                            "conversation_vectors".to_string(),
                            dimension,
                        )
                    );
                    if let Err(e) = conversation_store.init().await {
                        tracing::warn!(error = %e, "Failed to initialize conversation store (background)");
                        state.init_progress.set_status(&bg_app_handle, "bg.conversation_store", "skipped", Some(_p.elapsed().as_millis() as u64)).await;
                    } else {
                        state.conversation_store.set(conversation_store).await;
                        state.init_progress.set_status(&bg_app_handle, "bg.conversation_store", "done", Some(_p.elapsed().as_millis() as u64)).await;
                        tracing::info!(
                            elapsed_ms = _p.elapsed().as_millis(),
                            "init.bg.conversation_store"
                        );
                    }

                    // ── Ollama embeddings ──
                    state.init_progress.set_status(&bg_app_handle, "bg.rag", "running", None).await;
                    let _p = std::time::Instant::now();
                    match crate::rag::embedding::create_default_ollama_embedding().await {
                        Ok(embed_model) => {
                            state.documents.set_rag_store(
                                lance_store as Arc<dyn crate::rag::VectorStore>,
                                embed_model,
                            ).await;
                            state.init_progress.set_status(&bg_app_handle, "bg.rag", "done", Some(_p.elapsed().as_millis() as u64)).await;
                            tracing::info!(
                                elapsed_ms = _p.elapsed().as_millis(),
                                "init.bg.rag: full RAG pipeline (LanceDB + Ollama)"
                            );
                        }
                        Err(e) => {
                            state.init_progress.set_status(&bg_app_handle, "bg.rag", "skipped", Some(_p.elapsed().as_millis() as u64)).await;
                            tracing::warn!(
                                elapsed_ms = _p.elapsed().as_millis(),
                                error = %e,
                                "init.bg.rag: Ollama not available, documents in SQLite only"
                            );
                        }
                    }
                }

                // ── Orchestrator ──
                state.init_progress.set_status(&bg_app_handle, "bg.orchestrator", "running", None).await;
                let _p = std::time::Instant::now();
                let pool = match state.db().await {
                    Ok(p) => p,
                    Err(e) => {
                        tracing::error!(error = %e, "Orchestrator init skipped: DB not available");
                        return;
                    }
                };
                let orchestrator = crate::agent::orchestrator::Orchestrator::new(
                    bg_app_handle.clone(),
                    state.agent_registry.clone(),
                    state.tool_registry_v1.clone(),
                    state.hook_registry.clone(),
                    state.tools.clone(),
                    state.tool_manager.clone(),
                ).with_db_pool(pool);
                state.orchestrator.set(Arc::new(orchestrator)).await;
                state.init_progress.set_status(&bg_app_handle, "bg.orchestrator", "done", Some(_p.elapsed().as_millis() as u64)).await;
                tracing::info!(
                    elapsed_ms = _p.elapsed().as_millis(),
                    "init.bg.orchestrator"
                );

                // Backend is ready: critical phases are done (set earlier in
                // the critical-init spawn) and bg.orchestrator just
                // completed. Per the canonical Tauri splash contract, signal
                // readiness so the handoff can fire the moment the frontend
                // also calls `set_complete("frontend")`. If frontend already
                // signaled, perform the handoff immediately.
                state.setup_flags.lock().await.backend_ready = true;
                if state.setup_flags.lock().await.both_ready() {
                    crate::commands::system::perform_handoff(&bg_app_handle).await;
                }

                tracing::info!(
                    elapsed_ms = _start_bg.elapsed().as_millis(),
                    "init.bg.total: all background services initialized"
                );
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::get_system_metrics,
            commands::system::get_system_status,
            commands::system::get_init_status,
            commands::system::set_complete,
            commands::system::get_system_stats,
            commands::system::get_hardware_info,
            commands::system::browse_folder,
            commands::terminal::terminal_request_approval,
            commands::terminal::terminal_spawn,
            commands::terminal::terminal_write,
            commands::terminal::terminal_kill,
            commands::terminal::terminal_resize,
            commands::terminal::terminal_read_output,
            commands::workbench::list_workbench_tabs,
            commands::workbench::upsert_workbench_tab,
            commands::workbench::delete_workbench_tab,
            commands::dependency::list_dependency_status,
            commands::dependency::install_managed_dependency,
            commands::document::ingest_document,
            commands::document::list_documents,
            commands::document::list_documents_page,
            commands::document::get_document,
            commands::document::delete_document,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::set_settings,
            commands::settings::get_all_settings,
            commands::settings::discover_models,
            commands::settings::get_all_available_models,
            commands::settings::get_provider_usage,
            commands::settings::test_provider_connection,
            commands::settings::fetch_9router_image_models,
            commands::settings::sync_tool_permissions,
            commands::settings::list_tool_metadata,
            commands::skills::list_skills,
            commands::skills::load_skill,
            commands::skills::set_skill_enabled,
            commands::skills::suggest_slash,
            commands::skills::parse_slash,
            commands::media::set_wallpaper_from_path,
            commands::media::clear_wallpaper,
            commands::media::get_current_wallpaper,
            commands::media::reprocess_video,
            commands::artifacts::list_artifacts_page,
            commands::artifacts::list_chat_artifacts_page,
            commands::chat::create_chat,
            commands::chat::set_chat_workspace,
            commands::chat::get_chats,
            commands::chat::get_chats_page,
            commands::chat::get_messages,
            commands::chat::get_messages_page,
            commands::chat::update_message_steps,
            commands::chat::send_message,
            commands::chat::delete_chat,
            commands::chat::update_chat_title,
            commands::chat::generate_session_title,
            commands::chat::toggle_pin_chat,
            commands::chat::archive_chat,
            commands::chat::unarchive_chat,
            commands::chat::list_archived_chats,
            commands::chat::list_archived_chats_page,
            commands::chat::search_chats,
            commands::chat::list_chat_tags_page,
            commands::chat::list_all_chat_tags_page,
            commands::chat::list_unique_tag_names_page,
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
            commands::chat::export_image_to_workspace,
            commands::chat::import_chat,
            commands::agent::list_agents,
            commands::agent::spawn_agent,
            commands::agent::orchestrator_get_status,
            commands::agent::run_tool_command,
            commands::agent::resolve_tool_approval,
            commands::checkpoint::get_tool_checkpoint,
            commands::checkpoint::undo_tool_call,
            commands::voice::get_whisper_model_status,
            commands::voice::get_whisper_runtime_status,
            commands::voice::download_whisper_model,
            commands::voice::transcribe_audio,
            commands::voice::transcribe_stream,
            commands::voice::speak_text,
            commands::voice::stop_speech,
            commands::voice::list_voice_models,
            commands::voice::add_voice_model,
            commands::voice::set_active_voice_model,
            commands::voice::download_piper_model,
            commands::audio::list_input_devices,
            commands::audio::list_output_devices,
            commands::audio::set_active_output_device,
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
            commands::spatial::get_vessels,
            commands::spatial::get_natural_events,
            commands::spatial::get_undersea_cables,
            commands::spatial::list_map_connectors,
            commands::spatial::list_map_cameras,
            commands::spatial::get_map_camera_catalog,
            commands::spatial::resolve_map_camera_playback,
              commands::spatial::test_map_camera_catalog,
              commands::spatial::import_local_map_camera_catalog,
            commands::spatial::calculate_route,
            commands::spatial::geocode_search,
            commands::spatial::reverse_geocode,
            commands::spatial::create_geofence,
            commands::spatial::list_geofences,
            commands::spatial::remove_geofence,
            commands::spatial::get_fusion_events,
            commands::spatial::compute_navigation_route,
            commands::spatial::get_telemetry_history,
            commands::spatial::get_telemetry_history_page,
            commands::spatial::get_entity_track,
            commands::spatial::get_entity_track_page,
            commands::spatial::get_telemetry_stats,
            commands::spatial::list_geofences_db,
            commands::spatial::list_geofences_db_page,
            commands::spatial::save_geofence_db,
            commands::spatial::delete_geofence_db,
            commands::spatial::list_markers_db,
            commands::spatial::list_markers_db_page,
            commands::spatial::save_marker_db,
            commands::spatial::delete_marker_db,
            commands::spatial::list_geojson_layers_db,
            commands::spatial::list_geojson_layers_db_page,
            commands::spatial::extract_kmz_kml,
            commands::spatial::save_geojson_layer_db,
            commands::spatial::delete_geojson_layer_db,
            commands::spatial::list_favorites_db,
            commands::spatial::save_favorite_db,
            commands::spatial::delete_favorite_db,
            commands::memory::get_conversation_memories,
            commands::memory::clear_conversation_memories,
            commands::memory::list_session_memories_page,
            commands::memory::get_memory_stats,
            commands::mcp::mcp_get_config,
            commands::mcp::mcp_save_config,
            commands::mcp::mcp_list_servers,
            commands::mcp::mcp_add_server,
            commands::mcp::mcp_remove_server,
            commands::mcp::mcp_reconnect,
            commands::context_viewer::get_context_breakdown,
            commands::context_viewer::get_context_snapshot,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("FATAL: Error while running Tauri application: {}", e);
            std::process::exit(1);
        });
}
