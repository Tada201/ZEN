use async_trait::async_trait;
use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{debug, error, info, warn};

use crate::db::models::{ChatMessage, ChatResponse, ModelInfo};
use crate::error::{ZenError, ZenResult};
use crate::llm::LlmProvider;

/// Dedicated LM Studio provider.
/// Uses `/api/v0/models` for rich model metadata (type, arch, quantization, state)
/// and `/v1/chat/completions` for OpenAI-compatible inference.
pub struct LmStudioProvider {
    client: Client,
    base_url: String,
    /// Cached model_id → arch mapping, populated by list_models().
    /// Used by supports_tools() to check per-model tool capability.
    model_archs: std::sync::RwLock<std::collections::HashMap<String, String>>,
}

// ─── LM Studio native API types ───

#[derive(Deserialize, Debug)]
struct LmStudioModelsResponse {
    data: Vec<LmStudioModelEntry>,
}

#[derive(Deserialize, Debug)]
struct LmStudioModelEntry {
    id: String,
    #[serde(default)]
    #[serde(rename = "type")]
    model_type: Option<String>,
    publisher: Option<String>,
    arch: Option<String>,
    compatibility_type: Option<String>,
    quantization: Option<String>,
    state: Option<String>,
    max_context_length: Option<u64>,
}

// ─── LM Studio v1 API types ───

#[derive(Deserialize, Debug)]
struct LmStudioV1ModelsResponse {
    data: Vec<LmStudioV1ModelEntry>,
}

#[derive(Deserialize, Debug)]
struct LmStudioV1ModelEntry {
    key: String,
    publisher: Option<String>,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    #[serde(rename = "modelType")]
    model_type: String,
    quantization: Option<LmStudioV1Quantization>,
    #[serde(rename = "loadedInstances", default)]
    loaded_instances: Vec<LmStudioV1LoadedInstance>,
}

#[derive(Deserialize, Debug)]
struct LmStudioV1Quantization {
    name: Option<String>,
    #[serde(rename = "sizeBytes")]
    size_bytes: Option<u64>,
}

#[derive(Deserialize, Debug)]
struct LmStudioV1LoadedInstance {
    #[serde(rename = "contextLength")]
    context_length: Option<u64>,
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
struct ToolCallAccumulator {
    id: String,
    name: String,
    arguments: String,
}

/// Architectures known to have native tool calling support in LM Studio.
const NATIVE_TOOL_ARCHS: &[&str] = &[
    "qwen2", "qwen2_vl", "qwen3", "llama", "mistral", "gemma", "gemma2", "gemma3",
    "phi3", "phi4", "granite", "command-r", "deepseek", "deepseek2",
];

impl LmStudioProvider {
    pub fn new(base_url: &str) -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .connect_timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("Failed to build LM Studio HTTP client"),
            base_url: base_url.trim_end_matches('/').to_string(),
            model_archs: std::sync::RwLock::new(std::collections::HashMap::new()),
        }
    }

    fn arch_supports_tools(arch: &str) -> bool {
        let arch_lower = arch.to_lowercase();
        NATIVE_TOOL_ARCHS.iter().any(|known| arch_lower.starts_with(known))
    }

    /// Cache the arch for a model after listing.
    fn cache_model_arch(&self, model_id: &str, arch: &str) {
        if let Ok(mut map) = self.model_archs.write() {
            map.insert(model_id.to_string(), arch.to_string());
        }
    }
}

