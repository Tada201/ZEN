//! Agent-facing `browser` tool: drives the embedded WebView2 preview panel.
//!
//! Actions map onto `BrowserManager`: navigate/reload the page, trusted
//! click/type via CDP `Input.*`, read DOM text via `Runtime.evaluate`, capture
//! a screenshot (returned as an `asset://` URI, never inline base64), and tail
//! the console ring buffer. All URLs are re-validated Rust-side by the
//! loopback-gated allowlist — the model never hands a raw URL to the privileged
//! webview.
//!
//! Windows/WebView2 only; on other platforms every action returns an error.

use crate::commands::AppState;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

pub struct BrowserTool;

impl BrowserTool {
    fn manager(app: &AppHandle) -> std::sync::Arc<crate::browser::BrowserManager> {
        app.state::<AppState>().browser.clone()
    }
}

#[async_trait]
impl zen_tools::AgentTool<tauri::AppHandle> for BrowserTool {
    fn id(&self) -> &str {
        "browser"
    }

    fn description(&self) -> &str {
        "Drive the embedded browser preview: navigate to a URL, click an element, \
         type text, read page text, capture a screenshot, or read the console log. \
         Use to inspect and interact with a running web app (e.g. the local dev server)."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["navigate", "reload", "click", "type", "read", "screenshot", "console"],
                    "description": "The browser action to perform."
                },
                "url": { "type": "string", "description": "URL to open (action=navigate)." },
                "selector": { "type": "string", "description": "CSS selector to target (click; optional focus target for type/read)." },
                "text": { "type": "string", "description": "Text to type (action=type)." }
            },
            "required": ["action"]
        })
    }

    fn timeout_seconds(&self) -> u64 {
        60
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
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let action = input
            .get("action")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("browser: missing 'action'"))?
            .to_string();
        let selector = input.get("selector").and_then(|v| v.as_str()).map(String::from);
        let text = input.get("text").and_then(|v| v.as_str()).map(String::from);
        let url = input.get("url").and_then(|v| v.as_str()).map(String::from);

        let mgr = Self::manager(&app);
        // Blocking WebView2/COM work must run on the main thread; the manager's
        // methods internally hop there via `with_webview`, so we just call them.
        let mut actions: Vec<String> = Vec::new();
        let mut result = Value::Null;

        match action.as_str() {
            "navigate" => {
                let u = url.ok_or_else(|| anyhow!("browser navigate: missing 'url'"))?;
                // Agent-driven nav allows loopback (the active workspace dev server).
                let final_url = mgr.navigate(&app, &u, true).map_err(|e| anyhow!(e))?;
                actions.push(format!("navigate {final_url}"));
                result = json!({ "navigated": final_url });
            }
            "reload" => {
                mgr.reload(&app).map_err(|e| anyhow!(e))?;
                actions.push("reload".into());
            }
            "click" => {
                let sel = selector
                    
                    .ok_or_else(|| anyhow!("browser click: missing 'selector'"))?;
                mgr.click(&app, &sel).map_err(|e| anyhow!(e))?;
                actions.push(format!("click {sel}"));
            }
            "type" => {
                let t = text.ok_or_else(|| anyhow!("browser type: missing 'text'"))?;
                mgr.type_text(&app, selector.as_deref(), &t)
                    .map_err(|e| anyhow!(e))?;
                actions.push(format!("type {} chars", t.chars().count()));
            }
            "read" => {
                let content = mgr.read(&app, selector.as_deref()).map_err(|e| anyhow!(e))?;
                actions.push("read".into());
                result = json!({ "text": content });
            }
            "screenshot" => {
                // handled below (always attaches the screenshot URI)
                actions.push("screenshot".into());
            }
            "console" => {
                actions.push("console".into());
            }
            other => return Err(anyhow!("browser: unknown action '{other}'")),
        }

        // A screenshot + console tail accompany every successful action so the
        // agent always gets fresh visual + diagnostic state, matching the
        // { url, screenshot, actions, result, console } shape the UI renders.
        let screenshot = mgr.screenshot(&app).ok();
        let console = mgr.console_tail(50);

        Ok(json!({
            "url": mgr.current_url(),
            "screenshot": screenshot,
            "actions": actions,
            "result": result,
            "console": console,
        }))
    }
}
