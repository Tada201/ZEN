use async_trait::async_trait;
use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{debug, error, info};

use crate::db::models::{ChatMessage, ChatResponse, ModelInfo};
use crate::error::{ZenError, ZenResult};
use crate::llm::LlmProvider;

/// Anthropic Messages API provider.
/// Uses the `/v1/messages` endpoint with `x-api-key` authentication,
/// Anthropic-specific message format, and `tool_use` content blocks.
pub struct AnthropicProvider {
    client: Client,
    api_key: String,
}

const ANTHROPIC_BASE_URL: &str = "https://api.anthropic.com";
const ANTHROPIC_VERSION: &str = "2023-06-01";

fn anthropic_reasoning_metadata(model_id: &str) -> (Option<bool>, Option<String>) {
    let id = model_id.to_lowercase();
    if id.contains("opus-4-7") || id.contains("4-7-opus") {
        return (Some(true), Some("none".to_string()));
    }
    if id.contains("claude-4") || id.contains("4-6") || id.contains("4-5") || id.contains("3-7") {
        return (Some(true), Some("budget".to_string()));
    }
    (Some(false), None)
}

fn supports_manual_thinking_budget(model_id: &str) -> bool {
    matches!(
        anthropic_reasoning_metadata(model_id).1.as_deref(),
        Some("budget")
    )
}

// ─── Anthropic API Types (Request) ───

