//! Manual context-compaction service (`/compact`).
//!
//! Owns the manual compaction workflow so the `compact_chat_context`
//! Tauri command stays a thin adapter:
//!
//! - validate the chat exists,
//! - refuse while a run is still streaming for that chat,
//! - invoke the runner's compaction machinery with the threshold gate
//!   bypassed (`force`), threading the user's optional focus instructions
//!   into the summary prompt,
//! - emit `context:compacted { chatId, messagesSummarized, messagesKept }`
//!   so the frontend can react without polling.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::agent::runner::{RunConfig, Runner};
use crate::commands::AppState;
use crate::db::queries;

pub const CONTEXT_COMPACTED_EVENT: &str = "context:compacted";

/// Number of recent messages the compaction machinery always keeps active.
const COMPACT_KEEP_COUNT: usize = 10;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompactOutcome {
    pub messages_summarized: usize,
    pub messages_kept: usize,
}

pub async fn compact_chat_context(
    app: &AppHandle,
    chat_id: &str,
    instructions: Option<String>,
) -> Result<CompactOutcome, String> {
    let state = app.state::<AppState>();
    let db = state.db().await.map_err(|e| e.to_string())?;

    // Validate the chat exists before doing any work.
    let chat = queries::get_chat(&db, chat_id)
        .await
        .map_err(|_| format!("Chat '{chat_id}' was not found."))?;

    // Refuse while a run is in flight: a streaming turn races the compaction
    // for the same message rows. The map only holds a token between send and
    // completion, so presence == mid-run.
    if state.chat_cancellation_tokens.lock().await.contains_key(chat_id) {
        return Err("A response is still streaming for this chat".to_string());
    }

    // Same config sourcing as the automatic post-turn path: `RunConfig`
    // defaults for the thresholds/budget (the forced path bypasses the gate
    // anyway) plus the persisted summarization-model override.
    let mut config = RunConfig::default();
    if let Ok(Some(val)) = queries::get_setting(&db, "memory.summarization_model").await {
        config.summarization_model = if val.is_empty() { None } else { Some(val) };
    }
    let chat_model = chat
        .model
        .as_deref()
        .map(str::trim)
        .filter(|m| !m.is_empty())
        .map(str::to_string);
    let active_model = match chat_model {
        Some(m) => m,
        None => queries::get_setting(&db, "active_model")
            .await
            .ok()
            .flatten()
            .unwrap_or_default(),
    };

    let instructions = instructions
        .map(|i| i.trim().to_string())
        .filter(|i| !i.is_empty());

    let (messages_summarized, messages_kept) =
        Runner::compact_conversation_now(
            app.clone(),
            db,
            chat_id.to_string(),
            active_model,
            config,
            instructions,
        )
        .await
        .map_err(|e| format!("Compaction failed: {e}"))?;

    if messages_summarized == 0 {
        // Honest failure: nothing was summarized (empty or too-short chat),
        // and no summary row was saved.
        return Err(format!(
            "Nothing to compact — the conversation is empty or shorter than the \
             {COMPACT_KEEP_COUNT} most recent messages that always stay active."
        ));
    }

    let outcome = CompactOutcome {
        messages_summarized,
        messages_kept,
    };
    // The cached breakdown reflects the pre-compaction window; drop it so
    // the badge refetch doesn't serve stale numbers until the next turn.
    state.context_breakdown_cache.write().await.remove(chat_id);
    let _ = app.emit(
        CONTEXT_COMPACTED_EVENT,
        serde_json::json!({
            "chatId": chat_id,
            "messagesSummarized": outcome.messages_summarized,
            "messagesKept": outcome.messages_kept,
        }),
    );
    Ok(outcome)
}
