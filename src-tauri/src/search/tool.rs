use async_trait::async_trait;
use serde_json::{json, Value};
use anyhow::Result;
use tauri::AppHandle;

use crate::agent::tools::AgentTool;
use crate::tools::{Tool, ToolOutput, ToolError};
use crate::tools::permission::RiskLevel;

/// Real WebSearchTool that searches DuckDuckGo (free, no API key required)
/// and returns parsed results (title, snippet, URL).
pub struct WebSearchTool;

/// Maximum search results to return
const MAX_RESULTS: usize = 10;
/// Timeout for the HTTP request
const REQUEST_TIMEOUT_SECS: u64 = 15;

/// Performs the actual DuckDuckGo HTML search and returns parsed results.
async fn duckduckgo_search(query: &str) -> Result<Vec<SearchResult>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; rv:135.0) Gecko/20100101 Firefox/135.0")
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let params = [("q", query)];
    let response = client
        .post("https://html.duckduckgo.com/html/")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to reach DuckDuckGo: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("DuckDuckGo returned status: {}", response.status()));
    }

    let html_body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    parse_duckduckgo_results(&html_body)
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct SearchResult {
    title: String,
    snippet: String,
    url: String,
}

async fn nine_router_search_fallback(app: &AppHandle, query: &str) -> Result<Vec<SearchResult>, String> {
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
                "content": "You are a web search helper. Your task is to perform the requested search and output a valid JSON array of up to 10 search results. Each result MUST be an object with keys: 'title', 'snippet', and 'url'. Return ONLY the raw JSON array (do not wrap in markdown or backticks)."
            },
            {
                "role": "user",
                "content": format!("Search query: {}", query)
            }
        ],
        "temperature": 0.3
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
        .map(|c| c.message.content.trim())
        .ok_or_else(|| "9Router returned an empty choice list".to_string())?;

    // Strip markdown code block wrappers if any
    let cleaned_json = raw_content
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let results: Vec<SearchResult> = serde_json::from_str(cleaned_json)
        .map_err(|e| format!("Failed to parse search results JSON from model content: {}", e))?;

    Ok(results)
}

/// Extracts the clean destination URL from a DuckDuckGo redirect link.
/// DuckDuckGo wraps result URLs in `//duckduckgo.com/l/?uddg=<encoded_url>&rut=...`.
fn clean_ddg_url(href: &str) -> String {
    // Skip protocol-relative prefix and parse query parameters
    let href = href.trim_start_matches("//");
    if let Ok(parsed) = url::Url::parse(&format!("https://{}", href)) {
        if let Some(uddg) = parsed.query_pairs().find(|(k, _)| k == "uddg") {
            // uddg is already percent-decoded by query_pairs(); return it directly
            return uddg.1.to_string();
        }
    }
    // If it's not a DDG redirect (e.g. already a clean URL), return as-is
    href.to_string()
}

/// Parses DuckDuckGo HTML search results page.
fn parse_duckduckgo_results(html: &str) -> Result<Vec<SearchResult>, String> {
    use scraper::{Html, Selector};

    let document = Html::parse_document(html);

    let result_selector = Selector::parse(".result")
        .map_err(|e| format!("Failed to parse result selector: {}", e))?;
    let title_selector = Selector::parse(".result__title a")
        .map_err(|e| format!("Failed to parse title selector: {}", e))?;
    let snippet_selector = Selector::parse(".result__snippet")
        .map_err(|e| format!("Failed to parse snippet selector: {}", e))?;

    let mut results = Vec::new();

    for result_elem in document.select(&result_selector).take(MAX_RESULTS) {
        // Extract title and URL from the first <a> inside .result__title
        let title_elem = result_elem.select(&title_selector).next();
        let title = title_elem
            .as_ref()
            .map(|e| e.text().collect::<String>().trim().to_string())
            .unwrap_or_default();

        let raw_url = title_elem
            .and_then(|e| e.value().attr("href"))
            .unwrap_or("")
            .to_string();
        let url = clean_ddg_url(&raw_url);

        // Extract snippet text
        let snippet = result_elem
            .select(&snippet_selector)
            .next()
            .map(|e| e.text().collect::<String>().trim().to_string())
            .unwrap_or_default();

        if title.is_empty() && snippet.is_empty() {
            continue;
        }

        results.push(SearchResult {
            title,
            snippet,
            url,
        });
    }

    Ok(results)
}

