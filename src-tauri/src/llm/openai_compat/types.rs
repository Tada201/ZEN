use serde::{Deserialize, Serialize};


#[derive(Serialize)]
pub struct OpenAiChatRequest {
    pub model: String,
    pub messages: Vec<OpenAiMessage>,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_completion_tokens: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presence_penalty: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frequency_penalty: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_format: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct OpenAiMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<OpenAiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<OpenAiToolCallOut>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(untagged)]
pub enum OpenAiContent {
    Text(String),
    Parts(Vec<OpenAiContentPart>),
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type")]
pub enum OpenAiContentPart {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image_url")]
    ImageUrl { image_url: OpenAiImageUrl },
}

#[derive(Serialize, Deserialize, Debug)]
pub struct OpenAiImageUrl {
    pub url: String, // "data:image/jpeg;base64,{base64_image}"
}

#[derive(Serialize, Deserialize, Debug)]
pub struct OpenAiToolCallOut {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: OpenAiFunctionOut,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct OpenAiFunctionOut {
    pub name: String,
    pub arguments: String,
}

/// SSE chunk from streaming chat completions.
#[derive(Deserialize, Debug)]
pub struct OpenAiStreamChunk {
    pub choices: Vec<OpenAiStreamChoice>,
    #[serde(default)]
    pub usage: Option<OpenAiUsage>,
}

#[derive(Deserialize, Debug)]
pub struct OpenAiStreamChoice {
    pub delta: OpenAiDelta,
    #[serde(default)]
    pub finish_reason: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct OpenAiDelta {
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub tool_calls: Option<Vec<OpenAiToolCallDelta>>,
}

#[derive(Deserialize, Debug)]
pub struct OpenAiToolCallDelta {
    pub index: Option<usize>,
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub call_type: Option<String>,
    pub function: Option<OpenAiFunctionDelta>,
}

#[derive(Deserialize, Debug)]
pub struct OpenAiFunctionDelta {
    pub name: Option<String>,
    pub arguments: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct OpenAiUsage {
    #[serde(default)]
    pub prompt_tokens: Option<i64>,
    #[serde(default)]
    pub completion_tokens: Option<i64>,
}

/// Models list response.
#[derive(Deserialize, Debug)]
pub struct OpenAiModelsResponse {
    pub data: Vec<OpenAiModelEntry>,
}

#[derive(Deserialize, Debug)]
pub struct OpenAiModelEntry {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub context_length: Option<u64>,
    #[serde(default)]
    pub owned_by: Option<String>,
    #[serde(default)]
    pub created: Option<i64>,
}

/// Embeddings types.
#[derive(Serialize)]
pub struct OpenAiEmbedRequest {
    pub model: String,
    pub input: String,
}

#[derive(Deserialize)]
pub struct OpenAiEmbedResponse {
    pub data: Vec<OpenAiEmbedData>,
}

#[derive(Deserialize)]
pub struct OpenAiEmbedData {
    pub embedding: Vec<f32>,
}


