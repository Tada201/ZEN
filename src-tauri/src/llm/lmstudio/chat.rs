use super::ToolCallAccumulator;
use crate::db::models::{ChatMessage, ChatResponse};
use crate::error::{ZenError, ZenResult};
use crate::llm::openai_compat::types::*;
use futures::StreamExt;
use tracing::{debug, error, info};

impl super::LmStudioProvider {
    pub async fn do_chat_stream(
        &self,
        model: &str,
        messages: Vec<ChatMessage>,
        tools: Option<Vec<crate::tools::ToolInfo>>,
        config: crate::llm::ChatRequestConfig,
        on_chunk: Box<dyn Fn(crate::llm::LlmChunk) + Send>,
        token: tokio_util::sync::CancellationToken,
    ) -> ZenResult<ChatResponse> {
        let url = format!("{}/v1/chat/completions", self.base_url);

        let oai_messages: Vec<OpenAiMessage> = messages
            .into_iter()
            .map(|m| {
                let tool_calls_out = m.tool_calls.map(|tcs| {
                    tcs.into_iter()
                        .map(|tc| OpenAiToolCallOut {
                            id: tc.id,
                            call_type: "function".to_string(),
                            function: OpenAiFunctionOut {
                                name: tc.name,
                                arguments: tc.args.to_string(),
                            },
                        })
                        .collect()
                });

                let content =
                    if m.role == "assistant" && m.content.is_empty() && tool_calls_out.is_some() {
                        None
                    } else {
                        Some(OpenAiContent::Text(m.content))
                    };

                OpenAiMessage {
                    role: m.role,
                    content,
                    tool_calls: tool_calls_out,
                    tool_call_id: m.tool_call_id,
                }
            })
            .collect();

        let oai_tools = tools.map(|ts| {
            ts.into_iter()
                .map(|t| {
                    serde_json::json!({
                        "type": "function",
                        "function": {
                            "name": t.name,
                            "description": t.description,
                            "parameters": t.parameters
                        }
                    })
                })
                .collect()
        });

        let request = OpenAiChatRequest {
            model: model.to_string(),
            messages: oai_messages,
            stream: true,
            tools: oai_tools,
            temperature: config.temperature,
            max_tokens: config.max_tokens,
            max_completion_tokens: None,
            top_p: config.top_p,
            presence_penalty: config.presence_penalty,
            frequency_penalty: config.frequency_penalty,
            seed: config.seed,
            stop: config.stop,
            response_format: None,
            reasoning_effort: None,
        };

        info!(model = model, "LM Studio chat stream starting");

        let resp = self.client.post(&url).json(&request).send().await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "LM Studio chat request failed");
            return Err(ZenError::Custom(format!(
                "LM Studio returned {}: {}",
                status, body
            )));
        }

        let mut full_content = String::new();
        let mut results_tool_calls: Vec<ToolCallAccumulator> = Vec::new();
        let mut tokens_in: Option<i64> = None;
        let mut tokens_out: Option<i64> = None;
        let mut stream = resp.bytes_stream();
        let mut byte_buffer: Vec<u8> = Vec::new();

        while let Some(chunk_result) = tokio::select! {
            res = stream.next() => res,
            _ = token.cancelled() => {
                debug!("LM Studio stream cancelled by client via select!");
                None
            }
        } {
            if token.is_cancelled() {
                debug!("LM Studio stream cancelled by client");
                break;
            }
            let bytes = chunk_result.map_err(ZenError::Http)?;
            byte_buffer.extend_from_slice(&bytes);

            while let Some(newline_pos) = byte_buffer.iter().position(|&b| b == b'\n') {
                let line_bytes = &byte_buffer[..newline_pos];
                let line = match std::str::from_utf8(line_bytes) {
                    Ok(s) => s.trim().to_string(),
                    Err(e) => {
                        let valid_up_to = e.valid_up_to();
                        std::str::from_utf8(&line_bytes[..valid_up_to])
                            .unwrap_or("")
                            .trim()
                            .to_string()
                    }
                };
                byte_buffer.drain(..=newline_pos);

                if line.is_empty() || !line.starts_with("data: ") {
                    continue;
                }

                let json_str = &line[6..];
                if json_str == "[DONE]" {
                    debug!("LM Studio stream complete");
                    continue;
                }

                match serde_json::from_str::<OpenAiStreamChunk>(json_str) {
                    Ok(chunk) => {
                        for choice in &chunk.choices {
                            if let Some(content) = &choice.delta.content {
                                if !content.is_empty() {
                                    on_chunk(crate::llm::LlmChunk::Text(content.clone()));
                                    full_content.push_str(content);
                                }
                            }
                            if let Some(deltas) = &choice.delta.tool_calls {
                                for delta in deltas {
                                    let idx = delta.index.unwrap_or(0);
                                    while results_tool_calls.len() <= idx {
                                        results_tool_calls.push(ToolCallAccumulator::default());
                                    }
                                    let acc = &mut results_tool_calls[idx];
                                    if let Some(id) = &delta.id {
                                        acc.id.push_str(id);
                                    }
                                    if let Some(func) = &delta.function {
                                        if let Some(name) = &func.name {
                                            acc.name.push_str(name);
                                        }
                                        if let Some(args) = &func.arguments {
                                            acc.arguments.push_str(args);
                                        }
                                    }
                                }
                            }
                        }
                        if let Some(usage) = &chunk.usage {
                            tokens_in = usage.prompt_tokens;
                            tokens_out = usage.completion_tokens;
                        }
                    }
                    Err(e) => {
                        debug!(json = %json_str, error = %e, "Failed to parse LM Studio SSE chunk");
                    }
                }
            }
        }

        let final_tool_calls = if results_tool_calls.is_empty() {
            None
        } else {
            let mut tcs = Vec::new();
            for acc in results_tool_calls {
                if !acc.name.is_empty() {
                    let tool_name = acc.name.clone();
                    tcs.push(crate::db::models::ToolCall {
                        id: if acc.id.is_empty() {
                            format!("call_{}", uuid::Uuid::new_v4())
                        } else {
                            acc.id
                        },
                        name: acc.name,
                        args: match serde_json::from_str(&acc.arguments) {
                            Ok(args) => args,
                            Err(e) => {
                                tracing::warn!(
                                    tool = %tool_name,
                                    raw_args = %acc.arguments,
                                    error = %e,
                                    "Malformed tool call arguments, falling back to empty JSON"
                                );
                                serde_json::json!({})
                            }
                        },
                    });
                }
            }
            if tcs.is_empty() {
                None
            } else {
                Some(tcs)
            }
        };

        Ok(ChatResponse {
            content: full_content,
            model: model.to_string(),
            tokens_in,
            tokens_out,
            tool_calls: final_tool_calls,
            done: true,
        })
    }

    pub async fn do_embed(&self, model: &str, text: &str) -> ZenResult<Vec<f32>> {
        let url = format!("{}/v1/embeddings", self.base_url);
        let request = OpenAiEmbedRequest {
            model: model.to_string(),
            input: text.to_string(),
        };

        let resp = self.client.post(&url).json(&request).send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(ZenError::Custom(format!(
                "LM Studio embedding failed ({}): {}",
                status, body
            )));
        }

        let body: OpenAiEmbedResponse = resp.json().await?;
        body.data
            .into_iter()
            .next()
            .map(|d| d.embedding)
            .ok_or_else(|| ZenError::Custom("No embedding returned".into()))
    }
}
