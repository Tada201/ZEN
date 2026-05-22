use serde::{Deserialize, Serialize};

// ─── LM Studio native API types ───

#[derive(Deserialize, Debug)]
pub struct LmStudioModelsResponse {
    pub data: Vec<LmStudioModelEntry>,
}

#[derive(Deserialize, Debug)]
pub struct LmStudioModelEntry {
    pub id: String,
    #[serde(default)]
    #[serde(rename = "type")]
    pub model_type: Option<String>,
    pub publisher: Option<String>,
    pub arch: Option<String>,
    pub compatibility_type: Option<String>,
    pub quantization: Option<String>,
    pub state: Option<String>,
    pub max_context_length: Option<u64>,
}

// ─── LM Studio v1 API types ───

#[derive(Deserialize, Debug)]
pub struct LmStudioV1ModelsResponse {
    pub data: Vec<LmStudioV1ModelEntry>,
}

#[derive(Deserialize, Debug)]
pub struct LmStudioV1ModelEntry {
    pub key: String,
    pub publisher: Option<String>,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    #[serde(rename = "modelType")]
    pub model_type: String,
    pub quantization: Option<LmStudioV1Quantization>,
    #[serde(rename = "loadedInstances", default)]
    pub loaded_instances: Vec<LmStudioV1LoadedInstance>,
}

#[derive(Deserialize, Debug)]
pub struct LmStudioV1Quantization {
    pub name: Option<String>,
    #[serde(rename = "sizeBytes")]
    pub size_bytes: Option<u64>,
}

#[derive(Deserialize, Debug)]
pub struct LmStudioV1LoadedInstance {
    #[serde(rename = "contextLength")]
    pub context_length: Option<u64>,
}

#[derive(Deserialize, Debug)]
struct OpenAiModelsResponse {
    data: Vec<OpenAiModelEntry>,
}

#[derive(Deserialize, Debug)]
struct OpenAiModelEntry {
    id: String,
}

// ─── OpenAI-compat types for chat/embeddings ───

#[derive(Serialize)]
struct OpenAiChatRequest {
    model: String,
    messages: Vec<OpenAiMessage>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    presence_penalty: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    frequency_penalty: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    seed: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stop: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug)]
struct OpenAiMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<OpenAiToolCallOut>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct OpenAiToolCallOut {
    id: String,
    #[serde(rename = "type")]
    call_type: String,
    function: OpenAiFunctionOut,
}

#[derive(Serialize, Deserialize, Debug)]
struct OpenAiFunctionOut {
    name: String,
    arguments: String,
}

#[derive(Deserialize, Debug)]
struct OpenAiStreamChunk {
    choices: Vec<OpenAiStreamChoice>,
    #[serde(default)]
    usage: Option<OpenAiUsage>,
}

#[derive(Deserialize, Debug)]
struct OpenAiStreamChoice {
    delta: OpenAiDelta,
}

#[derive(Deserialize, Debug)]
struct OpenAiDelta {
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<OpenAiToolCallDelta>>,
}

#[derive(Deserialize, Debug)]
struct OpenAiToolCallDelta {
    index: Option<usize>,
    id: Option<String>,
    function: Option<OpenAiFunctionDelta>,
}

#[derive(Deserialize, Debug)]
struct OpenAiFunctionDelta {
    name: Option<String>,
    arguments: Option<String>,
}

#[derive(Deserialize, Debug)]
struct OpenAiUsage {
    #[serde(default)]
    prompt_tokens: Option<i64>,
    #[serde(default)]
    completion_tokens: Option<i64>,
}

#[derive(Serialize)]
struct OpenAiEmbedRequest {
    model: String,
    input: String,
}

#[derive(Deserialize)]
struct OpenAiEmbedResponse {
    data: Vec<OpenAiEmbedData>,
}

#[derive(Deserialize)]
struct OpenAiEmbedData {
    embedding: Vec<f32>,
}

#[derive(Default)]
pub struct ToolCallAccumulator {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

