use std::sync::Arc;

use anyhow::Result;
use async_trait::async_trait;
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::AppHandle;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use url::Url;

use crate::agent::tools::AgentTool;

use super::url_safety::{
    build_pinned_get_request, resolve_redirect_url, validate_public_http_url,
    validate_url_dns_safety, MAX_DIRECT_RESPONSE_BYTES, MAX_OUTPUT_CHARS, MAX_REDIRECTS,
};
use super::{permission::RiskLevel, Tool, ToolError, ToolOutput};

pub struct WebFetchTool;

#[derive(Deserialize)]
struct WebFetchArgs {
    url: String,
}

/// Categorized fetch failure.
///
/// `Safety` errors MUST NEVER trigger the Nine Router fallback — the URL
/// failed validation and retrying through a different transport would defeat
/// the safety boundary. `Transport` and `Content` errors are recoverable
/// runtime failures and may use the fallback.
#[derive(Debug)]
enum FetchError {
    Safety(String),
    Transport(String),
    Content(String),
}

impl std::fmt::Display for FetchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FetchError::Safety(s)
            | FetchError::Transport(s)
            | FetchError::Content(s) => write!(f, "{}", s),
        }
    }
}

async fn read_capped_text(response: reqwest::Response) -> Result<String, String> {
    if let Some(content_length) = response.content_length() {
        if content_length > MAX_DIRECT_RESPONSE_BYTES as u64 {
            return Err(format!(
                "Response too large: {} bytes exceeds {} byte limit",
                content_length, MAX_DIRECT_RESPONSE_BYTES
            ));
        }
    }

    let mut stream = response.bytes_stream();
    let mut bytes = Vec::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Failed to read response body: {}", e))?;
        if bytes.len() + chunk.len() > MAX_DIRECT_RESPONSE_BYTES {
            return Err(format!(
                "Response too large: exceeded {} byte limit",
                MAX_DIRECT_RESPONSE_BYTES
            ));
        }
        bytes.extend_from_slice(&chunk);
    }

    String::from_utf8(bytes).map_err(|e| format!("Response body is not valid UTF-8: {}", e))
}

async fn fetch_public_url(client: &reqwest::Client, start_url: Url) -> Result<String, FetchError> {
    let mut current_url = start_url;

    for redirect_count in 0..=MAX_REDIRECTS {
        // DNS / IP safety — never falls back. The pinned helper resolves
        // the hostname exactly once, validates every returned IP, and
        // returns a RequestBuilder whose underlying client is locked to
        // the validated address so the connection cannot re-resolve to a
        // private IP mid-flight.
        let request = build_pinned_get_request(client, &current_url)
            .await
            .map_err(FetchError::Safety)?;

        // Network send — recoverable, may fall back.
        let response = request
            .send()
            .await
            .map_err(|e| FetchError::Transport(format!("Fetch failed: {}", e)))?;

        if response.status().is_redirection() {
            if redirect_count == MAX_REDIRECTS {
                return Err(FetchError::Safety(format!(
                    "Too many redirects, max is {}",
                    MAX_REDIRECTS
                )));
            }

            // Redirect handling is a safety boundary: each hop must be
            // re-validated against the URL safety rules.
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| {
                    FetchError::Safety("Redirect response missing Location header".to_string())
                })?;
            current_url = resolve_redirect_url(&current_url, location).map_err(FetchError::Safety)?;
            continue;
        }

        if !response.status().is_success() {
            return Err(FetchError::Content(format!(
                "Direct fetch returned status: {}",
                response.status()
            )));
        }

        // Body read — content-level, may fall back on size / decode failure.
        return read_capped_text(response).await.map_err(FetchError::Content);
    }

    Err(FetchError::Safety(format!(
        "Too many redirects, max is {}",
        MAX_REDIRECTS
    )))
}

fn truncate_chars(text: &str, max_chars: usize) -> String {
    text.chars().take(max_chars).collect()
}

