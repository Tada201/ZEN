//! Pre-flight validation for `send_message`: chat existence and the
//! READ-ONLY half of the regenerate flow. Nothing here mutates the chat —
//! the destructive truncate lives in `resolve::apply_regenerate_truncate`,
//! so a failure in this stage leaves the previous turn intact.

use super::*;

/// Guard: verify the chat exists before doing any work.
pub(super) async fn ensure_chat_exists(db: &SqlitePool, chat_id: &str) -> ZenResult<()> {
    if queries::get_chat(db, chat_id).await.is_err() {
        return Err(crate::error::ZenError::Custom(format!(
            "Chat session {chat_id} no longer exists."
        )));
    }
    Ok(())
}

/// Step 0.5 — regenerate. `regenerate_from_message_id` anchors on the user
/// turn being re-run. This stage is READ-ONLY validation — the destructive
/// truncate is deferred to step 2.5, after every fallible pre-flight
/// (provider/model resolution, history fetch) has succeeded. A failure
/// below must leave the old turn intact, not truncate it with nothing
/// replacing it. The persisted anchor row and its content are
/// authoritative and get reused.
pub(super) async fn resolve_turn_content(
    db: &SqlitePool,
    chat_id: &str,
    content: String,
    regenerate_from_message_id: Option<&str>,
) -> ZenResult<String> {
    let content = match regenerate_from_message_id {
        Some(anchor_id) => {
            let anchor = queries::get_message_in_chat(db, chat_id, anchor_id)
                .await?
                .filter(|m| m.role == "user")
                .ok_or_else(|| {
                    crate::error::ZenError::Custom(format!(
                        "Cannot regenerate: message {anchor_id} is not a user turn in chat {chat_id}."
                    ))
                })?;
            // Refuse stale anchors: regenerating a turn with newer user turns
            // after it would silently delete those turns and their responses.
            let later_user_turns =
                queries::count_later_user_messages(db, chat_id, anchor_id).await?;
            if later_user_turns > 0 {
                return Err(crate::error::ZenError::Custom(format!(
                    "Cannot regenerate: {later_user_turns} newer turn(s) exist after this message. Reload the chat and regenerate the latest turn."
                )));
            }
            anchor.content
        }
        None => content,
    };
    Ok(content)
}

/// Decode a `data:<mime>;base64,<payload>` URL to raw bytes. Returns None for a
/// non-data-URL or malformed base64 (caller then leaves the attachment inline).
pub(super) fn decode_data_url(data_url: &str) -> Option<Vec<u8>> {
    use base64::Engine;
    let comma = data_url.find(',')?;
    let (header, payload) = data_url.split_at(comma);
    if !header.starts_with("data:") || !header.contains(";base64") {
        return None;
    }
    base64::engine::general_purpose::STANDARD
        .decode(&payload.as_bytes()[1..])
        .ok()
}

#[cfg(test)]
mod tests {
    use super::decode_data_url;

    #[test]
    fn decodes_base64_data_url() {
        // "hi" → aGk=
        let bytes = decode_data_url("data:text/plain;base64,aGk=").unwrap();
        assert_eq!(bytes, b"hi");
    }

    #[test]
    fn rejects_non_data_url() {
        assert!(decode_data_url("https://example.com/x.png").is_none());
        assert!(decode_data_url("data:text/plain,plainnotbase64").is_none());
    }
}