#[async_trait]
impl LlmProvider for LmStudioProvider {
    async fn list_models(&self) -> ZenResult<Vec<ModelInfo>> {
        // 1. Try v1 API first (LM Studio 0.4.0+)
        match self.list_models_v1().await {
            Ok(models) if !models.is_empty() => {
                info!(count = models.len(), "LM Studio models fetched via v1 API");
                return Ok(models);
            }
            Ok(_) => {
                debug!("LM Studio v1 API returned empty list, trying v0 fallback");
            }
            Err(e) => {
                debug!(error = %e, "LM Studio v1 API unavailable, trying v0 fallback");
            }
        }

        // 2. Try v0 API fallback
        let url = format!("{}/api/v0/models", self.base_url);
        info!(url = %url, "Fetching LM Studio models via native v0 API");

        let resp = self.client.get(&url).send().await;

        let mut models = match resp {
            Ok(r) if r.status().is_success() => {
                let body: LmStudioModelsResponse = r.json().await?;
                let results: Vec<ModelInfo> = body.data
                    .into_iter()
                    .map(|m| {
                        let is_vlm = m.model_type.as_deref() == Some("vlm");
                        let has_native_tools = m.arch.as_deref()
                            .map(Self::arch_supports_tools)
                            .unwrap_or(false);

                        ModelInfo {
                            id: m.id.clone(),
                            name: m.id,
                            size: None,
                            modified_at: None,
                            display_name: None,
                            description: None,
                            provider: m.publisher,
                            model_type: m.model_type,
                            arch: m.arch,
                            quantization: m.quantization,
                            max_context_length: m.max_context_length,
                            state: m.state,
                            supports_vision: Some(is_vlm),
                            supports_tools: Some(has_native_tools),
                        }
                    })
                    .collect();

                // Cache model → arch mapping for supports_tools() lookups
                for model in &results {
                    if let Some(arch) = &model.arch {
                        self.cache_model_arch(&model.name, arch);
                    }
                }

                results
            }
            Ok(r) => {
                warn!(status = %r.status(), "LM Studio v0 API unavailable, falling back to /v1/models");
                self.list_models_fallback().await?
            }
            Err(e) => {
                if self.base_url.contains("localhost") {
                    let alt_base = self.base_url.replace("localhost", "127.0.0.1");
                    warn!(error = %e, alt_base = %alt_base, "Failed to reach LM Studio on localhost, trying 127.0.0.1");
                    let alt_provider = Self::new(&alt_base);
                    alt_provider.list_models_fallback().await?
                } else {
                    warn!(error = %e, "Failed to reach LM Studio v0 API, trying /v1/models");
                    self.list_models_fallback().await?
                }
            }
        };

        // Sort loaded models first, then alphabetically
        models.sort_by(|a, b| {
            let a_loaded = a.state.as_deref() == Some("loaded");
            let b_loaded = b.state.as_deref() == Some("loaded");
            b_loaded.cmp(&a_loaded).then(a.name.cmp(&b.name))
        });

        info!(count = models.len(), "LM Studio models fetched");
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

                let content = if m.role == "assistant" && m.content.is_empty() && tool_calls_out.is_some() {
                    None
                } else {
                    Some(m.content)
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
                .map(|t| serde_json::json!({
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters
                    }
                }))
                .collect()
        });

        let request = OpenAiChatRequest {
            model: model.to_string(),
            messages: oai_messages,
            stream: true,
            tools: oai_tools,
            temperature: config.temperature,
            max_tokens: config.max_tokens,
        };

        info!(model = model, "LM Studio chat stream starting");

        let resp = self.client.post(&url).json(&request).send().await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "LM Studio chat request failed");
            return Err(ZenError::Custom(format!("LM Studio returned {}: {}", status, body)));
        }

        let mut full_content = String::new();
        let mut results_tool_calls: Vec<ToolCallAccumulator> = Vec::new();
        let mut tokens_in: Option<i64> = None;
        let mut tokens_out: Option<i64> = None;
        let mut stream = resp.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk_result) = stream.next().await {
            if token.is_cancelled() {
                debug!("LM Studio stream cancelled by client");
                break;
            }
            let bytes = chunk_result?;
            buffer.push_str(&String::from_utf8_lossy(&bytes));

            while let Some(newline_pos) = buffer.find('\n') {
                let line = buffer[..newline_pos].trim().to_string();
                buffer = buffer[newline_pos + 1..].to_string();

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
                                    if let Some(id) = &delta.id { acc.id.push_str(id); }
                                    if let Some(func) = &delta.function {
                                        if let Some(name) = &func.name { acc.name.push_str(name); }
                                        if let Some(args) = &func.arguments { acc.arguments.push_str(args); }
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
                    tcs.push(crate::db::models::ToolCall {
                        id: if acc.id.is_empty() { format!("call_{}", uuid::Uuid::new_v4()) } else { acc.id },
                        name: acc.name,
                        args: serde_json::from_str(&acc.arguments).unwrap_or_else(|_| serde_json::json!({})),
                    });
                }
            }
            if tcs.is_empty() { None } else { Some(tcs) }
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

    async fn embed(&self, model: &str, text: &str) -> ZenResult<Vec<f32>> {
        let url = format!("{}/v1/embeddings", self.base_url);
        let request = OpenAiEmbedRequest {
            model: model.to_string(),
            input: text.to_string(),
        };

        let resp = self.client.post(&url).json(&request).send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(ZenError::Custom(format!("LM Studio embedding failed ({}): {}", status, body)));
        }

        let body: OpenAiEmbedResponse = resp.json().await?;
        body.data
            .into_iter()
            .next()
            .map(|d| d.embedding)
            .ok_or_else(|| ZenError::Custom("No embedding returned".into()))
    }

    async fn health_check(&self) -> bool {
        // Probe native API first
        let v0_url = format!("{}/api/v0/models", self.base_url);
        match self.client.get(&v0_url).send().await {
            Ok(resp) if resp.status().is_success() => {
                debug!(url = %v0_url, "LM Studio native API health check passed");
                return true;
            }
            Ok(resp) => {
                debug!(url = %v0_url, status = %resp.status(), "LM Studio native API returned non-success, trying /v1");
            }
            Err(e) => {
                debug!(url = %v0_url, error = %e, "LM Studio native API unreachable, trying /v1");
            }
        }

        // Fallback to OpenAI compatible endpoint
        let v1_url = format!("{}/v1/models", self.base_url);
        match self.client.get(&v1_url).send().await {
            Ok(resp) if resp.status().is_success() => {
                debug!(url = %v1_url, "LM Studio OpenAI API health check passed");
                true
            }
            Ok(resp) => {
                warn!(url = %v1_url, status = %resp.status(), "LM Studio OpenAI API returned non-success");
                false
            }
            Err(e) => {
                // If it's localhost, try 127.0.0.1 as a last resort to bypass IPv6 issues
                if self.base_url.contains("localhost") {
                    let alt_base = self.base_url.replace("localhost", "127.0.0.1");
                    let alt_url = format!("{}/v1/models", alt_base);
                    debug!(url = %alt_url, "Trying 127.0.0.1 fallback for LM Studio");
                    match self.client.get(&alt_url).send().await {
                        Ok(resp) => resp.status().is_success(),
                        Err(_) => false,
                    }
                } else {
                    warn!(url = %v1_url, error = %e, "LM Studio OpenAI API unreachable");
                    false
                }
            }
        }
    }

    fn supports_tools(&self, model: &str) -> bool {
        // Check cached arch mapping from list_models()
        if let Ok(map) = self.model_archs.read() {
            if let Some(arch) = map.get(model) {
                let supported = Self::arch_supports_tools(arch);
                if !supported {
                    tracing::info!(model = model, arch = %arch, "Model arch does not support tools — using text-mode fallback");
                }
                return supported;
            }
        }
        // If we haven't seen this model yet (cache miss), try to infer from name.
        // Common patterns: qwen, llama, mistral, gemma, phi, deepseek have tool support.
        // Unknown models default to false (text-mode fallback is safer).
        let name_lower = model.to_lowercase();
        let inferred = NATIVE_TOOL_ARCHS.iter().any(|arch| name_lower.contains(arch));
        if !inferred {
            tracing::info!(model = model, "Model not in arch cache, name doesn't match known tool archs — using text-mode fallback");
        }
        inferred
    }
}


