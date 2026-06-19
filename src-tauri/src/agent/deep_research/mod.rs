pub(crate) mod engine;
pub(crate) mod extractor;
pub(crate) mod llm;
pub(crate) mod phases;
pub(crate) mod types;

pub(crate) use types::DeepResearchParams;

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use tracing::{error, info};

use crate::agent::event_bus::{AgentEvent, ChatDonePayload};
use crate::db::queries;

/// Run the iterative deep research pipeline.
///
/// Creates an assistant message in the DB, executes the multi-round research
/// loop, saves the final report, and saves a markdown artifact for the frontend viewer.
pub async fn run_deep_research(params: DeepResearchParams<'_>) {
    let DeepResearchParams {
        app,
        db,
        llm_provider,
        chat_id,
        model,
        query,
        config,
        token,
    } = params;
    info!(chat_id = %chat_id, query = %query, "Starting Iterative Deep Research");

    // Helper to emit research step events with phase info.
    // Uses &str ref to avoid capturing String by value (keeps closure Fn, not FnOnce).
    let chat_id_ref: &str = &chat_id;
    let emit_step = |text: &str, status: &str, msg_id: &str, phase: &str| {
        let _ = app.emit(
            "chat:research-step",
            json!({
                "chat_id": chat_id_ref,
                "message_id": msg_id,
                "text": text,
                "status": status,
                "phase": phase,
            }),
        );
    };

    // 1. Create placeholder assistant message in DB
    let message = match queries::add_message(
        &db,
        &queries::NewMessage {
            chat_id: &chat_id,
            role: "assistant",
            model: Some(&model),
            is_complete: false,
            kind: Some("deep_research"),
            ..Default::default()
        },
    )
    .await
    {
        Ok(msg) => msg,
        Err(e) => {
            error!("Failed to create assistant message for deep research: {}", e);
            return;
        }
    };
    let message_id = message.id.clone();

    // 2. Run the iterative research engine
    let state = app.state::<crate::commands::AppState>();
    let mut engine = engine::IterativeDeepResearcher::new(
        &app,
        llm_provider,
        &state,
        &model,
        &config,
        &token,
        &chat_id,
        &message_id,
        &emit_step,
    );

    let result = engine.run(&query).await;

    // 3. Persist research steps to message metadata so the state survives
    //    page refresh during long research sessions.
    //    Uses a raw SQL UPDATE since UpdateMessage doesn't have metadata.
    {
        let steps_json = engine.research_steps_events.lock()
            .map(|steps| {
                let wrapper = serde_json::json!({"researchSteps": steps.as_slice()});
                serde_json::to_string(&wrapper)
                    .unwrap_or_else(|_| "{}".to_string())
            })
            .unwrap_or_else(|_| "{}".to_string());
        let _ = sqlx::query("UPDATE messages SET metadata = ? WHERE id = ?")
            .bind(&steps_json)
            .bind(&message_id)
            .execute(&db)
            .await;
    }

    // 4. Write final report to DB and emit
    match result {
        Ok(final_report) => {
            // Save final text report to DB
            if let Err(e) = queries::update_message(
                &db,
                &queries::UpdateMessage {
                    id: &message_id,
                    chat_id: &chat_id,
                    content: &final_report,
                    is_complete: true,
                    ..Default::default()
                },
            )
            .await
            {
                error!(
                    message_id = %message_id,
                    chat_id = %chat_id,
                    error = %e,
                    "Failed to finalize deep research message"
                );
                emit_step("Failed to save final report", "error", &message_id, "error");
                return;
            }

            // Emit the final report to the chat UI
            let _ = app.emit(
                "chat:message",
                json!({
                    "chat_id": chat_id,
                    "id": message_id,
                    "timestamp": chrono::Utc::now().to_rfc3339(),
                    "role": "assistant",
                    "kind": "deep_research",
                    "content": final_report.clone(),
                }),
            );

            // Save raw markdown report as a markdown artifact for the frontend viewer
            info!("Saving markdown research report as artifact...");
            let title = format!("Deep Research: {}", query);
            let _ = queries::upsert_artifact(
                &db,
                &crate::db::models::Artifact {
                    id: uuid::Uuid::new_v4().to_string(),
                    chat_id: chat_id.clone(),
                    message_id: message_id.clone(),
                    artifact_type: "markdown".to_string(),
                    title,
                    content: final_report,
                    language: Some("markdown".to_string()),
                    metadata: None,
                    created_at: chrono::Utc::now().to_rfc3339(),
                    updated_at: chrono::Utc::now().to_rfc3339(),
                },
            )
            .await;

            info!("Iterative Deep Research completed");
            emit_chat_done(&app, &chat_id, "complete");
        }
        Err(err_msg) => {
            error!("Iterative Deep Research failed: {}", err_msg);
            let partial = if engine.evolving_report.is_empty() {
                format!("**Research failed:** {}", err_msg)
            } else {
                format!(
                    "{}\n\n---\n\n*Research completed with partial results. {}*",
                    engine.evolving_report, err_msg
                )
            };
            let _ = queries::update_message(
                &db,
                &queries::UpdateMessage {
                    id: &message_id,
                    chat_id: &chat_id,
                    content: &partial,
                    is_complete: true,
                    ..Default::default()
                },
            )
            .await;
            let _ = app.emit(
                "chat:message",
                json!({
                    "chat_id": chat_id,
                    "id": message_id,
                    "timestamp": chrono::Utc::now().to_rfc3339(),
                    "role": "assistant",
                    "kind": "deep_research",
                    "content": partial,
                }),
            );
            emit_chat_done(&app, &chat_id, "error");
        }
    }
}

fn emit_chat_done(app: &AppHandle, chat_id: &str, reason: &str) {
    let event = AgentEvent::ChatDone(ChatDonePayload {
        chat_id: chat_id.to_string(),
        content: None,
        tokens_in: 0,
        tokens_out: 0,
        reason: reason.to_string(),
        done: reason == "complete",
    });
    event.emit_via(app, &None);
}