#[async_trait]
impl AgentTool for WebSearchTool {
    fn id(&self) -> &str {
        "web_search"
    }

    fn description(&self) -> &str {
        "Search the web for current information. Uses DuckDuckGo (no API key required). Returns up to 10 results with title, snippet, and URL."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query"
                }
            },
            "required": ["query"]
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        _chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>>,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let query = input.get("query").and_then(|v| v.as_str()).unwrap_or("");
        if query.is_empty() {
            return Ok(json!("No search query provided."));
        }

        match duckduckgo_search(query).await {
            Ok(results) => {
                if results.is_empty() {
                    match nine_router_search_fallback(&app, query).await {
                        Ok(fallback_results) => Ok(json!({
                            "query": query,
                            "results": fallback_results,
                            "result_count": fallback_results.len()
                        })),
                        Err(_) => Ok(json!(format!("Web search for '{}' returned no results.", query)))
                    }
                } else {
                    Ok(json!({
                        "query": query,
                        "results": results,
                        "result_count": results.len()
                    }))
                }
            }
            Err(err) => {
                match nine_router_search_fallback(&app, query).await {
                    Ok(fallback_results) => Ok(json!({
                        "query": query,
                        "results": fallback_results,
                        "result_count": fallback_results.len()
                    })),
                    Err(fallback_err) => Ok(json!(format!("Web search failed: {}. Fallback search failed: {}", err, fallback_err)))
                }
            }
        }
    }
}

#[async_trait]
impl Tool for WebSearchTool {
    fn name(&self) -> &str {
        "web_search"
    }

    fn description(&self) -> &str {
        "Search the web for current information. Uses DuckDuckGo (no API key required). Returns up to 10 results."
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query"
                }
            },
            "required": ["query"]
        })
    }

    fn risk_level(&self) -> RiskLevel {
        RiskLevel::Medium
    }

    async fn execute(
        &self,
        app: AppHandle,
        _chat_id: String,
        args: Value,
    ) -> Result<ToolOutput, ToolError> {
        let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
        if query.is_empty() {
            return Ok(ToolOutput {
                content: json!("No search query provided."),
                metadata: None,
            });
        }

        match duckduckgo_search(query).await {
            Ok(results) => {
                if results.is_empty() {
                    match nine_router_search_fallback(&app, query).await {
                        Ok(fallback_results) => Ok(ToolOutput {
                            content: json!({
                                "query": query,
                                "results": fallback_results,
                                "result_count": fallback_results.len()
                            }),
                            metadata: None,
                        }),
                        Err(_) => Ok(ToolOutput {
                            content: json!(format!("Web search for '{}' returned no results.", query)),
                            metadata: None,
                        })
                    }
                } else {
                    Ok(ToolOutput {
                        content: json!({
                            "query": query,
                            "results": results,
                            "result_count": results.len()
                        }),
                        metadata: None,
                    })
                }
            }
            Err(err) => {
                match nine_router_search_fallback(&app, query).await {
                    Ok(fallback_results) => Ok(ToolOutput {
                        content: json!({
                            "query": query,
                            "results": fallback_results,
                            "result_count": fallback_results.len()
                        }),
                        metadata: None,
                    }),
                    Err(fallback_err) => Ok(ToolOutput {
                        content: json!(format!("Web search failed: {}. Fallback search failed: {}", err, fallback_err)),
                        metadata: None,
                    })
                }
            }
        }
    }
}
