//! Request construction, response mapping and SSE consumption for the
//! Anthropic Messages API. Bodies moved verbatim from the former trait impl
//! (`self` renamed to `me`) during the Phase 7 file-split.

use futures::StreamExt;
use serde::Deserialize;
use tracing::{debug, error, info};

use super::AnthropicProvider;
use super::mapping::{anthropic_context_length_from_id, anthropic_reasoning_metadata};
use super::wire::{
    AnthropicCacheControl, AnthropicChatRequest, AnthropicContent, AnthropicContentBlock, AnthropicOutputConfig, AnthropicMessage, AnthropicStreamEvent, AnthropicSystem, AnthropicSystemBlock, AnthropicThinking,
    AnthropicTool, ToolCallAcc,
};
use zen_core::{ChatMessage, ChatResponse, ModelInfo, ZenError, ZenResult};

pub(crate) async fn list_models(me: &AnthropicProvider) -> ZenResult<Vec<ModelInfo>> {
        let url = me.url("/v1/models");
        match me
            .client
            .get(&url)
            .header("x-api-key", &me.api_key)
            .header("anthropic-version", &me.version)
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                #[derive(Deserialize)]
                struct ModelItem {
                    id: String,
                    display_name: Option<String>,
                    /// The Anthropic Models API returns `max_input_tokens` per
                    /// model. Newer models (Opus 4.6+, Sonnet 4.6+, Sonnet 5)
                    /// report 1_000_000 while older ones report 200_000.
                    #[serde(default)]
                    max_input_tokens: Option<u64>,
                }
                #[derive(Deserialize)]
                struct ModelsResponse {
                    data: Vec<ModelItem>,
                }

                if let Ok(models_resp) = resp.json::<ModelsResponse>().await {
                    let mut models = Vec::new();
                    for item in models_resp.data {
                        // Prefer the per-model value from the API; fall back to
                        // a hardcoded lookup for models the API might not include
                        // (e.g. retired models still in the fallback list).
                        let max_context_length = item
                            .max_input_tokens
                            .filter(|&v| v > 0)
                            .or_else(|| anthropic_context_length_from_id(&item.id));

                        models.push(ModelInfo {
                            id: item.id.clone(),
                            name: item.id.clone(),
                            size: None,
                            modified_at: None,
                            provider: Some(me.provider_label.clone()),
                            model_type: None,
                            arch: None,
                            quantization: None,
                            max_context_length,
                            display_name: item.display_name,
                            description: None,
                            state: None,
                            supports_vision: Some(true),
                            supports_tools: Some(true),
                            reasoning: Some(anthropic_reasoning_metadata(&item.id)),
                        });
                    }
                    if !models.is_empty() {
                        return Ok(models);
                    }
                }
            }
            _ => {
                debug!("Failed to fetch dynamic Anthropic models, falling back to hardcoded list");
            }
        }

        // Fallback hardcoded list of current models (Updated April 2026).
        // Context lengths use `anthropic_context_length_from_id` to match
        // the actual per-model values from the Anthropic Models API.
        let models = vec![
            ModelInfo {
                id: "claude-4-7-opus-20260416".to_string(),
                name: "claude-4-7-opus-20260416".to_string(),
                size: None,
                modified_at: None,
                provider: Some(me.provider_label.clone()),
                model_type: None,
                arch: None,
                quantization: None,
                max_context_length: anthropic_context_length_from_id("claude-opus-4-7"),
                display_name: Some("Claude 4.7 Opus".to_string()),
                description: Some("Anthropic flagship: Latest frontier intelligence".to_string()),
                state: None,
                supports_vision: Some(true),
                supports_tools: Some(true),
                reasoning: Some(anthropic_reasoning_metadata("claude-4-7-opus-20260416")),
            },
            ModelInfo {
                id: "claude-4-6-opus-20260219".to_string(),
                name: "claude-4-6-opus-20260219".to_string(),
                size: None,
                modified_at: None,
                provider: Some(me.provider_label.clone()),
                model_type: None,
                arch: None,
                quantization: None,
                max_context_length: anthropic_context_length_from_id("claude-opus-4-6"),
                display_name: Some("Claude 4.6 Opus".to_string()),
                description: Some("Previous flagship: Optimized for complex reasoning".to_string()),
                state: None,
                supports_vision: Some(true),
                supports_tools: Some(true),
                reasoning: Some(anthropic_reasoning_metadata("claude-4-6-opus-20260219")),
            },
            ModelInfo {
                id: "claude-4-6-sonnet-20260219".to_string(),
                name: "claude-4-6-sonnet-20260219".to_string(),
                size: None,
                modified_at: None,
                provider: Some(me.provider_label.clone()),
                model_type: None,
                arch: None,
                quantization: None,
                max_context_length: anthropic_context_length_from_id("claude-sonnet-4-6"),
                display_name: Some("Claude 4.6 Sonnet".to_string()),
                description: Some("Intelligence/Speed balanced champion".to_string()),
                state: None,
                supports_vision: Some(true),
                supports_tools: Some(true),
                reasoning: Some(anthropic_reasoning_metadata("claude-4-6-sonnet-20260219")),
            },
            ModelInfo {
                id: "claude-4-5-sonnet-20251210".to_string(),
                name: "claude-4-5-sonnet-20251210".to_string(),
                size: None,
                modified_at: None,
                provider: Some(me.provider_label.clone()),
                model_type: None,
                arch: None,
                quantization: None,
                max_context_length: anthropic_context_length_from_id("claude-sonnet-4-5"),
                display_name: Some("Claude 4.5 Sonnet".to_string()),
                description: Some("Highly capable, cost-efficient professional model".to_string()),
                state: None,
                supports_vision: Some(true),
                supports_tools: Some(true),
                reasoning: Some(anthropic_reasoning_metadata("claude-4-5-sonnet-20251210")),
            },
            ModelInfo {
                id: "claude-3-7-sonnet-20250219".to_string(),
                name: "claude-3-7-sonnet-20250219".to_string(),
                size: None,
                modified_at: None,
                provider: Some(me.provider_label.clone()),
                model_type: None,
                arch: None,
                quantization: None,
                max_context_length: anthropic_context_length_from_id("claude-3-7-sonnet"),
                display_name: Some("Claude 3.7 Sonnet".to_string()),
                description: Some("Advanced reasoning and coding specialist".to_string()),
                state: None,
                supports_vision: Some(true),
                supports_tools: Some(true),
                reasoning: Some(anthropic_reasoning_metadata("claude-3-7-sonnet-20250219")),
            },
            ModelInfo {
                id: "claude-3-5-sonnet-20241022".to_string(),
                name: "claude-3-5-sonnet-20241022".to_string(),
                size: None,
                modified_at: None,
                provider: Some(me.provider_label.clone()),
                model_type: None,
                arch: None,
                quantization: None,
                max_context_length: anthropic_context_length_from_id("claude-3-5-sonnet"),
                display_name: Some("Claude 3.5 Sonnet".to_string()),
                description: None,
                state: None,
                supports_vision: Some(true),
                supports_tools: Some(true),
                reasoning: Some(anthropic_reasoning_metadata("claude-3-5-sonnet-20241022")),
            },
            ModelInfo {
                id: "claude-3-5-haiku-20241022".to_string(),
                name: "claude-3-5-haiku-20241022".to_string(),
                size: None,
                modified_at: None,
                provider: Some(me.provider_label.clone()),
                model_type: None,
                arch: None,
                quantization: None,
                max_context_length: anthropic_context_length_from_id("claude-haiku-3-5"),
                display_name: None,
                description: None,
                state: None,
                supports_vision: None,
                supports_tools: None,
                reasoning: Some(anthropic_reasoning_metadata("claude-3-5-haiku-20241022")),
            },
        ];
        Ok(models)
    }

