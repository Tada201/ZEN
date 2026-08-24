pub(crate) mod engine;
pub(crate) mod extractor;
pub(crate) mod llm;
pub(crate) mod phases;
pub(crate) mod types;

pub(crate) use types::DeepResearchParams;

use serde_json::json;
use tauri::Manager;
use tracing::{error, info};

use crate::agent::event_bus::{AgentEvent, ChatDonePayload};
use crate::db::queries;
use crate::services::agent_context::AgentContext;
use zen_core::ports::EventSink;

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
        max_rounds,
        max_urls_per_round,
        sub_agent_count,
        model_context_window: _,
    } = params;
    info!(chat_id = %chat_id, query = %query, "Starting Iterative Deep Research");

    // Phase 6 seam: acquire the shared context once; every emit below goes
    // through the EventSink port (byte-identical to the former `app.emit`).
    let ctx = app.state::<AgentContext>().inner().clone();
    let events = ctx.events.clone();

    // Helper to emit research step events with phase info.
    // Uses &str ref to avoid capturing String by value (keeps closure Fn, not FnOnce).
    let chat_id_ref: &str = &chat_id;
    let emit_step = move |text: &str, status: &str, msg_id: &str, phase: &str, progress_percent: u8| {
        events.emit(
            "chat:research-step",
            &json!({
                "chat_id": chat_id_ref,
                "message_id": msg_id,
                "text": text,
                "status": status,
                "phase": phase,
                "progress_percent": progress_percent,
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
            error!(
                "Failed to create assistant message for deep research: {}",
                e
            );
            return;
        }
    };
    let message_id = message.id.clone();

    // 2. Run the iterative research engine
    let mut engine = engine::IterativeDeepResearcher::new(
        &app,
        llm_provider,
        &ctx,
        &db,
        &model,
        &config,
        &token,
        &chat_id,
        &message_id,
        &emit_step,
        max_rounds,
        max_urls_per_round,
        sub_agent_count,
    );

    engine.emit_phase("planning", "Validating research scope", "running");
    let scope = engine.assess_scope(&query).await;
    if !scope.clarification_questions.is_empty() {
        let metadata = json!({
            "status": "clarification_required",
            "researchClarification": {
                "originalQuestion": query,
                "questions": scope.clarification_questions,
                "brief": scope.brief,
            },
        });
        let content = "I need a few details before I start the research.";
        let metadata_json = metadata.to_string();
        let _ = queries::update_message(
            &db,
            &queries::UpdateMessage {
                id: &message_id,
                chat_id: &chat_id,
                content,
                is_complete: true,
                metadata: Some(&metadata_json),
                ..Default::default()
            },
        ).await;
        ctx.events.emit("chat:message", &json!({
            "chat_id": chat_id,
            "id": message_id,
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "role": "assistant",
            "kind": "deep_research",
            "content": content,
            "metadata": metadata,
        }));
        emit_chat_done(ctx.events.as_ref(), &chat_id, "clarification_required", Some(message_id.clone()));
        return;
    }
    engine.apply_scope(scope);
    engine.emit_phase("planning", "Research scope confirmed", "completed");

    let result = engine.run(&query).await;

    // 3. Persist research steps to message metadata using the canonical update path.
    //    Periodic checkpointing during the run already saved partial progress;
    //    this final update ensures the complete metadata is saved.
    let steps_json = engine
        .research_steps_events
        .lock()
        .map(|steps| {
            let wrapper = serde_json::json!({
                "researchSteps": steps.as_slice(),
                "researchScope": engine.research_scope.clone(),
                "researchProgress": {
                    "percent": engine.progress_percent.load(std::sync::atomic::Ordering::Relaxed),
                },
            });
            serde_json::to_string(&wrapper).unwrap_or_else(|_| "{}".to_string())
        })
        .unwrap_or_else(|_| "{}".to_string());

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
                    metadata: Some(&steps_json),
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
                emit_step("Failed to save final report", "error", &message_id, "error", 100);
                return;
            }

            // Emit the final report to the chat UI
            ctx.events.emit(
                "chat:message",
                &json!({
                    "chat_id": chat_id,
                    "id": message_id,
                    "timestamp": chrono::Utc::now().to_rfc3339(),
                    "role": "assistant",
                    "kind": "deep_research",
                    "content": final_report.clone(),
                }),
            );

            // Save raw markdown report as a markdown artifact for the frontend viewer
            save_artifact(&db, &chat_id, &message_id, &query, &final_report).await;

            info!("Iterative Deep Research completed");
            emit_chat_done(ctx.events.as_ref(), &chat_id, "complete", Some(message_id.clone()));
        }
        Err(err_msg) => {
            let is_cancelled = token.is_cancelled();
            if is_cancelled {
                info!(chat_id = %chat_id, "Deep Research cancelled by user");
            } else {
                error!("Iterative Deep Research failed: {}", err_msg);
            }

            // Determine the content to save: use evolving report if available,
            // otherwise show a clear status message.
            let (partial, done_reason) = if is_cancelled {
                if engine.evolving_report.is_empty() {
                    (
                        "**Research cancelled.** The research was stopped by user request."
                            .to_string(),
                        "cancelled",
                    )
                } else {
                    (
                        format!(
                            "{}\n\n---\n\n*Research stopped by user request with partial results.*",
                            engine.evolving_report
                        ),
                        "cancelled",
                    )
                }
            } else {
                if engine.evolving_report.is_empty() {
                    (format!("**Research failed:** {}", err_msg), "error")
                } else {
                    (
                        format!(
                            "{}\n\n---\n\n*Research completed with partial results. {}*",
                            engine.evolving_report, err_msg
                        ),
                        "error",
                    )
                }
            };

            let failure_metadata = if done_reason == "cancelled" {
                steps_json.clone()
            } else {
                let mut metadata_value: serde_json::Value =
                    serde_json::from_str(&steps_json).unwrap_or_else(|_| json!({}));
                if let Some(obj) = metadata_value.as_object_mut() {
                    obj.insert("error".to_string(), json!(err_msg));
                    obj.insert("status".to_string(), json!("failed"));
                }
                metadata_value.to_string()
            };

            let _ = queries::update_message(
                &db,
                &queries::UpdateMessage {
                    id: &message_id,
                    chat_id: &chat_id,
                    content: &partial,
                    is_complete: true,
                    metadata: Some(&failure_metadata),
                    ..Default::default()
                },
            )
            .await;

            // Save partial report as artifact so partial results are viewable
            if !engine.evolving_report.is_empty() {
                save_artifact(&db, &chat_id, &message_id, &query, &partial).await;
            }

            ctx.events.emit(
                "chat:message",
                &json!({
                    "chat_id": chat_id,
                    "id": message_id,
                    "timestamp": chrono::Utc::now().to_rfc3339(),
                    "role": "assistant",
                    "kind": "deep_research",
                    "content": partial,
                    "status": if done_reason == "cancelled" { "cancelled" } else { "failed" },
                    "error": if done_reason == "cancelled" { serde_json::Value::Null } else { json!(err_msg) },
                }),
            );
            emit_chat_done(ctx.events.as_ref(), &chat_id, done_reason, Some(message_id.clone()));
        }
    }
}

/// Save a markdown artifact for the frontend viewer.
async fn save_artifact(
    db: &sqlx::SqlitePool,
    chat_id: &str,
    message_id: &str,
    query: &str,
    content: &str,
) {
    info!("Saving markdown research report as artifact...");
    let title = format!("Deep Research: {}", query);
    let _ = queries::upsert_artifact(
        db,
        &crate::db::models::Artifact {
            id: uuid::Uuid::new_v4().to_string(),
            chat_id: chat_id.to_string(),
            message_id: message_id.to_string(),
            artifact_type: "markdown".to_string(),
            title,
            content: content.to_string(),
            language: Some("markdown".to_string()),
            metadata: None,
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        },
    )
    .await;
}

fn emit_chat_done(
    events: &dyn EventSink,
    chat_id: &str,
    reason: &str,
    message_id: Option<String>,
) {
    let event = AgentEvent::ChatDone(ChatDonePayload {
        chat_id: chat_id.to_string(),
        content: None,
        tokens_in: 0,
        tokens_out: 0,
        reason: reason.to_string(),
        done: reason == "complete",
        message_id,
    });
    event.emit_to(events);
}
