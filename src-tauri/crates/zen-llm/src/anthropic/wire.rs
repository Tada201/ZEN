//! Anthropic Messages API wire types (serde-only).
//! Moved verbatim from the former single-file anthropic.rs (Phase 7).

use serde::{Deserialize, Serialize};

// ─── Anthropic API Types (Request) ───

#[derive(Serialize)]
pub(crate) struct AnthropicChatRequest {
    pub(crate) model: String,
    pub(crate) messages: Vec<AnthropicMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) system: Option<AnthropicSystem>,
    pub(crate) max_tokens: i64,
    pub(crate) stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) top_k: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) stop_sequences: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) tools: Option<Vec<AnthropicTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) thinking: Option<AnthropicThinking>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) output_config: Option<AnthropicOutputConfig>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
pub(crate) enum AnthropicSystem {
    String(String),
    Blocks(Vec<AnthropicSystemBlock>),
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub(crate) struct AnthropicSystemBlock {
    #[serde(rename = "type")]
    pub(crate) block_type: String, // "text"
    pub(crate) text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) cache_control: Option<AnthropicCacheControl>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub(crate) struct AnthropicThinking {
    #[serde(rename = "type")]
    pub(crate) thinking_type: String, // "enabled" (manual budget) | "adaptive"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) budget_tokens: Option<i64>,
}

/// Adaptive-thinking effort selector (Claude 4.5+).
#[derive(Serialize, Deserialize, Debug, Clone)]
pub(crate) struct AnthropicOutputConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) effort: Option<String>, // "low" | "medium" | "high"
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub(crate) struct AnthropicCacheControl {
    #[serde(rename = "type")]
    pub(crate) cache_type: String, // "ephemeral"
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub(crate) struct AnthropicMessage {
    pub(crate) role: String,
    pub(crate) content: AnthropicContent,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
pub(crate) enum AnthropicContent {
    Text(String),
    Blocks(Vec<AnthropicContentBlock>),
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type")]
pub(crate) enum AnthropicContentBlock {
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
pub(crate) struct AnthropicImageSource {
    #[serde(rename = "type")]
    pub(crate) source_type: String, // "base64"
    pub(crate) media_type: String, // "image/jpeg", "image/png", etc.
    pub(crate) data: String,
}

#[derive(Serialize, Debug)]
pub(crate) struct AnthropicTool {
    pub(crate) name: String,
    pub(crate) description: String,
    pub(crate) input_schema: serde_json::Value,
}

// ─── Anthropic API Types (Streaming Response) ───

#[derive(Deserialize, Debug)]
pub(crate) struct AnthropicStreamEvent {
    #[serde(rename = "type")]
    pub(crate) event_type: String,
    #[serde(default)]
    pub(crate) _index: Option<usize>,
    #[serde(default)]
    pub(crate) content_block: Option<AnthropicContentBlockResponse>,
    #[serde(default)]
    pub(crate) delta: Option<AnthropicDelta>,
    #[serde(default)]
    pub(crate) message: Option<AnthropicMessageResponse>,
    #[serde(default)]
    pub(crate) usage: Option<AnthropicUsage>,
}

#[derive(Deserialize, Debug)]
pub(crate) struct AnthropicContentBlockResponse {
    #[serde(rename = "type")]
    pub(crate) block_type: String,
    #[serde(default)]
    pub(crate) id: Option<String>,
    #[serde(default)]
    pub(crate) name: Option<String>,
    #[serde(default)]
    pub(crate) _text: Option<String>,
}

#[derive(Deserialize, Debug)]
pub(crate) struct AnthropicDelta {
    #[serde(rename = "type")]
    pub(crate) delta_type: String,
    #[serde(default)]
    pub(crate) text: Option<String>,
    #[serde(default)]
    pub(crate) partial_json: Option<String>,
    #[serde(default)]
    pub(crate) thinking: Option<String>,
}

#[derive(Deserialize, Debug)]
pub(crate) struct AnthropicMessageResponse {
    #[serde(default)]
    pub(crate) usage: Option<AnthropicUsage>,
}

#[derive(Deserialize, Debug)]
pub(crate) struct AnthropicUsage {
    #[serde(default)]
    pub(crate) input_tokens: Option<i64>,
    #[serde(default)]
    pub(crate) output_tokens: Option<i64>,
}

// ─── Tool call accumulator for streaming ───

#[derive(Default)]
pub(crate) struct ToolCallAcc {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) input_json: String,
    pub(crate) ready_emitted: bool,
}
