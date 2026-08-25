//! Step 1: attachment registration + user-message persistence.
//!
//! Non-image attachments are registered into the chat's attachment store so
//! the agent retrieves them ON DEMAND via list/read tools — their text is no
//! longer stuffed into the prompt (wasteful). Images stay inline for the
//! vision path. On registration success the heavy base64/text is stripped
//! from the persisted message row; on failure it is kept so nothing is lost.

use super::*;
use validate::decode_data_url;

pub(super) struct PersistTurnParams<'a> {
    pub app: &'a AppHandle,
    pub documents: &'a crate::services::DocumentService,
    pub db: &'a SqlitePool,
    pub chat_id: &'a str,
    pub content: &'a str,
    pub model: Option<&'a str>,
    pub attachments: Option<Vec<crate::db::models::Attachment>>,
    pub message_kind: Option<&'a str>,
    pub is_regenerate: bool,
}

/// Registers attachments and inserts the user row. Skipped on regenerate —
/// the anchor row already holds this turn's prompt and attachments, and
/// step 2.5 removes its old response.
pub(super) async fn persist_user_turn(params: PersistTurnParams<'_>) -> ZenResult<()> {
    let PersistTurnParams {
        app,
        documents,
        db,
        chat_id,
        content,
        model,
        attachments,
        message_kind,
        is_regenerate,
    } = params;
    let mut attachments = attachments;
    if !is_regenerate {
        if let Some(atts) = attachments.as_mut() {
            if !atts.is_empty() {
                match app.path().app_data_dir() {
                    Ok(dir) => {
                        for att in atts.iter_mut() {
                            if att.mime_type.starts_with("image/") {
                                continue;
                            }
                            let Some(bytes) = decode_data_url(&att.data) else {
                                tracing::warn!(name = %att.name, "Attachment data was not a decodable data URL; leaving inline");
                                continue;
                            };
                            match documents
                                .attach_to_chat(
                                    dir.clone(),
                                    chat_id.to_string(),
                                    att.name.clone(),
                                    bytes,
                                )
                                .await
                            {
                                Ok(_) => {
                                    att.data = String::new();
                                    att.extracted_text = None;
                                }
                                Err(e) => {
                                    tracing::warn!(chat_id, name = %att.name, error = %e, "Failed to register chat attachment; keeping inline text fallback");
                                }
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!(error = %e, "Could not resolve app data dir; attachments left inline");
                    }
                }
            }
        }
    }

    let attachments_json = attachments.as_ref().and_then(|atts| {
        match serde_json::to_string(atts) {
            Ok(json_str) => Some(json_str),
            Err(e) => {
                error!("Failed to serialize attachments: {}", e);
                None
            }
        }
    });

    if !is_regenerate {
        info!(chat_id, "Inserting user message into database");
        queries::add_message(
            db,
            &queries::NewMessage {
                chat_id,
                role: "user",
                content,
                model,
                is_complete: true,
                attachments: attachments_json.as_deref(),
                kind: message_kind,
                ..Default::default()
            },
        )
        .await?;
        info!(chat_id, "User message successfully saved to database");
        let _ = app.emit(
            "chat:status",
            json!({
                "chat_id": chat_id,
                "message": "Message saved",
                "phase": "persisted",
                "iteration": 0
            }),
        );
    }
    Ok(())
}