/// Fallback path used when the direct pinned-address fetch fails with a
/// recoverable transport or content error.
///
/// **SSRF contract:** Zen owns the HTTP fetch. The URL is fetched once
/// through `fetch_public_url` (pinned-address DNS resolution + IP
/// validation) so the connection can never silently re-resolve to a
/// private IP. Only the *already-fetched* content is forwarded to
/// 9Router for text extraction — the URL itself is never sent to 9Router
/// for fetching.
async fn nine_router_fetch_fallback(app: &AppHandle, url: &str) -> Result<String, String> {
    use tauri::Manager;

    // 1. Validate the URL through the same safety gates the direct path
    //    uses. A safety failure here means the URL is forbidden — never
    //    fall back to a different transport.
    let validated = validate_public_http_url(url)
        .map_err(|e| format!("Fallback URL safety check failed: {}", e))?;
    validate_url_dns_safety(&validated)
        .await
        .map_err(|e| format!("Fallback DNS safety check failed: {}", e))?;

    // 2. Fetch the content ourselves using the pinned-address client.
    //    This is the same SSRF-safe fetch the direct path uses — Zen
    //    resolves DNS once, validates every IP, pins the connection, and
    //    streams the body under the byte cap.
    let pinned_client = crate::utils::public_no_redirect_http_client();
    let raw_html = fetch_public_url(pinned_client, validated)
        .await
        .map_err(|e| format!("Fallback pinned fetch failed: {}", e))?;

    // 3. Send the *already-fetched content* to 9Router for text
    //    extraction only. The URL is included only as metadata so the
    //    model can contextualise the content — it must NOT re-fetch it.
    let state = app
        .try_state::<crate::AppState>()
        .ok_or_else(|| "AppState not found in Tauri manager".to_string())?;

    let db_pool = state
        .db()
        .await
        .map_err(|e| format!("Failed to get database pool: {}", e))?;

    let nine_router_base_url = state
        .settings_manager
        .get("nine_router_base_url")
        .await
        .unwrap_or_default()
        .unwrap_or_else(|| "http://localhost:20128/v1".to_string());

    let nine_router_api_key = state
        .secret_manager
        .get_secret("nine_router_api_key")
        .await
        .unwrap_or_default()
        .unwrap_or_default();

    // Apply the same remote-auth safety guard used by provider/model
    // discovery before attaching a bearer credential. Loopback HTTP is
    // allowed; remote HTTP without TLS is rejected.
    crate::utils::validate_remote_auth_safety(
        &nine_router_base_url,
        !nine_router_api_key.is_empty(),
    )
    .map_err(|e| format!("9Router endpoint auth safety check failed: {}", e))?;

    let client = crate::utils::default_http_client();
    let models_url = format!("{}/models", nine_router_base_url.trim_end_matches('/'));

    let mut selected_model = "kr/claude-sonnet-4.5".to_string(); // Premium fallback model
    let mut has_explicit_search_model = false;

    // Load custom searchModel from settings if present
    if let Some(params_str) = crate::db::queries::get_setting(&db_pool, "provider_params")
        .await
        .unwrap_or_default()
    {
        if let Ok(params_val) = serde_json::from_str::<serde_json::Value>(&params_str) {
            if let Some(model) = params_val
                .get("nine_router")
                .and_then(|nr| nr.get("searchModel"))
                .and_then(|m| m.as_str())
            {
                selected_model = model.to_string();
                has_explicit_search_model = true;
            }
        }
    }

    if !has_explicit_search_model {
        let mut request = client.get(&models_url);
        if !nine_router_api_key.is_empty() {
            request = request.bearer_auth(&nine_router_api_key);
        }

        if let Ok(resp) = request.send().await {
            if resp.status().is_success() {
                #[derive(serde::Deserialize)]
                struct ModelObj {
                    id: String,
                }
                #[derive(serde::Deserialize)]
                struct ModelsResp {
                    data: Vec<ModelObj>,
                }

                if let Ok(models_data) = resp.json::<ModelsResp>().await {
                    let keywords = ["sonar", "perplexity", "search", "online"];
                    for m in models_data.data {
                        let id_lower = m.id.to_lowercase();
                        if keywords.iter().any(|&k| id_lower.contains(k)) {
                            selected_model = m.id;
                            break;
                        }
                    }
                }
            }
        }
    }

    // 4. Post to chat completion endpoint — send the *content*, not the
    //    URL, so 9Router never performs its own fetch.
    let chat_url = format!(
        "{}/chat/completions",
        nine_router_base_url.trim_end_matches('/')
    );

    // Truncate raw HTML to fit within a reasonable prompt window.
    let content_for_extraction = truncate_chars(&raw_html, MAX_OUTPUT_CHARS);

    let payload = json!({
        "model": selected_model,
        "messages": [
            {
                "role": "system",
                "content": "You are a text extraction helper. You will receive the raw HTML/text content that was already fetched from a web page. Your task is to extract and clean the meaningful text. Return ONLY the clean extracted text/markdown. Do not explain, do not add introductions, just return the clean text directly."
            },
            {
                "role": "user",
                "content": format!("Extract clean text from the following content (originally fetched from {}):\n\n{}", url, content_for_extraction)
            }
        ],
        "temperature": 0.2
    });

    let mut post_req = client.post(&chat_url).json(&payload);
    if !nine_router_api_key.is_empty() {
        post_req = post_req.bearer_auth(&nine_router_api_key);
    }

    let resp = post_req
        .send()
        .await
        .map_err(|e| format!("Failed to reach 9Router chat completion: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!(
            "9Router chat completion returned status: {}",
            resp.status()
        ));
    }

    let text_content = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read 9Router response text: {}", e))?;

    // Parse the chat completions JSON
    #[derive(serde::Deserialize)]
    struct ChoiceMsg {
        content: String,
    }
    #[derive(serde::Deserialize)]
    struct Choice {
        message: ChoiceMsg,
    }
    #[derive(serde::Deserialize)]
    struct ChatCompletion {
        choices: Vec<Choice>,
    }

    let completion: ChatCompletion = serde_json::from_str(&text_content)
        .map_err(|e| format!("Failed to parse chat completion structure: {}", e))?;

    let raw_content = completion
        .choices
        .first()
        .map(|c| c.message.content.trim().to_string())
        .ok_or_else(|| "9Router returned an empty choice list".to_string())?;

    Ok(raw_content)
}

