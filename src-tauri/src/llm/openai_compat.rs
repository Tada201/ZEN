use async_trait::async_trait;
use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::RwLock;
use tracing::{debug, error, info, warn};

use crate::db::models::{ChatMessage, ChatResponse, ModelInfo};
use crate::error::{ZenError, ZenResult};
use crate::llm::LlmProvider;

/// Cached model capabilities populated during `list_models()`.
#[derive(Clone, Debug)]
struct ModelCapabilities {
    supports_tools: bool,
}

/// OpenAI-compatible API provider.
/// Works with: OpenAI, OpenRouter, Groq, Together AI, Mistral, LM Studio,
/// or any server implementing the `/v1/chat/completions` endpoint.
pub struct OpenAiCompatProvider {
    client: Client,
    base_url: String,
    api_key: String,
    provider_name: String,
    extra_headers: Vec<(String, String)>,
    /// Model capability cache populated by `list_models()`.
    model_capabilities: RwLock<HashMap<String, ModelCapabilities>>,
}

// ─── OpenAI API types ───

#[derive(Serialize)]
struct OpenAiChatRequest {
    model: String,
    messages: Vec<OpenAiMessage>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_completion_tokens: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_format: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct OpenAiMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<OpenAiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<OpenAiToolCallOut>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(untagged)]
enum OpenAiContent {
    Text(String),
    Parts(Vec<OpenAiContentPart>),
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type")]
enum OpenAiContentPart {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image_url")]
    ImageUrl { image_url: OpenAiImageUrl },
}

#[derive(Serialize, Deserialize, Debug)]
struct OpenAiImageUrl {
    url: String, // "data:image/jpeg;base64,{base64_image}"
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

/// SSE chunk from streaming chat completions.
#[derive(Deserialize, Debug)]
struct OpenAiStreamChunk {
    choices: Vec<OpenAiStreamChoice>,
    #[serde(default)]
    usage: Option<OpenAiUsage>,
}

#[derive(Deserialize, Debug)]
struct OpenAiStreamChoice {
    delta: OpenAiDelta,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Deserialize, Debug)]
struct OpenAiDelta {
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
struct OpenAiUsage {
    #[serde(default)]
    prompt_tokens: Option<i64>,
    #[serde(default)]
    completion_tokens: Option<i64>,
}

/// Models list response.
#[derive(Deserialize, Debug)]
struct OpenAiModelsResponse {
    data: Vec<OpenAiModelEntry>,
}

#[derive(Deserialize, Debug)]
struct OpenAiModelEntry {
    id: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    context_length: Option<u64>,
    #[serde(default)]
    owned_by: Option<String>,
    #[serde(default)]
    created: Option<i64>,
}

/// Embeddings types.
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

impl OpenAiCompatProvider {
    pub fn new(base_url: &str, api_key: &str, provider_name: &str) -> Self {
        Self::with_headers(base_url, api_key, provider_name, vec![])
    }

    /// Create a provider with additional custom headers applied to every request.
    /// Used for providers like OpenRouter that require HTTP-Referer and X-Title.
    pub fn with_headers(
        base_url: &str,
        api_key: &str,
        provider_name: &str,
        extra_headers: Vec<(String, String)>,
    ) -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .connect_timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("Failed to build OpenAI-Compat HTTP client"),
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key: api_key.to_string(),
            provider_name: provider_name.to_string(),
            extra_headers,
            model_capabilities: RwLock::new(HashMap::new()),
        }
    }

    /// Check if this is Groq provider (needs special rate limit handling)
    fn is_groq(&self) -> bool {
        self.provider_name.to_lowercase().contains("groq") 
            || self.base_url.contains("groq.com")
    }

