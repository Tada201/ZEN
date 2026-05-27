use async_trait::async_trait;
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::json;
use tauri::AppHandle;
use url::Url;

use super::url_safety::{
    resolve_redirect_url, validate_public_http_url, validate_public_ip, MAX_DIRECT_RESPONSE_BYTES,
    MAX_OUTPUT_CHARS, MAX_REDIRECTS,
};
use super::{permission::RiskLevel, Tool, ToolError, ToolOutput};

pub struct WebFetchTool;

#[derive(Deserialize)]
struct WebFetchArgs {
    url: String,
}

async fn validate_resolved_ips(url: &Url) -> Result<(), String> {
    let host = url
        .host_str()
        .ok_or_else(|| "URL must include a host".to_string())?;
    let port = url
        .port_or_known_default()
        .ok_or_else(|| "URL must include a valid port".to_string())?;

    let addrs = tokio::net::lookup_host((host, port))
        .await
        .map_err(|e| format!("DNS resolution failed: {}", e))?;

    let mut resolved_any = false;
    for addr in addrs {
        resolved_any = true;
        validate_public_ip(addr.ip())?;
    }

    if !resolved_any {
        return Err("DNS resolution returned no addresses".to_string());
    }

    Ok(())
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

async fn fetch_public_url(client: &reqwest::Client, start_url: Url) -> Result<String, String> {
    let mut current_url = start_url;

    for redirect_count in 0..=MAX_REDIRECTS {
        validate_resolved_ips(&current_url).await?;

        let response = client
            .get(current_url.clone())
            .send()
            .await
            .map_err(|e| format!("Fetch failed: {}", e))?;

        if response.status().is_redirection() {
            if redirect_count == MAX_REDIRECTS {
                return Err(format!("Too many redirects, max is {}", MAX_REDIRECTS));
            }

            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| "Redirect response missing Location header".to_string())?;
            current_url = resolve_redirect_url(&current_url, location)?;
            continue;
        }

        if !response.status().is_success() {
            return Err(format!(
                "Direct fetch returned status: {}",
                response.status()
            ));
        }

        return read_capped_text(response).await;
    }

    Err(format!("Too many redirects, max is {}", MAX_REDIRECTS))
}

fn truncate_chars(text: &str, max_chars: usize) -> String {
    text.chars().take(max_chars).collect()
}

async fn nine_router_fetch_fallback(app: &AppHandle, url: &str) -> Result<String, String> {
    use tauri::Manager;
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

    // 2. Fetch models to perform dynamic search model discovery
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
                    // Find model that matches keywords: sonar, perplexity, search, online
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

    // 3. Post to chat completion endpoint
    let chat_url = format!(
        "{}/chat/completions",
        nine_router_base_url.trim_end_matches('/')
    );
    let payload = json!({
        "model": selected_model,
        "messages": [
            {
                "role": "system",
                "content": "You are a web retriever helper. Your task is to fetch the full text or clean markdown content of the requested URL. Return ONLY the clean extracted text/markdown of the target page's contents. Do not explain, do not add introductions, just return the text of the page directly."
            },
            {
                "role": "user",
                "content": format!("Fetch and extract page contents for: {}", url)
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
            Err(err) => nine_router_fetch_fallback(&app, url).await.map_err(|e| {
                ToolError::ExecutionFailed {
                    message: format!("Direct fetch failed: {}. Fallback fetch failed: {}", err, e),
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
