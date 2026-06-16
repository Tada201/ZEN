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
            &queries::UpdateMessage {
                id: msg_id,
                chat_id: params.chat_id,
                content: params.content,
                is_complete: params.is_complete,
                tokens_in: params.tokens_in,
                tokens_out: params.tokens_out,
                tool_calls: params.tool_calls,
                reasoning_details: params.reasoning_details,
            },
        )
        .await
    } else {
        queries::add_message(
            params.db,
            &queries::NewMessage {
                chat_id: params.chat_id,
                role: "assistant",
                content: params.content,
                model: Some(params.model),
                is_complete: params.is_complete,
                tool_calls: params.tool_calls,
                tokens_in: params.tokens_in,
                tokens_out: params.tokens_out,
                reasoning_details: params.reasoning_details,
                ..Default::default()
            },
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