impl LmStudioProvider {
    async fn list_models_v1(&self) -> ZenResult<Vec<ModelInfo>> {
        let url = format!("{}/api/v1/models", self.base_url);
        let resp = self.client.get(&url).send().await?;

        if !resp.status().is_success() {
            return Err(ZenError::Custom(format!("LM Studio v1 API returned {}", resp.status())));
        }

        let body: LmStudioV1ModelsResponse = resp.json().await?;
        let results: Vec<ModelInfo> = body.data
            .into_iter()
            .map(|m| {
                let is_loaded = !m.loaded_instances.is_empty();
                let state = if is_loaded { Some("loaded".to_string()) } else { None };
                let max_context = m.loaded_instances.get(0).and_then(|i| i.context_length);
                
                // In v1, arch is often part of the key or publisher. 
                // We'll try to infer it for supports_tools() if not explicitly provided.
                let arch = m.key.split('/').next().map(|s| s.to_string());
                
                if let Some(ref a) = arch {
                    self.cache_model_arch(&m.key, a);
                }

                ModelInfo {
                    id: m.key.clone(),
                    name: m.key,
                    size: m.quantization.as_ref().and_then(|q| q.size_bytes),
                    modified_at: None,
                    display_name: m.display_name,
                    description: None,
                    provider: m.publisher,
                    model_type: Some(m.model_type),
                    arch,
                    quantization: m.quantization.and_then(|q| q.name),
                    max_context_length: max_context,
                    state,
                    supports_vision: None, // Pattern based detection in frontend/runner
                    supports_tools: None,  // Inferred via arch in supports_tools()
                }
            })
            .collect();

        Ok(results)
    }

    async fn list_models_fallback(&self) -> ZenResult<Vec<ModelInfo>> {
        let url = format!("{}/v1/models", self.base_url);
        let resp = self.client.get(&url).send().await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(ZenError::Custom(format!("LM Studio returned {}: {}", status, body)));
        }

        let body: OpenAiModelsResponse = resp.json().await?;
        Ok(body.data
            .into_iter()
            .map(|m| ModelInfo {
                id: m.id.clone(),
                name: m.id,
                size: None,
                modified_at: None,
                display_name: None,
                description: None,
                provider: Some("lmstudio".to_string()),
                model_type: None,
                arch: None,
                quantization: None,
                max_context_length: None,
                state: None,
                supports_vision: None,
                supports_tools: None,
            })
            .collect())
    }
}