    /// Build the full URL for an API endpoint.
    /// Skips prepending `/v1` if the base URL already ends with `/v1`
    /// (e.g. Gemini's OpenAI-compat proxy) or contains `/gateway`
    /// (e.g. Kilo Gateway's `https://api.kilo.ai/api/gateway`).
    fn url(&self, path: &str) -> String {
        let base = self.base_url.trim_end_matches('/');
        if base.ends_with("/v1") || base.contains("/gateway") {
            format!("{}{}", base, path)
        } else {
            format!("{}/v1{}", base, path)
        }
    }

    /// Create an authorized request builder with extra headers.
    fn auth_get(&self, url: &str) -> reqwest::RequestBuilder {
        let mut req = self.client.get(url).bearer_auth(&self.api_key);
        for (key, value) in &self.extra_headers {
            req = req.header(key, value);
        }
        req
    }

    fn auth_post(&self, url: &str) -> reqwest::RequestBuilder {
        let mut req = self.client.post(url).bearer_auth(&self.api_key);
        for (key, value) in &self.extra_headers {
            req = req.header(key, value);
        }
        req
    }

    /// Send request with retry logic for rate limits (Groq-specific)
    async fn send_with_retry(&self, req: reqwest::RequestBuilder) -> ZenResult<reqwest::Response> {
        let mut attempts = 0;
        let is_groq = self.is_groq();
        let max_attempts = if is_groq { 4 } else { 3 };
        let mut last_error: Option<ZenError> = None;
        let mut current_req = Some(req);

        while attempts < max_attempts {
            let is_last_attempt = attempts == max_attempts - 1;
            
            // Try to get a request for this attempt
            let req_to_send = if !is_last_attempt {
                let current_ref = match current_req.as_ref() {
                    Some(r) => r,
                    None => break, // Should not happen but safety first
                };

                match current_ref.try_clone() {
                    Some(cloned) => cloned,
                    None => {
                        // Request has a non-cloneable body (e.g. a stream). 
                        // We must consume the original and can't retry.
                        current_req.take().unwrap()
                    }
                }
            } else {
                // Last attempt, consume the original
                match current_req.take() {
                    Some(r) => r,
                    None => break,
                }
            };

            let can_not_retry_anymore = current_req.is_none();

            match req_to_send.send().await {
                Ok(resp) => {
                    let status = resp.status();
                    if status == reqwest::StatusCode::TOO_MANY_REQUESTS && !can_not_retry_anymore {
                        let retry_after = resp
                            .headers()
                            .get("retry-after")
                            .and_then(|v| v.to_str().ok())
                            .and_then(|s| s.parse::<u64>().ok())
                            .unwrap_or(2);
                        
                        warn!(
                            provider = %self.provider_name,
                            retry_after = retry_after,
                            attempt = attempts + 1,
                            "Rate limited (429), retrying..."
                        );
                        
                        tokio::time::sleep(tokio::time::Duration::from_secs(retry_after)).await;
                        attempts += 1;
                        continue;
                    }
                    return Ok(resp);
                }
                Err(e) => {
                    let err_msg = e.to_string();
                    last_error = Some(ZenError::from(e));
                    
                    if can_not_retry_anymore {
                        break;
                    }
                    
                    warn!(
                        provider = %self.provider_name,
                        error = %err_msg,
                        attempt = attempts + 1,
                        "Request failed, retrying..."
                    );
                    
                    attempts += 1;
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    continue;
                }
            }
        }

        Err(last_error.unwrap_or_else(|| ZenError::Custom("Request failed after all retries".to_string())))
    }
}

#[async_trait]
impl LlmProvider for OpenAiCompatProvider {
    async fn list_models(&self) -> ZenResult<Vec<ModelInfo>> {
        let url = self.url("/models");
        info!(provider = %self.provider_name, url = %url, "Fetching model list");

        let resp = self.send_with_retry(self.auth_get(&url)).await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            warn!(status = %status, body = %body, "Failed to list models");
            return Err(ZenError::Custom(format!(
                "{} returned {}: {}",
                self.provider_name, status, body
            )));
        }

