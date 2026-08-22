use serde::Deserialize;

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
    /// Newer LM Studio builds report per-model capabilities; older builds omit
    /// the field entirely and must deserialize exactly as before.
    #[serde(default)]
    pub capabilities: Option<LmStudioCapabilities>,
}

/// Per-model capability flags reported by `/api/v0/models`.
#[derive(Deserialize, Debug, Default)]
pub struct LmStudioCapabilities {
    #[serde(default)]
    pub reasoning: Option<LmStudioReasoningCapability>,
}

/// Reasoning capability block; `allowed_options` is e.g. `["off","on"]` or
/// `["off","on","low","medium","high"]` on newer builds.
#[derive(Deserialize, Debug, Default)]
pub struct LmStudioReasoningCapability {
    #[serde(default)]
    pub allowed_options: Option<Vec<String>>,
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

// ─── OpenAI-compat types for chat/embeddings ───

#[derive(Default)]
pub struct ToolCallAccumulator {
    pub id: String,
    pub name: String,
    pub arguments: String,
    pub ready_emitted: bool,
}
