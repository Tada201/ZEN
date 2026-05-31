use crate::db::queries;
use sqlx::SqlitePool;

pub(super) struct AssistantMessageSave<'a> {
    pub db: &'a SqlitePool,
    pub chat_id: &'a str,
    pub model: &'a str,
    pub message_id: &'a mut Option<String>,
    pub content: &'a str,
    pub is_complete: bool,
    pub tokens_in: Option<i64>,
    pub tokens_out: Option<i64>,
    pub tool_calls: Option<&'a str>,
    pub reasoning_details: Option<&'a str>,
    pub error_context: &'static str,
}

pub(super) async fn save_assistant_message(params: AssistantMessageSave<'_>) -> bool {
    let save_res = if let Some(ref msg_id) = params.message_id {
        queries::update_message(
            params.db,
            msg_id,
            params.chat_id,
            params.content,
            params.is_complete,
            params.tokens_in,
            params.tokens_out,
            params.tool_calls,
            params.reasoning_details,
        )
        .await
    } else {
        queries::add_message(
            params.db,
            params.chat_id,
            None,
            "assistant",
            params.content,
            Some(params.model),
            params.is_complete,
            params.tool_calls,
            None,
            None,
            None,
            params.tokens_in,
            params.tokens_out,
            None,
            None,
            params.reasoning_details,
        )
        .await
        .map(|msg| {
            *params.message_id = Some(msg.id);
        })
    };

    if let Err(e) = save_res {
        tracing::error!("{}: {:?}", params.error_context, e);
        false
    } else {
        true
    }
}
