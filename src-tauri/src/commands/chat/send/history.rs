//! Step 4: DB history rows → `Vec<ChatMessage>` for the provider.

use super::*;

pub(super) fn to_chat_messages(
    chat_id: &str,
    history: Vec<crate::db::models::Message>,
) -> Vec<ChatMessage> {
    history
        .into_iter()
        .filter_map(|m| {
            let role = m.role;
            let tool_calls = m
                .tool_calls
                .as_deref()
                .and_then(|tc_str| serde_json::from_str(tc_str).ok());
            let reasoning_details = m
                .reasoning_details
                .as_deref()
                .and_then(|rd_str| serde_json::from_str(rd_str).ok());

            if role == "tool" && m.tool_call_id.as_deref().unwrap_or("").is_empty() {
                tracing::warn!(
                    chat_id,
                    message_id = %m.id,
                    "Skipping malformed historical tool message without tool_call_id"
                );
                return None;
            }

            let mut final_content = m.content;
            let mut final_images = m
                .images
                .as_deref()
                .and_then(|img_str| serde_json::from_str::<Vec<String>>(img_str).ok())
                .unwrap_or_default();

            if let Some(ref att_str) = m.attachments {
                if let Ok(atts) = serde_json::from_str::<Vec<crate::db::models::Attachment>>(att_str) {
                    for att in atts {
                        if att.mime_type.starts_with("image/") {
                            if !att.data.is_empty() {
                                final_images.push(att.data.clone());
                            }
                        } else {
                            // Non-image attachments live in the chat attachment
                            // store and are read on demand via the document
                            // tools — do NOT inline their text into the prompt.
                            // A short marker keeps the model aware they exist.
                            // Legacy rows (pre-Phase-3) may still carry
                            // extracted_text; fall back to inlining those so old
                            // chats don't lose content.
                            match att.extracted_text.as_deref() {
                                Some(text) if !att.data.is_empty() => {
                                    final_content
                                        .push_str(&format!("\n\n[Attachment: {}]\n{}", att.name, text));
                                }
                                _ => {
                                    final_content.push_str(&format!(
                                        "\n\n[Attached file: {} — use list_documents / read_document_content to read it]",
                                        att.name
                                    ));
                                }
                            }
                        }
                    }
                }
            }

            let images_opt = if final_images.is_empty() {
                None
            } else {
                Some(final_images)
            };

            Some(ChatMessage {
                role,
                content: final_content,
                reasoning_details,
                images: images_opt,
                tool_calls,
                tool_call_id: m.tool_call_id,
            })
        })
        .collect()
}