pub(crate) async fn chat_stream(
        me: &AnthropicProvider,
        model: &str,
        messages: Vec<ChatMessage>,
        tools: Option<Vec<zen_core::ToolInfo>>,
        config: crate::ChatRequestConfig,
        on_chunk: Box<dyn Fn(crate::LlmChunk) + Send>,
        token: tokio_util::sync::CancellationToken,
    ) -> ZenResult<ChatResponse> {
        let url = me.url("/v1/messages");
        let mut name_codec = crate::ToolNameCodec::default(); // sanitize tool names (no ':') + decode map

        // Extract system message and convert the rest to Anthropic format
        let mut system_prompt: Option<String> = None;
        let mut anthropic_messages: Vec<AnthropicMessage> = Vec::new();

        for msg in messages {
            match msg.role.as_str() {
                "system" => {
                    system_prompt = Some(msg.content);
                }
                "assistant" => {
                    // Check if this assistant message has tool calls
                    if let Some(tool_calls) = msg.tool_calls {
                        let mut blocks: Vec<AnthropicContentBlock> = Vec::new();
                        if !msg.content.is_empty() {
                            blocks.push(AnthropicContentBlock::Text {
                                text: msg.content,
                                cache_control: None,
                            });
                        }
                        for tc in tool_calls {
                            blocks.push(AnthropicContentBlock::ToolUse {
                                id: tc.id,
                                name: name_codec.encode(&tc.name),
                                input: tc.args,
                                cache_control: None,
                            });
                        }
                        anthropic_messages.push(AnthropicMessage {
                            role: "assistant".to_string(),
                            content: AnthropicContent::Blocks(blocks),
                        });
                    } else {
                        anthropic_messages.push(AnthropicMessage {
                            role: "assistant".to_string(),
                            content: AnthropicContent::Text(msg.content),
                        });
                    }
                }
                "tool" => {
                    let tool_call_id = msg.tool_call_id.unwrap_or_default();
                    anthropic_messages.push(AnthropicMessage {
                        role: "user".to_string(),
                        content: AnthropicContent::Blocks(vec![
                            AnthropicContentBlock::ToolResult {
                                tool_use_id: tool_call_id,
                                content: msg.content,
                                cache_control: None,
                            },
                        ]),
                    });
                }
                "user" => {
                    let mut blocks: Vec<AnthropicContentBlock> = Vec::new();
                    blocks.push(AnthropicContentBlock::Text {
                        text: msg.content,
                        cache_control: None,
                    });

                    if let Some(images) = msg.images {
                        for img in images {
                            if let Some(source) = me.parse_data_url(&img) {
                                blocks.push(AnthropicContentBlock::Image {
                                    source,
                                    cache_control: None,
                                });
                            }
                        }
                    }

                    anthropic_messages.push(AnthropicMessage {
                        role: "user".to_string(),
                        content: AnthropicContent::Blocks(blocks),
                    });
                }
                _ => {}
            }
        }

        // 1. Map System Prompt with optional caching
        let system = system_prompt.map(|s| {
            if config.enable_prompt_caching {
                AnthropicSystem::Blocks(vec![AnthropicSystemBlock {
                    block_type: "text".to_string(),
                    text: s,
                    cache_control: Some(AnthropicCacheControl {
                        cache_type: "ephemeral".to_string(),
                    }),
                }])
            } else {
                AnthropicSystem::String(s)
            }
        });

        // 2. Map Tools
        let anthropic_tools = tools.map(|ts| {
            ts.into_iter()
                .map(|t| AnthropicTool {
                    name: name_codec.encode(&t.name),
                    description: t.description,
                    input_schema: t.parameters,
                })
                .collect()
        });

        // 3. Inject caching into the last message if enabled
        if config.enable_prompt_caching && !anthropic_messages.is_empty() {
            let last_idx = anthropic_messages.len() - 1;
            match &mut anthropic_messages[last_idx].content {
                AnthropicContent::Blocks(blocks) => {
                    if let Some(last_block) = blocks.last_mut() {
                        match last_block {
                            AnthropicContentBlock::Text { cache_control, .. }
                            | AnthropicContentBlock::ToolUse { cache_control, .. }
                            | AnthropicContentBlock::ToolResult { cache_control, .. }
                            | AnthropicContentBlock::Image { cache_control, .. } => {
                                *cache_control = Some(AnthropicCacheControl {
                                    cache_type: "ephemeral".to_string(),
                                });
                            }
                        }
                    }
                }
                AnthropicContent::Text(text) => {
                    // Convert to block to support caching
                    anthropic_messages[last_idx].content =
                        AnthropicContent::Blocks(vec![AnthropicContentBlock::Text {
                            text: text.clone(),
                            cache_control: Some(AnthropicCacheControl {
                                cache_type: "ephemeral".to_string(),
                            }),
                        }]);
                }
            }
        }

        // 4. Reasoning — driven by the resolved protocol so we never send a
        // manual budget to an adaptive-only model (or vice versa).
        use crate::reasoning::ReasoningProtocol;
        let (thinking, output_config) = match config.resolved_reasoning.as_ref() {
            Some(r) if r.enabled => match r.capability.protocol {
                ReasoningProtocol::AnthropicAdaptive => (
                    Some(AnthropicThinking {
                        thinking_type: "adaptive".to_string(),
                        budget_tokens: None,
                    }),
                    r.effort.clone().map(|effort| AnthropicOutputConfig {
                        effort: Some(effort),
                    }),
                ),
                ReasoningProtocol::AnthropicBudget => (
                    r.budget_tokens
                        .filter(|budget| *budget > 0)
                        .map(|budget| AnthropicThinking {
                            thinking_type: "enabled".to_string(),
                            budget_tokens: Some(budget),
                        }),
                    None,
                ),
                _ => (None, None),
            },
            _ => (None, None),
        };

        let request = AnthropicChatRequest {
            model: model.to_string(),
            messages: anthropic_messages,
            system,
            max_tokens: config.max_tokens.unwrap_or(4096),
            stream: true,
            temperature: config.temperature,
            top_p: config.top_p,
            top_k: config.top_k,
            stop_sequences: config.stop,
            tools: anthropic_tools,
            thinking,
            output_config,
        };

        info!(model = model, "Starting Anthropic chat stream");

        let resp = me
            .client
            .post(&url)
            .header("x-api-key", &me.api_key)
            .header("anthropic-version", &me.version)
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await.map_err(crate::util::http_err)?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "Anthropic chat request failed");
            return Err(ZenError::Custom(format!(
                "Anthropic returned {}: {}",
                status, body
            )));
        }

        let mut full_content = String::new();
        let mut tool_call_accs: Vec<ToolCallAcc> = Vec::new();
        let mut reasoning_details: Vec<zen_core::ReasoningBlock> = Vec::new();
        let mut active_tool_index: Option<usize> = None;
        let mut tokens_in: Option<i64> = None;
        let mut tokens_out: Option<i64> = None;
        let mut stream = resp.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk_result) = tokio::select! {
            res = stream.next() => res,
            _ = token.cancelled() => {
                debug!("Anthropic stream cancelled by client via select!");
                None
            }
        } {
            if token.is_cancelled() {
                debug!("Anthropic stream cancelled by client");
                break;
            }
            let bytes = chunk_result.map_err(crate::util::http_err)?;
            buffer.push_str(&String::from_utf8_lossy(&bytes));

            // SSE format: "event: <type>\ndata: <json>\n\n"
            while let Some(newline_pos) = buffer.find('\n') {
                let line = buffer[..newline_pos].trim().to_string();
                buffer = buffer[newline_pos + 1..].to_string();

                if line.is_empty() || line.starts_with("event:") {
                    continue;
                }

                if !line.starts_with("data: ") {
                    continue;
                }

                let json_str = &line[6..];

                match serde_json::from_str::<AnthropicStreamEvent>(json_str) {
                    Ok(event) => {
                        match event.event_type.as_str() {
                            "message_start" => {
                                if let Some(msg) = &event.message {
                                    if let Some(usage) = &msg.usage {
                                        tokens_in = usage.input_tokens;
                                    }
                                }
                            }
                            "content_block_start" => {
                                if let Some(block) = &event.content_block {
                                    match block.block_type.as_str() {
                                        "tool_use" => {
                                            let name = name_codec
                                                .decode(&block.name.clone().unwrap_or_default());
                                            // Assign a stable id at block start so the
                                            // early-stream ToolCallReady id matches the
                                            // finalized tool-call id. Otherwise id-less
                                            // blocks get a fresh uuid at finalize and the
                                            // early execution/approval card orphans.
                                            let stable_id = block
                                                .id
                                                .clone()
                                                .filter(|value| !value.is_empty())
                                                .unwrap_or_else(|| {
                                                    format!("toolu_{}", uuid::Uuid::new_v4())
                                                });
                                            tool_call_accs.push(ToolCallAcc {
                                                id: stable_id.clone(),
                                                name: name.clone(),
                                                input_json: String::new(),
                                                ready_emitted: false,
                                            });
                                            active_tool_index = Some(tool_call_accs.len() - 1);
                                            on_chunk(crate::LlmChunk::ToolCallDelta {
                                                index: tool_call_accs.len() - 1,
                                                id: Some(stable_id),
                                                name: block.name.as_ref().map(|_| name),
                                                arguments_delta: String::new(),
                                                arguments_snapshot: String::new(),
                                            });
                                        }
                                        "text" => {
                                            active_tool_index = None;
                                        }
                                        "thinking" => {
                                            active_tool_index = None;
                                        }
                                        _ => {}
                                    }
                                }
                            }
                            "content_block_delta" => {
                                if let Some(delta) = &event.delta {
                                    match delta.delta_type.as_str() {
                                        "text_delta" => {
                                            if let Some(text) = &delta.text {
                                                if !text.is_empty() {
                                                    on_chunk(crate::LlmChunk::Text(
                                                        text.clone(),
                                                    ));
                                                    full_content.push_str(text);
                                                }
                                            }
                                        }
                                        "thinking_delta" => {
                                            if let Some(thought) = &delta.thinking {
                                                on_chunk(crate::LlmChunk::Thought(
                                                    thought.clone(),
                                                ));
                                                reasoning_details.push(
                                                    zen_core::ReasoningBlock {
                                                        provider: me.provider_label.clone(),
                                                        block_type: "thinking".to_string(),
                                                        text: Some(thought.clone()),
                                                        raw: None,
                                                    },
                                                );
                                            }
                                        }
                                        "input_json_delta" => {
                                            if let Some(json_fragment) = &delta.partial_json {
                                                if let Some(idx) = active_tool_index {
                                                    if let Some(acc) = tool_call_accs.get_mut(idx) {
                                                        acc.input_json.push_str(json_fragment);
                                                        on_chunk(
                                                            crate::LlmChunk::ToolCallDelta {
                                                                index: idx,
                                                                id: if acc.id.is_empty() {
                                                                    None
                                                                } else {
                                                                    Some(acc.id.clone())
                                                                },
                                                                name: if acc.name.is_empty() {
                                                                    None
                                                                } else {
                                                                    Some(acc.name.clone())
                                                                },
                                                                arguments_delta: json_fragment
                                                                    .clone(),
                                                                arguments_snapshot: acc
                                                                    .input_json
                                                                    .clone(),
                                                            },
                                                        );
                                                        if !acc.ready_emitted
                                                            && !acc.name.is_empty()
                                                        {
                                                            if let Ok(arguments) =
                                                                serde_json::from_str::<
                                                                    serde_json::Value,
                                                                >(
                                                                    &acc.input_json
                                                                )
                                                            {
                                                                acc.ready_emitted = true;
                                                                on_chunk(crate::LlmChunk::ToolCallReady {
                                                                    index: idx,
                                                                    id: if acc.id.is_empty() {
                                                                        None
                                                                    } else {
                                                                        Some(acc.id.clone())
                                                                    },
                                                                    name: acc.name.clone(),
                                                                    arguments,
                                                                });
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        _ => {}
                                    }
                                }
                            }
                            "content_block_stop" => {
                                // Tool block finished accumulating
                            }
                            "message_delta" => {
                                if let Some(usage) = &event.usage {
                                    tokens_out = usage.output_tokens;
                                }
                            }
                            "message_stop" => {
                                debug!("Anthropic stream complete");
                            }
                            _ => {}
                        }
                    }
                    Err(e) => {
                        debug!(json = %json_str, error = %e, "Failed to parse Anthropic SSE event");
                    }
                }
            }
        }

        // Finalize tool calls
        let final_tool_calls = if tool_call_accs.is_empty() {
            None
        } else {
            let mut tcs = Vec::new();
            for acc in tool_call_accs {
                if !acc.name.is_empty() {
                    tcs.push(zen_core::ToolCall {
                        id: if acc.id.is_empty() {
                            format!("toolu_{}", uuid::Uuid::new_v4())
                        } else {
                            acc.id
                        },
                        name: acc.name,
                        args: serde_json::from_str(&acc.input_json)
                            .unwrap_or_else(|_| serde_json::json!({})),
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
            reasoning_details: if reasoning_details.is_empty() {
                None
            } else {
                Some(reasoning_details)
            },
            tokens_in,
            tokens_out,
            tool_calls: final_tool_calls,
            done: true,
        })
    }