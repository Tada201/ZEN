use anyhow::Result;
use async_trait::async_trait;
use serde_json::{json, Value};
use tauri::AppHandle;
use tokio_util::sync::CancellationToken;

use crate::tools::permission::RiskLevel;
use crate::tools::{ToolError, ToolOutput};

/// Real WebSearchTool that searches DuckDuckGo (free, no API key required)
/// and returns parsed results (title, snippet, URL).
pub struct WebSearchTool;

/// Maximum search results to return
const MAX_RESULTS: usize = 10;
/// Performs the actual DuckDuckGo HTML search and returns parsed results.
async fn duckduckgo_search(query: &str) -> Result<Vec<SearchResult>, String> {
    let client = crate::utils::duckduckgo_http_client();

    let params = [("q", query)];
    let response = client
        .post("https://html.duckduckgo.com/html/")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to reach DuckDuckGo: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("DuckDuckGo returned status: {}", response.status()));
    }

    let html_body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {e}"))?;

    parse_duckduckgo_results(&html_body)
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct SearchResult {
    title: String,
    snippet: String,
    url: String,
}

#[derive(Debug, serde::Deserialize)]
struct TavilyResponse {
    results: Vec<TavilyResult>,
}

#[derive(Debug, serde::Deserialize)]
struct TavilyResult {
    title: String,
    url: String,
    #[serde(default)]
    content: String,
}

#[derive(Debug, serde::Deserialize)]
struct ExaResponse {
    results: Vec<ExaResult>,
}

#[derive(Debug, serde::Deserialize)]
struct ExaResult {
    title: Option<String>,
    url: String,
    #[serde(default)]
    highlights: Vec<String>,
    summary: Option<String>,
    text: Option<String>,
}

