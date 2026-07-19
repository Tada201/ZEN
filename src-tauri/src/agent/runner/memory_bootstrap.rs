use super::config::RunConfig;
use crate::db::models::ChatMessage;
use crate::db::queries;
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};

pub(super) struct MemoryRunSettings {
    pub run_config: RunConfig,
    pub summarization_enabled: bool,
    pub semantic_recall_enabled: bool,
    pub max_recalled_messages: usize,
    pub drift_detection_enabled: bool,
}

pub(super) async fn load_memory_run_settings(
    db_pool: Option<&SqlitePool>,
    base_config: &RunConfig,
) -> MemoryRunSettings {
    let mut run_config = base_config.clone();
    let mut summarization_enabled = true;
    let mut semantic_recall_enabled = true;
    let mut max_recalled_messages = 5;
    let mut drift_detection_enabled = true;

    if let Some(db) = db_pool {
        let (
            r_summ_enabled,
            r_summ_model,
            r_recall_enabled,
            r_recall_max,
            r_drift_enabled,
            r_drift_threshold,
        ) = tokio::join!(
            queries::get_setting(db, "memory.summarization_enabled"),
            queries::get_setting(db, "memory.summarization_model"),
            queries::get_setting(db, "memory.semantic_recall_enabled"),
            queries::get_setting(db, "memory.max_recalled_messages"),
            queries::get_setting(db, "memory.drift_detection_enabled"),
            queries::get_setting(db, "memory.drift_threshold"),
        );

        if let Ok(Some(val)) = r_summ_enabled {
            summarization_enabled = val != "false";
        }
        if let Ok(Some(val)) = r_summ_model {
            run_config.summarization_model = if val.is_empty() { None } else { Some(val) };
        }
        if let Ok(Some(val)) = r_recall_enabled {
            semantic_recall_enabled = val != "false";
        }
        if let Ok(Some(val)) = r_recall_max {
            if let Ok(p) = val.parse::<usize>() {
                max_recalled_messages = p;
            }
        }
        if let Ok(Some(val)) = r_drift_enabled {
            drift_detection_enabled = val != "false";
        }
        if let Ok(Some(val)) = r_drift_threshold {
            if let Ok(p) = val.parse::<f32>() {
                run_config.drift_threshold = p;
            }
        }
    }

    MemoryRunSettings {
        run_config,
        summarization_enabled,
        semantic_recall_enabled,
        max_recalled_messages,
        drift_detection_enabled,
    }
}

pub(super) async fn load_initial_conversation(
    db_pool: Option<&SqlitePool>,
    chat_id: &str,
    messages: Vec<ChatMessage>,
) -> Vec<ChatMessage> {
    if !messages.is_empty() {
        return messages;
    }

    let Some(db) = db_pool else {
        return messages;
    };

    match queries::get_active_messages(db, chat_id).await {
        Ok(db_msgs) if !db_msgs.is_empty() => db_msgs
            .into_iter()
            .map(|m| ChatMessage {
                role: m.role,
                content: m.content,
                reasoning_details: None,
                images: None,
                tool_calls: m
                    .tool_calls
                    .and_then(|tc_str| serde_json::from_str(&tc_str).ok()),
                tool_call_id: m.tool_call_id,
            })
            .collect(),
        _ => messages,
    }
}

pub(super) async fn cached_recall_context(
    app: &AppHandle,
    chat_id: &str,
    enabled: bool,
) -> Option<String> {
    if !enabled {
        return None;
    }

    let state = app.try_state::<crate::commands::AppState>()?;
    let Ok(guard) = state.recall_cache.try_lock() else {
        tracing::debug!(chat_id = %chat_id, "Recall cache busy; skipping recall on TTFT path");
        return None;
    };
    guard.get(chat_id).map(|(block, _)| block.clone())
}
