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

#[async_trait]
impl Tool for WebFetchTool {
    fn name(&self) -> &str {
        "web_fetch"
    }

    fn description(&self) -> &str {
        "Fetches the text content of a given HTTP/HTTPS URL. Use this to read web pages or APIs."
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
        _app: AppHandle,
        _chat_id: String,
        args: serde_json::Value,
    ) -> Result<ToolOutput, ToolError> {
        let parsed_args: WebFetchArgs = serde_json::from_value(args)
            .map_err(|e| ToolError::InvalidArguments { details: format!("Invalid arguments: {}", e) })?;

        let url = parsed_args.url.trim();
        
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return Err(ToolError::InvalidArguments { details: "URL must start with http:// or https://".into() });
        }

        // We use reqwest for the fetch.
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| ToolError::ExecutionFailed { message: format!("Failed to build HTTP client: {}", e) })?;

        let response = client.get(url)
            .send()
            .await
            .map_err(|e| ToolError::ExecutionFailed { message: format!("Failed to fetch URL: {}", e) })?;

        let status = response.status();
        if !status.is_success() {
            return Err(ToolError::ExecutionFailed { message: format!("HTTP request failed with status: {}", status) });
        }

        let text = response.text()
            .await
            .map_err(|e| ToolError::ExecutionFailed { message: format!("Failed to read response body: {}", e) })?;

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
