use async_trait::async_trait;
use serde::Deserialize;
use serde_json::json;
use tauri::AppHandle;

use super::{permission::RiskLevel, Tool, ToolError, ToolOutput};

pub struct WebFetchTool;

#[derive(Deserialize)]
struct WebFetchArgs {
    url: String,
}

async fn nine_router_fetch_fallback(app: &AppHandle, url: &str) -> Result<String, String> {
    use tauri::Manager;
    let state = app.try_state::<crate::AppState>()
        .ok_or_else(|| "AppState not found in Tauri manager".to_string())?;
    
    let db_pool = state.db().await
        .map_err(|e| format!("Failed to get database pool: {}", e))?;
    
    let nine_router_base_url = crate::db::queries::get_setting(&db_pool, "nine_router_base_url")
        .await
        .unwrap_or_default()
        .unwrap_or_else(|| "http://localhost:20128/v1".to_string());
    
    let nine_router_api_key = crate::db::queries::get_setting(&db_pool, "nine_router_api_key")
        .await
        .unwrap_or_default()
        .unwrap_or_default();

    // 2. Fetch models to perform dynamic search model discovery
    let client = reqwest::Client::new();
    let models_url = format!("{}/models", nine_router_base_url.trim_end_matches('/'));
    
    let mut selected_model = "kr/claude-sonnet-4.5".to_string(); // Premium fallback model
    let mut has_explicit_search_model = false;

    // Load custom searchModel from settings if present
    if let Some(params_str) = crate::db::queries::get_setting(&db_pool, "providerParams")
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
                struct ModelObj { id: String }
                #[derive(serde::Deserialize)]
                struct ModelsResp { data: Vec<ModelObj> }

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
    let chat_url = format!("{}/chat/completions", nine_router_base_url.trim_end_matches('/'));
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

    let resp = post_req.send().await
        .map_err(|e| format!("Failed to reach 9Router chat completion: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("9Router chat completion returned status: {}", resp.status()));
    }

    let text_content = resp.text().await
        .map_err(|e| format!("Failed to read 9Router response text: {}", e))?;

    // Parse the chat completions JSON
    #[derive(serde::Deserialize)]
    struct ChoiceMsg { content: String }
    #[derive(serde::Deserialize)]
    struct Choice { message: ChoiceMsg }
    #[derive(serde::Deserialize)]
    struct ChatCompletion { choices: Vec<Choice> }

    let completion: ChatCompletion = serde_json::from_str(&text_content)
        .map_err(|e| format!("Failed to parse chat completion structure: {}", e))?;

    let raw_content = completion.choices.first()
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
        let parsed_args: WebFetchArgs = serde_json::from_value(args)
            .map_err(|e| ToolError::InvalidArguments { details: format!("Invalid arguments: {}", e) })?;

        let url = parsed_args.url.trim();
        
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return Err(ToolError::InvalidArguments { details: "URL must start with http:// or https://".into() });
        }

        // We try reqwest first for direct fetch.
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| ToolError::ExecutionFailed { message: format!("Failed to build HTTP client: {}", e) })?;

        let fetch_result = client.get(url).send().await;

        let text = match fetch_result {
            Ok(response) => {
                let status = response.status();
                if status.is_success() {
                    response.text().await.map_err(|e| ToolError::ExecutionFailed { message: format!("Failed to read response body: {}", e) })?
                } else {
                    nine_router_fetch_fallback(&app, url).await
                        .map_err(|e| ToolError::ExecutionFailed { message: format!("Direct fetch failed with status: {}. Fallback fetch failed: {}", status, e) })?
                }
            }
            Err(err) => {
                nine_router_fetch_fallback(&app, url).await
                    .map_err(|e| ToolError::ExecutionFailed { message: format!("Direct fetch failed: {}. Fallback fetch failed: {}", err, e) })?
            }
        };

        // Truncate to avoid exploding context window (e.g. max 16KB of text)
        let max_len = 16 * 1024;
        let final_text = if text.len() > max_len {
            format!("{}... [TRUNCATED - Content exceeded 16KB]", &text[..max_len])
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