        let body: OpenAiModelsResponse = resp.json().await?;

        let mut models: Vec<ModelInfo> = body
            .data
            .into_iter()
            .map(|m| {
                let model_id_lower = m.id.to_lowercase();
                
                // If the API provided a human-readable name, fall back to id otherwise
                let display_name = match m.name {
                    Some(n) if !n.is_empty() => n,
                    _ => m.id.clone(),
                };

                let has_vision_keyword = model_id_lower.contains("vision");
                let is_multimodal_family = model_id_lower.contains("claude-3") 
                    || model_id_lower.contains("gpt-4")
                    || model_id_lower.contains("gemini-1.5")
                    || model_id_lower.contains("pixtral")
                    || model_id_lower.contains("llama-3.2-11b")
                    || model_id_lower.contains("llama-3.2-90b");

                let supports_vision = has_vision_keyword || is_multimodal_family;
                
                // Modern multimodal models usually support tools too.
                // We only disable tools if it's explicitly marked as a vision-only model.
                let supports_tools = !model_id_lower.contains("vision-only");

                // Populate capability cache for runtime lookups
                if let Ok(mut cache) = self.model_capabilities.write() {
                    cache.insert(
                        m.id.clone(),
                        ModelCapabilities { supports_tools },
                    );
                }

                ModelInfo {
                    id: m.id.clone(),
                    name: m.id.clone(),
                    display_name: Some(display_name),
                    description: m.description.clone(),
                    size: None,
                    modified_at: m.created.map(|c| c.to_string()),
                    provider: Some(m.owned_by.unwrap_or_else(|| self.provider_name.clone())),
                    model_type: None,
                    arch: None,
                    quantization: None,
                    max_context_length: m.context_length,
                    state: None,
                    supports_vision: Some(supports_vision),
                    supports_tools: Some(supports_tools),
                }
            })
            .collect();

        // Sort alphabetically for consistent display
        models.sort_by(|a, b| a.name.cmp(&b.name));

        info!(
            provider = %self.provider_name,
            count = models.len(),
            "Fetched models"
        );
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
        let url = self.url("/chat/completions");

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

                // For assistant messages with tool calls but no text, content should be None
                let oauth_content = if m.role == "assistant" && m.content.is_empty() && tool_calls_out.is_some() {
                    None
                } else if let Some(images) = m.images {
                    let mut parts = vec![OpenAiContentPart::Text { text: m.content }];
                    for img in images {
                        parts.push(OpenAiContentPart::ImageUrl {
                            image_url: OpenAiImageUrl {
                                url: img, // Assumes it's already a data URL
                            },
                        });
                    }
                    Some(OpenAiContent::Parts(parts))
                } else {
                    Some(OpenAiContent::Text(m.content))
                };