async fn tavily_search(
    api_key: &str,
    query: &str,
    max_results: usize,
    depth: &str,
) -> Result<Vec<SearchResult>, String> {
    let response = crate::utils::default_http_client()
        .post("https://api.tavily.com/search")
        .bearer_auth(api_key)
        .json(&json!({
            "query": query,
            "search_depth": depth,
            "max_results": max_results,
            "include_answer": false,
            "include_raw_content": false,
            "include_images": false
        }))
        .send()
        .await
        .map_err(|error| format!("Tavily request failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("Tavily returned {}", response.status()));
    }

    let payload = response
        .json::<TavilyResponse>()
        .await
        .map_err(|error| format!("Invalid Tavily response: {error}"))?;
    Ok(payload
        .results
        .into_iter()
        .take(max_results)
        .map(|result| SearchResult {
            title: result.title,
            snippet: result.content,
            url: result.url,
        })
        .collect())
}

async fn exa_search(
    api_key: &str,
    query: &str,
    max_results: usize,
) -> Result<Vec<SearchResult>, String> {
    let response = crate::utils::default_http_client()
        .post("https://api.exa.ai/search")
        .header("x-api-key", api_key)
        .json(&json!({
            "query": query,
            "type": "auto",
            "numResults": max_results,
            "contents": {
                "highlights": { "maxCharacters": 800 },
                "summary": { "query": query }
            }
        }))
        .send()
        .await
        .map_err(|error| format!("Exa request failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("Exa returned {}", response.status()));
    }

    let payload = response
        .json::<ExaResponse>()
        .await
        .map_err(|error| format!("Invalid Exa response: {error}"))?;
    Ok(payload
        .results
        .into_iter()
        .take(max_results)
        .map(|result| SearchResult {
            title: result.title.unwrap_or_else(|| result.url.clone()),
            snippet: result
                .summary
                .or_else(|| result.highlights.first().cloned())
                .or(result.text)
                .unwrap_or_default(),
            url: result.url,
        })
        .collect())
}

async fn configured_search(
    app: &AppHandle,
    query: &str,
    input: &Value,
    token: &CancellationToken,
) -> Result<Value, String> {
    use tauri::Manager;
    let state = app
        .try_state::<crate::AppState>()
        .ok_or_else(|| "AppState not found in Tauri manager".to_string())?;
    let provider = state
        .settings_manager
        .get("web_search_provider")
        .await
        .unwrap_or_default()
        .unwrap_or_else(|| "auto".to_string());
    let depth = state
        .settings_manager
        .get("tavily_search_depth")
        .await
        .unwrap_or_default()
        .unwrap_or_else(|| "fast".to_string());
    let configured_max = state
        .settings_manager
        .get("web_search_max_results")
        .await
        .unwrap_or_default()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(MAX_RESULTS);
    let max_results = input
        .get("max_results")
        .and_then(Value::as_u64)
        .map(|value| value as usize)
        .unwrap_or(configured_max)
        .clamp(1, 20);
    let tavily_key = state
        .secret_manager
        .get_secret("tavily_api_key")
        .await
        .unwrap_or_default()
        .unwrap_or_default();
    let exa_key = state
        .secret_manager
        .get_secret("exa_api_key")
        .await
        .unwrap_or_default()
        .unwrap_or_default();

    let providers: Vec<&str> = match provider.as_str() {
        "tavily" => vec!["tavily", "exa", "duckduckgo"],
        "exa" => vec!["exa", "tavily", "duckduckgo"],
        "duckduckgo" => vec!["duckduckgo"],
        _ => vec!["tavily", "exa", "duckduckgo"],
    };
    let mut errors = Vec::new();

    for candidate in providers {
        if token.is_cancelled() {
            return Err("Web search cancelled".to_string());
        }
        let result = match candidate {
            "tavily" if !tavily_key.is_empty() => {
                tavily_search(&tavily_key, query, max_results, &depth).await
            }
            "exa" if !exa_key.is_empty() => exa_search(&exa_key, query, max_results).await,
            "duckduckgo" => duckduckgo_search(query).await,
            _ => continue,
        };
        match result {
            Ok(results) if !results.is_empty() => {
                return Ok(json!({
                    "query": query,
                    "provider": candidate,
                    "result_count": results.len(),
                    "results": results
                }))
            }
            Ok(_) => errors.push(format!("{candidate} returned no results")),
            Err(error) => errors.push(error),
        }
    }

    Err(format!("Web search failed: {}", errors.join("; ")))
}

#[allow(dead_code)]
async fn nine_router_search_fallback(
    app: &AppHandle,
    query: &str,
) -> Result<Vec<SearchResult>, String> {
    use tauri::Manager;
    let state = app
        .try_state::<crate::AppState>()
        .ok_or_else(|| "AppState not found in Tauri manager".to_string())?;

    let db_pool = state
        .db()
        .await
        .map_err(|e| format!("Failed to get database pool: {e}"))?;

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
    if let Some(params_str) = zen_db::queries::get_setting(&db_pool, "provider_params")
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

    let resp = post_req
        .send()
        .await
        .map_err(|e| format!("Failed to reach 9Router chat completion: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!(
            "9Router chat completion returned status: {}",
            resp.status()
        ));
    }

    let text_content = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read 9Router response text: {e}"))?;

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
        .map_err(|e| format!("Failed to parse chat completion structure: {e}"))?;

    let raw_content = completion
        .choices
        .first()
        .map(|c| c.message.content.trim())
        .ok_or_else(|| "9Router returned an empty choice list".to_string())?;

    // Strip markdown code block wrappers if any
    let cleaned_json = raw_content
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let results: Vec<SearchResult> = serde_json::from_str(cleaned_json).map_err(|e| {
        format!(
            "Failed to parse search results JSON from model content: {e}"
        )
    })?;

    Ok(results)
}

/// Extracts the clean destination URL from a DuckDuckGo redirect link.
/// DuckDuckGo wraps result URLs in `//duckduckgo.com/l/?uddg=<encoded_url>&rut=...`.
fn clean_ddg_url(href: &str) -> String {
    // Skip protocol-relative prefix and parse query parameters
    let href = href.trim_start_matches("//");
    if let Ok(parsed) = url::Url::parse(&format!("https://{href}")) {
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
        .map_err(|e| format!("Failed to parse result selector: {e}"))?;
    let title_selector = Selector::parse(".result__title a")
        .map_err(|e| format!("Failed to parse title selector: {e}"))?;
    let snippet_selector = Selector::parse(".result__snippet")
        .map_err(|e| format!("Failed to parse snippet selector: {e}"))?;

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
impl zen_tools::AgentTool<tauri::AppHandle> for WebSearchTool {
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
                },
                "max_results": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 20,
                    "description": "Optional result limit. Defaults to the configured web-search limit."
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
        _allowed_tools: Option<
            std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>,
        >,
        token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let query = input.get("query").and_then(|v| v.as_str()).unwrap_or("");
        if query.is_empty() {
            return Ok(json!("No search query provided."));
        }

        configured_search(&app, query, &input, &token)
            .await
            .map_err(anyhow::Error::msg)
    }
}

#[async_trait]
impl zen_tools::Tool<tauri::AppHandle> for WebSearchTool {
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
                },
                "max_results": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 20,
                    "description": "Optional result limit. Defaults to the configured web-search limit."
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

        let token = CancellationToken::new();
        configured_search(&app, query, &args, &token)
            .await
            .map(|content| ToolOutput {
                content,
                metadata: None,
            })
            .map_err(|message| ToolError::ExecutionFailed { message })
    }
}