#[async_trait]
impl Tool for WebFetchTool {
    fn name(&self) -> &str {
        "web_fetch"
    }

    fn description(&self) -> &str {
        "Fetches the text content of a given HTTP/HTTPS URL. Use this to read web pages or APIs."
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The full URL to fetch, including http:// or https://"
                }
            },
            "required": ["url"]
        })
    }

    fn risk_level(&self) -> RiskLevel {
        RiskLevel::High
        // High risk because it can be used for SSRF if the AI is tricked into requesting local network IPs
    }

    async fn execute(
        &self,
        app: AppHandle,
        _chat_id: String,
        args: serde_json::Value,
    ) -> Result<ToolOutput, ToolError> {
        let parsed_args: WebFetchArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArguments {
                details: format!("Invalid arguments: {}", e),
            })?;

        let url = parsed_args.url.trim();
        let validated_url = validate_public_http_url(url)
            .map_err(|e| ToolError::InvalidArguments { details: e })?;

        // Reuse the shared client so repeated tool calls do not rebuild pools.
        let client = crate::utils::public_no_redirect_http_client();

        let text = match fetch_public_url(client, validated_url).await {
            Ok(text) => text,
            Err(FetchError::Safety(reason)) => {
                // Safety failures must NEVER fall back to 9Router — the URL
                // failed validation, and retrying through a different
                // transport would defeat the safety boundary.
                return Err(ToolError::InvalidArguments {
                    details: format!(
                        "URL safety check failed (no fallback used): {}",
                        reason
                    ),
                });
            }
            Err(err) => nine_router_fetch_fallback(&app, url).await.map_err(|e| {
                ToolError::ExecutionFailed {
                    message: format!(
                        "Direct fetch failed: {}. Fallback fetch failed: {}",
                        err, e
                    ),
                }
            })?,
        };

        // Truncate to avoid exploding context window (e.g. max 16KB of text)
        let final_text = if text.len() > MAX_OUTPUT_CHARS {
            format!(
                "{}... [TRUNCATED - Content exceeded 16KB]",
                truncate_chars(&text, MAX_OUTPUT_CHARS)
            )
        } else {
            text
        };

        Ok(ToolOutput {
            content: json!({
                "url": url,
                "content": final_text
            }),
            metadata: None,
        })
    }
}

#[async_trait]
impl AgentTool for WebFetchTool {
    fn id(&self) -> &str {
        "web_fetch"
    }

    fn description(&self) -> &str {
        "Fetches the text content of a given HTTP/HTTPS URL. Use this to read web pages or APIs."
    }

    fn input_schema(&self) -> Value {
        self.parameters_schema()
    }

    async fn run(
        &self,
        app: AppHandle,
        chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<Arc<Mutex<std::collections::HashSet<String>>>>,
        _token: CancellationToken,
    ) -> Result<Value> {
        Tool::execute(self, app, chat_id, input)
            .await
            .map(|output| output.content)
            .map_err(|e| anyhow::anyhow!("{}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_localhost_hostname() {
        assert!(validate_public_http_url("http://localhost:8080").is_err());
    }

    #[test]
    fn rejects_private_ipv4() {
        assert!(validate_public_http_url("http://192.168.1.10/").is_err());
        assert!(validate_public_http_url("http://10.0.0.1/").is_err());
        assert!(validate_public_http_url("http://172.16.0.1/").is_err());
    }

    #[test]
    fn rejects_link_local_metadata_ipv4() {
        assert!(validate_public_http_url("http://169.254.169.254/latest").is_err());
    }

    #[test]
    fn rejects_loopback_ipv6() {
        assert!(validate_public_http_url("http://[::1]/").is_err());
    }

    #[test]
    fn accepts_public_https_url() {
        assert!(validate_public_http_url("https://example.com/path").is_ok());
    }

    #[test]
    fn rejects_non_http_scheme() {
        assert!(validate_public_http_url("file:///etc/passwd").is_err());
    }
}