#[derive(Serialize)]
struct AnthropicChatRequest {
    model: String,
    messages: Vec<AnthropicMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<AnthropicSystem>,
    max_tokens: i64,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_k: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stop_sequences: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<AnthropicTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking: Option<AnthropicThinking>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
enum AnthropicSystem {
    String(String),
    Blocks(Vec<AnthropicSystemBlock>),
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct AnthropicSystemBlock {
    #[serde(rename = "type")]
    block_type: String, // "text"
    text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    cache_control: Option<AnthropicCacheControl>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct AnthropicThinking {
    #[serde(rename = "type")]
    thinking_type: String, // "enabled"
    budget_tokens: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct AnthropicCacheControl {
    #[serde(rename = "type")]
    cache_type: String, // "ephemeral"
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct AnthropicMessage {
    role: String,
    content: AnthropicContent,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
enum AnthropicContent {
    Text(String),
    Blocks(Vec<AnthropicContentBlock>),
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type")]
enum AnthropicContentBlock {
    #[serde(rename = "text")]
    Text {
        text: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        cache_control: Option<AnthropicCacheControl>,
    },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
        #[serde(skip_serializing_if = "Option::is_none")]
        cache_control: Option<AnthropicCacheControl>,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        cache_control: Option<AnthropicCacheControl>,
    },
    #[serde(rename = "image")]
    Image {
        source: AnthropicImageSource,
        #[serde(skip_serializing_if = "Option::is_none")]
        cache_control: Option<AnthropicCacheControl>,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct AnthropicImageSource {
    #[serde(rename = "type")]
    source_type: String, // "base64"
    media_type: String, // "image/jpeg", "image/png", etc.
    data: String,
}

#[derive(Serialize, Debug)]
struct AnthropicTool {
    name: String,
    description: String,
    input_schema: serde_json::Value,
}

// ─── Anthropic API Types (Streaming Response) ───

#[derive(Deserialize, Debug)]
struct AnthropicStreamEvent {
    #[serde(rename = "type")]
    event_type: String,
    #[serde(default)]
    _index: Option<usize>,
    #[serde(default)]
    content_block: Option<AnthropicContentBlockResponse>,
    #[serde(default)]
    delta: Option<AnthropicDelta>,
    #[serde(default)]
    message: Option<AnthropicMessageResponse>,
    #[serde(default)]
    usage: Option<AnthropicUsage>,
}

#[derive(Deserialize, Debug)]
struct AnthropicContentBlockResponse {
    #[serde(rename = "type")]
    block_type: String,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    _text: Option<String>,
}

#[derive(Deserialize, Debug)]
struct AnthropicDelta {
    #[serde(rename = "type")]
    delta_type: String,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    partial_json: Option<String>,
    #[serde(default)]
    thinking: Option<String>,
}

#[derive(Deserialize, Debug)]
struct AnthropicMessageResponse {
    #[serde(default)]
    usage: Option<AnthropicUsage>,
}

#[derive(Deserialize, Debug)]
struct AnthropicUsage {
    #[serde(default)]
    input_tokens: Option<i64>,
    #[serde(default)]
    output_tokens: Option<i64>,
}

// ─── Tool call accumulator for streaming ───

#[derive(Default)]
struct ToolCallAcc {
    id: String,
    name: String,
    input_json: String,
    ready_emitted: bool,
}

impl AnthropicProvider {
    pub fn new(api_key: &str) -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .connect_timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("Failed to build Anthropic HTTP client"),
            api_key: api_key.to_string(),
        }
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", ANTHROPIC_BASE_URL, path)
    }

    fn parse_data_url(&self, data_url: &str) -> Option<AnthropicImageSource> {
        if !data_url.starts_with("data:") {
            return None;
        }
        let comma_pos = data_url.find(',')?;
        let header = &data_url[..comma_pos];
        let data = &data_url[comma_pos + 1..];

        // Header format: "data:image/png;base64"
        let media_type = header
            .split(':')
            .nth(1)
            .and_then(|h| h.split(';').next())
            .unwrap_or("image/png");

        Some(AnthropicImageSource {
            source_type: "base64".to_string(),
            media_type: media_type.to_string(),
            data: data.to_string(),
        })
    }
}

#[async_trait]
impl LlmProvider for AnthropicProvider {
    async fn list_models(&self) -> ZenResult<Vec<ModelInfo>> {
        let url = self.url("/v1/models");
        match self
            .client
            .get(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                #[derive(Deserialize)]
                struct ModelItem {
                    id: String,
                    display_name: Option<String>,
                }
                #[derive(Deserialize)]
                struct ModelsResponse {
                    data: Vec<ModelItem>,
                }

                if let Ok(models_resp) = resp.json::<ModelsResponse>().await {
                    let mut models = Vec::new();
                    for item in models_resp.data {
                        models.push(ModelInfo {
                            id: item.id.clone(),
                            name: item.id.clone(),
                            size: None,
                            modified_at: None,
                            provider: Some("anthropic".to_string()),
                            model_type: None,
                            arch: None,
                            quantization: None,
                            max_context_length: Some(200000), // Default for most models
                            display_name: item.display_name,
                            description: None,
                            state: None,
                            supports_vision: Some(true),
                            supports_tools: Some(true),
                            supports_reasoning: anthropic_reasoning_metadata(&item.id).0,
                            reasoning_config_type: anthropic_reasoning_metadata(&item.id).1,
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
        let models = vec![
            ModelInfo {
                id: "claude-4-7-opus-20260416".to_string(),
                name: "claude-4-7-opus-20260416".to_string(),
                size: None,
                modified_at: None,
                provider: Some("anthropic".to_string()),
                model_type: None,
                arch: None,
                quantization: None,
                max_context_length: Some(200000),
                display_name: Some("Claude 4.7 Opus".to_string()),
                description: Some("Anthropic flagship: Latest frontier intelligence".to_string()),
                state: None,
                supports_vision: Some(true),
                supports_tools: Some(true),
                supports_reasoning: Some(true),
                reasoning_config_type: Some("none".to_string()),
            },
            ModelInfo {
                id: "claude-4-6-opus-20260219".to_string(),
                name: "claude-4-6-opus-20260219".to_string(),
                size: None,
                modified_at: None,
                provider: Some("anthropic".to_string()),
                model_type: None,
                arch: None,
                quantization: None,
                max_context_length: Some(200000),
                display_name: Some("Claude 4.6 Opus".to_string()),
                description: Some("Previous flagship: Optimized for complex reasoning".to_string()),
                state: None,
                supports_vision: Some(true),
                supports_tools: Some(true),
                supports_reasoning: Some(true),
                reasoning_config_type: Some("budget".to_string()),
            },
            ModelInfo {
                id: "claude-4-6-sonnet-20260219".to_string(),
                name: "claude-4-6-sonnet-20260219".to_string(),
                size: None,
                modified_at: None,
                provider: Some("anthropic".to_string()),
                model_type: None,
                arch: None,
                quantization: None,
                max_context_length: Some(200000),
                display_name: Some("Claude 4.6 Sonnet".to_string()),
                description: Some("Intelligence/Speed balanced champion".to_string()),
                state: None,
                supports_vision: Some(true),
                supports_tools: Some(true),
                supports_reasoning: Some(true),
                reasoning_config_type: Some("budget".to_string()),
            },
            ModelInfo {
                id: "claude-4-5-sonnet-20251210".to_string(),
                name: "claude-4-5-sonnet-20251210".to_string(),
                size: None,
                modified_at: None,
                provider: Some("anthropic".to_string()),
                model_type: None,
                arch: None,
                quantization: None,
                max_context_length: Some(200000),
                display_name: Some("Claude 4.5 Sonnet".to_string()),
                description: Some("Highly capable, cost-efficient professional model".to_string()),
                state: None,
                supports_vision: Some(true),
                supports_tools: Some(true),
                supports_reasoning: Some(true),
                reasoning_config_type: Some("budget".to_string()),
            },
            ModelInfo {
                id: "claude-3-7-sonnet-20250219".to_string(),
                name: "claude-3-7-sonnet-20250219".to_string(),
                size: None,
                modified_at: None,
                provider: Some("anthropic".to_string()),
                model_type: None,
                arch: None,
                quantization: None,
                max_context_length: Some(200000),
                display_name: Some("Claude 3.7 Sonnet".to_string()),
                description: Some("Advanced reasoning and coding specialist".to_string()),
                state: None,
                supports_vision: Some(true),
                supports_tools: Some(true),
                supports_reasoning: Some(true),
                reasoning_config_type: Some("budget".to_string()),
            },
            ModelInfo {
                id: "claude-3-5-sonnet-20241022".to_string(),
                name: "claude-3-5-sonnet-20241022".to_string(),
                size: None,
                modified_at: None,
                provider: Some("anthropic".to_string()),
                model_type: None,
                arch: None,
                quantization: None,
                max_context_length: Some(200000),
                display_name: Some("Claude 3.5 Sonnet".to_string()),
                description: None,
                state: None,
                supports_vision: Some(true),
                supports_tools: Some(true),
                supports_reasoning: Some(false),
                reasoning_config_type: None,
            },
            ModelInfo {
                id: "claude-3-5-haiku-20241022".to_string(),
                name: "claude-3-5-haiku-20241022".to_string(),
                size: None,
                modified_at: None,
                provider: Some("anthropic".to_string()),
                model_type: None,
                arch: None,
                quantization: None,
                max_context_length: None,
                display_name: None,
                description: None,
                state: None,
                supports_vision: None,
                supports_tools: None,
                supports_reasoning: Some(false),
                reasoning_config_type: None,
            },
        ];
        Ok(models)
    }

    async fn chat_stream(
        &self,
        model: &str,
        messages: Vec<ChatMessage>,
        tools: Option<Vec<crate::tools::ToolInfo>>,
        config: crate::llm::ChatRequestConfig,
        on_chunk: Box<dyn Fn(crate::llm::LlmChunk) + Send>,
        token: tokio_util::sync::CancellationToken,
    ) -> ZenResult<ChatResponse> {
        let url = self.url("/v1/messages");

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
                                name: tc.name,
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
                            if let Some(source) = self.parse_data_url(&img) {
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
                    name: t.name,
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

        // 4. Thinking budget
        let thinking = config
            .thinking_budget
            .filter(|budget| *budget > 0 && supports_manual_thinking_budget(model))
            .map(|budget| AnthropicThinking {
                thinking_type: "enabled".to_string(),
                budget_tokens: budget,
            });

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
        };

        info!(model = model, "Starting Anthropic chat stream");

        let resp = self
            .client
            .post(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await?;

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
        let mut reasoning_details: Vec<crate::db::models::ReasoningBlock> = Vec::new();
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
            let bytes = chunk_result?;
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
                                            let acc = ToolCallAcc {
                                                id: block.id.clone().unwrap_or_default(),
                                                name: block.name.clone().unwrap_or_default(),
                                                input_json: String::new(),
                                                ready_emitted: false,
                                            };
                                            tool_call_accs.push(acc);
                                            active_tool_index = Some(tool_call_accs.len() - 1);
                                            let idx = tool_call_accs.len() - 1;
                                            on_chunk(crate::llm::LlmChunk::ToolCallDelta {
                                                index: idx,
                                                id: block.id.clone(),
                                                name: block.name.clone(),
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
                                                    on_chunk(crate::llm::LlmChunk::Text(
                                                        text.clone(),
                                                    ));
                                                    full_content.push_str(text);
                                                }
                                            }
                                        }
                                        "thinking_delta" => {
                                            if let Some(thought) = &delta.thinking {
                                                on_chunk(crate::llm::LlmChunk::Thought(
                                                    thought.clone(),
                                                ));
                                                reasoning_details.push(
                                                    crate::db::models::ReasoningBlock {
                                                        provider: "anthropic".to_string(),
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
                                                            crate::llm::LlmChunk::ToolCallDelta {
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
                                                                on_chunk(crate::llm::LlmChunk::ToolCallReady {
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
                    tcs.push(crate::db::models::ToolCall {
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

    async fn embed(&self, _model: &str, _text: &str) -> ZenResult<Vec<f32>> {
        Err(ZenError::Custom(
            "Anthropic does not offer an embeddings API. Use a different provider for embeddings."
                .to_string(),
        ))
    }

    async fn health_check(&self) -> bool {
        // Anthropic has no /v1/models endpoint. We try a simple request to validate the key.
        // A lightweight check: just verify the API key header is accepted.
        // We'll try hitting /v1/messages with an invalid body — a 400 means key is valid.
        let url = format!("{}/v1/messages", ANTHROPIC_BASE_URL);
        match self
            .client
            .post(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("content-type", "application/json")
            .body("{}")
            .send()
            .await
        {
            Ok(resp) => {
                let status = resp.status().as_u16();
                // 400 = bad request (key valid, body invalid) — healthy
                // 401 = unauthorized — unhealthy
                // 200 = somehow worked — healthy
                status == 400 || status == 200 || status == 422
            }
            Err(_) => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn latest_native_reasoning_models_do_not_send_manual_thinking_budget() {
        assert_eq!(
            anthropic_reasoning_metadata("claude-4-7-opus-20260416"),
            (Some(true), Some("none".to_string()))
        );
        assert!(!supports_manual_thinking_budget("claude-4-7-opus-20260416"));
    }

    #[test]
    fn budget_reasoning_models_can_send_manual_thinking_budget() {
        assert!(supports_manual_thinking_budget(
            "claude-4-6-sonnet-20260219"
        ));
        assert!(supports_manual_thinking_budget(
            "claude-3-7-sonnet-20250219"
        ));
        assert!(!supports_manual_thinking_budget(
            "claude-3-5-sonnet-20241022"
        ));
    }
}