                OpenAiMessage {
                    role: m.role,
                    content: oauth_content,
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

        // Map model specific parameters from config
        let (max_tokens_mapped, max_completion_tokens) = if model.starts_with("o1") || model.starts_with("o3") {
            // OpenAI o1/o3 models require max_completion_tokens instead of max_tokens
            (None, config.max_tokens)
        } else {
            (config.max_tokens, None)
        };

        let response_format = config.json_schema.map(|s| {
            serde_json::json!({
                "type": "json_schema",
                "json_schema": {
                    "name": "response_schema",
                    "strict": true,
                    "schema": s
                }
            })
        });

        let request = OpenAiChatRequest {
            model: model.to_string(),
            messages: oai_messages,
            stream: true,
            temperature: config.temperature,
            max_tokens: max_tokens_mapped,
            max_completion_tokens,
            tools: oai_tools,
            response_format,
            reasoning_effort: config.reasoning_effort,
        };

        info!(
            provider = %self.provider_name,
            model = model,
            "Starting chat stream"
        );

        let resp = self
            .send_with_retry(self.auth_post(&url).json(&request))
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "Chat request failed");
            return Err(ZenError::Custom(format!(
                "{} returned {}: {}",
                self.provider_name, status, body
            )));
        }

        let mut full_content = String::new();
        let mut results_tool_calls: Vec<ToolCallAccumulator> = Vec::new();
        let mut tokens_in: Option<i64> = None;
        let mut tokens_out: Option<i64> = None;
        let mut stream = resp.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk_result) = tokio::select! {
            res = stream.next() => res,
            _ = token.cancelled() => {
                debug!("Stream cancelled by client via select!");
                None
            }
        } {
            if token.is_cancelled() {
                debug!("Stream cancelled by client");
                break;
            }
            let bytes = chunk_result?;
            buffer.push_str(&String::from_utf8_lossy(&bytes));

            // SSE format: lines starting with "data: " followed by JSON
            while let Some(newline_pos) = buffer.find('\n') {
                let line = buffer[..newline_pos].trim().to_string();
                buffer = buffer[newline_pos + 1..].to_string();

                if line.is_empty() || !line.starts_with("data: ") {
                    continue;
                }

                let json_str = &line[6..]; // Strip "data: " prefix

                // Stream end marker
                if json_str == "[DONE]" {
                    debug!("Stream complete");
                    continue;
                }

                match serde_json::from_str::<OpenAiStreamChunk>(json_str) {
                    Ok(chunk) => {
                        // Extract content delta
                        for choice in &chunk.choices {
                            if let Some(content) = &choice.delta.content {
                                if !content.is_empty() {
                                    on_chunk(crate::llm::LlmChunk::Text(content.clone()));
                                    full_content.push_str(content);
                                }
                            }

                            // Extract tool calls delta
                            if let Some(deltas) = &choice.delta.tool_calls {
                                for delta in deltas {
                                    let idx = delta.index.unwrap_or(0);
                                    
                                    // Ensure results_tool_calls has enough space
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

                        // Extract usage if present (some providers include on last chunk)
                        if let Some(usage) = &chunk.usage {
                            tokens_in = usage.prompt_tokens;
                            tokens_out = usage.completion_tokens;
                        }
                    }
                    Err(e) => {
                        debug!(json = %json_str, error = %e, "Failed to parse SSE chunk");
                    }
                }
            }
        }

        // Finalize tool calls
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
        let url = self.url("/embeddings");
        let request = OpenAiEmbedRequest {
            model: model.to_string(),
            input: text.to_string(),
        };

        let resp = self.auth_post(&url).json(&request).send().await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(ZenError::Custom(format!(
                "Embedding failed ({}): {}",
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

    async fn health_check(&self) -> bool {
        let url = self.url("/models");
        match self.auth_get(&url).send().await {
            Ok(resp) => resp.status().is_success(),
            Err(_) => false,
        }
    }

    fn supports_tools(&self, model: &str) -> bool {
        // 1. Check capability cache from list_models()
        if let Ok(cache) = self.model_capabilities.read() {
            if let Some(caps) = cache.get(model) {
                return caps.supports_tools;
            }
        }

        // 2. Provider-level policy for unknown models
        self.provider_tool_policy()
    }
}

impl OpenAiCompatProvider {
    /// Provider-level default policy for tool support.
    /// Used as a fallback when the model is not in the capability cache.
    fn provider_tool_policy(&self) -> bool {
        let p = self.provider_name.to_lowercase();
        match p.as_str() {
            // Curated / official catalogs — all models support tools
            "openai" | "groq" | "mistral" | "gemini" | "google" |
            "deepseek" | "qwen" | "xai" | "kilocode" => true,

            // Mixed catalogs — many models lack tool support
            "openrouter" | "together" | "perplexity" => false,

            // Default: conservative (don't assume tools work)
            _ => false,
        }
    }
}

#[derive(Default)]
struct ToolCallAccumulator {
    id: String,
    name: String,
    arguments: String,
}
