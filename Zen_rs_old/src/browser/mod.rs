//! Embedded WebView2 preview panel.
//!
//! The React `BrowserPreview` panel is a transparent placeholder that reports
//! its bounding rect; here we attach a *real* child WebView2 over that rect on
//! the `main` window (via the unstable `Window::add_child` API) and keep its
//! bounds in sync. This is the thing a sandboxed cross-origin `<iframe>` can't
//! be: console/error capture, screenshots, and (later) trusted CDP input all
//! run against this native webview.
//!
//! Windows/WebView2 only — matches the app's target. The isolated child webview
//! gets its own `data_directory` and is granted no Tauri command capabilities.

pub mod bridge;
pub mod cdp;
pub mod screenshot;
pub mod url_policy;

use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::{
    webview::WebviewBuilder,
    LogicalPosition, LogicalSize, Manager, Rect, Runtime, WebviewUrl,
};

pub use bridge::ConsoleEntry;

/// Console ring-buffer cap. Bounds memory for chatty dev servers; the oldest
/// entries drop first. The agent/UI only ever needs the recent tail.
const CONSOLE_CAP: usize = 500;

/// Fixed label for the single embedded preview webview. One preview panel is
/// visible at a time, so a stable label lets us reuse the webview across
/// navigations and tab switches instead of tearing it down each time.
pub const PREVIEW_LABEL: &str = "zen-browser-preview";

/// Logical-pixel rect reported by the frontend placeholder div.
#[derive(Debug, Clone, Copy, serde::Deserialize)]
pub struct PreviewBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl PreviewBounds {
    fn position(&self) -> LogicalPosition<f64> {
        LogicalPosition::new(self.x.max(0.0), self.y.max(0.0))
    }
    fn size(&self) -> LogicalSize<f64> {
        // A zero/degenerate size makes WebView2 unhappy; clamp to 1px.
        LogicalSize::new(self.width.max(1.0), self.height.max(1.0))
    }
    fn rect(&self) -> Rect {
        Rect {
            position: self.position().into(),
            size: self.size().into(),
        }
    }
}

#[derive(Default)]
struct PreviewState {
    /// Current committed URL (empty until first navigation).
    url: String,
    /// Whether a child webview is currently attached to the main window.
    attached: bool,
    /// Recent console/error events captured from the page (ring buffer).
    console: VecDeque<ConsoleEntry>,
}

/// Owns the embedded preview lifecycle. Held in `AppState`.
#[derive(Default)]
pub struct BrowserManager {
    state: Arc<Mutex<PreviewState>>,
}

/// Single ring-buffer insert used by both the public API and the WebView2
/// callback, so the CONSOLE_CAP eviction rule lives in exactly one place.
fn push_console_entry(state: &Mutex<PreviewState>, entry: ConsoleEntry) {
    let Ok(mut st) = state.lock() else {
        return;
    };
    if st.console.len() >= CONSOLE_CAP {
        st.console.pop_front();
    }
    st.console.push_back(entry);
}

impl BrowserManager {
    pub fn new() -> Self {
        Self::default()
    }

    fn data_dir<R: Runtime>(app: &tauri::AppHandle<R>) -> PathBuf {
        let base = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::temp_dir());
        base.join("browser_preview_data")
    }

    /// Record a console/error entry into the ring buffer (called by the IPC
    /// bridge). Best-effort: a poisoned lock is logged and skipped rather than
    /// panicking on the WebView2 callback thread.
    pub fn push_console(&self, entry: ConsoleEntry) {
        push_console_entry(&self.state, entry);
    }

    /// Snapshot of the recent console tail (newest last), capped at `limit`.
    pub fn console_tail(&self, limit: usize) -> Vec<ConsoleEntry> {
        let Ok(st) = self.state.lock() else {
            return Vec::new();
        };
        let n = st.console.len().min(limit);
        st.console.iter().skip(st.console.len() - n).cloned().collect()
    }

    /// Attach (or reuse) the preview webview over `bounds` and navigate to
    /// `url`. `allow_loopback` gates dev-server hosts (address-bar case).
    pub fn attach<R: Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
        bounds: PreviewBounds,
        url: &str,
        allow_loopback: bool,
    ) -> Result<String, String> {
        let target = if url.trim().is_empty() || url == "about:blank" {
            None
        } else {
            Some(url_policy::sanitize_preview_url(url, allow_loopback)?)
        };

        let existing = app.get_webview(PREVIEW_LABEL);
        if let Some(webview) = existing {
            webview.set_bounds(bounds.rect()).map_err(|e| e.to_string())?;
            webview.show().map_err(|e| e.to_string())?;
            if let Some(u) = &target {
                webview.navigate(u.clone()).map_err(|e| e.to_string())?;
            }
            let mut st = self.state.lock().unwrap();
            st.attached = true;
            if let Some(u) = &target {
                st.url = u.to_string();
            }
            return Ok(st.url.clone());
        }

        let main = app
            .get_window("main")
            .ok_or_else(|| "main window not found".to_string())?;

        let webview_url = match &target {
            Some(u) => WebviewUrl::External(u.clone()),
            None => WebviewUrl::External(
                "about:blank".parse().map_err(|_| "bad about:blank".to_string())?,
            ),
        };

        let builder = WebviewBuilder::new(PREVIEW_LABEL, webview_url)
            .data_directory(Self::data_dir(app))
            .initialization_script(bridge::init_script());

        let webview = main
            .add_child(builder, bounds.position(), bounds.size())
            .map_err(|e| e.to_string())?;

        self.install_console_bridge(app, &webview);

        let mut st = self.state.lock().unwrap();
        st.attached = true;
        st.url = target.map(|u| u.to_string()).unwrap_or_default();
        Ok(st.url.clone())
    }

    /// Attach a native WebView2 `WebMessageReceived` handler that funnels the
    /// init-script's console/error posts into the ring buffer and emits them to
    /// the frontend. Windows-only; a no-op elsewhere.
    #[cfg(windows)]
    fn install_console_bridge<R: Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
        webview: &tauri::webview::Webview<R>,
    ) {
        use tauri::Emitter;
        use webview2_com::WebMessageReceivedEventHandler;
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2WebMessageReceivedEventArgs;
        use windows::core::PWSTR;

        let state = self.state.clone();
        let app = app.clone();
        let _ = webview.with_webview(move |platform| {
            let controller = platform.controller();
            unsafe {
                let core = match controller.CoreWebView2() {
                    Ok(c) => c,
                    Err(_) => return,
                };
                let handler = WebMessageReceivedEventHandler::create(Box::new(
                    move |_wv, args: Option<ICoreWebView2WebMessageReceivedEventArgs>| {
                        let args = match args {
                            Some(a) => a,
                            None => return Ok(()),
                        };
                        let mut raw = PWSTR::null();
                        if args.TryGetWebMessageAsString(&mut raw).is_err() {
                            return Ok(());
                        }
                        let text = webview2_com::take_pwstr(raw);
                        if let Some(entry) = bridge::parse_message(&text) {
                            push_console_entry(&state, entry.clone());
                            let _ = app.emit(bridge::CONSOLE_EVENT, entry);
                        }
                        Ok(())
                    },
                ));
                let mut token = 0i64;
                let _ = core.add_WebMessageReceived(&handler, &mut token);
            }
        });
    }

    #[cfg(not(windows))]
    fn install_console_bridge<R: Runtime>(
        &self,
        _app: &tauri::AppHandle<R>,
        _webview: &tauri::webview::Webview<R>,
    ) {
    }

    pub fn set_bounds<R: Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
        bounds: PreviewBounds,
    ) -> Result<(), String> {
        if let Some(webview) = app.get_webview(PREVIEW_LABEL) {
            webview.set_bounds(bounds.rect()).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn navigate<R: Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
        url: &str,
        allow_loopback: bool,
    ) -> Result<String, String> {
        let parsed = url_policy::sanitize_preview_url(url, allow_loopback)?;
        let webview = app
            .get_webview(PREVIEW_LABEL)
            .ok_or_else(|| "preview not attached".to_string())?;
        webview.navigate(parsed.clone()).map_err(|e| e.to_string())?;
        let mut st = self.state.lock().unwrap();
        st.url = parsed.to_string();
        Ok(st.url.clone())
    }

    pub fn reload<R: Runtime>(&self, app: &tauri::AppHandle<R>) -> Result<(), String> {
        if let Some(webview) = app.get_webview(PREVIEW_LABEL) {
            webview.reload().map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    /// Hide the webview without destroying it (e.g. a modal opens over the
    /// panel, or the user switches right-panel tabs). Native WebView2 paints
    /// over the DOM and ignores z-index, so overlays require this.
    pub fn hide<R: Runtime>(&self, app: &tauri::AppHandle<R>) -> Result<(), String> {
        if let Some(webview) = app.get_webview(PREVIEW_LABEL) {
            webview.hide().map_err(|e| e.to_string())?;
        }
        self.state.lock().unwrap().attached = false;
        Ok(())
    }

    /// Fully tear down the preview webview (panel unmounts).
    pub fn detach<R: Runtime>(&self, app: &tauri::AppHandle<R>) -> Result<(), String> {
        if let Some(webview) = app.get_webview(PREVIEW_LABEL) {
            webview.close().map_err(|e| e.to_string())?;
        }
        let mut st = self.state.lock().unwrap();
        st.attached = false;
        st.url.clear();
        st.console.clear();
        Ok(())
    }

    pub fn current_url(&self) -> String {
        self.state.lock().unwrap().url.clone()
    }

    /// Capture the current preview as a PNG, persist it to appdata, and return
    /// an `asset://localhost/<abs_path>` URI (never inline base64).
    pub fn screenshot<R: Runtime>(&self, app: &tauri::AppHandle<R>) -> Result<String, String> {
        let webview = app
            .get_webview(PREVIEW_LABEL)
            .ok_or_else(|| "preview not attached".to_string())?;
        let bytes = screenshot::capture_png(&webview)?;

        let dir = Self::data_dir(app).join("screenshots");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join(format!("preview_{}.png", uuid::Uuid::new_v4()));
        std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;

        let normalized = path.to_string_lossy().replace('\\', "/");
        Ok(format!("asset://localhost/{normalized}"))
    }

    /// Read text/HTML from the page via `Runtime.evaluate`. When `selector` is
    /// given, returns that element's `innerText`; otherwise the document title
    /// plus `body.innerText`. Result is capped so a huge DOM can't blow the
    /// tool-output budget.
    pub fn read<R: Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
        selector: Option<&str>,
    ) -> Result<String, String> {
        let webview = app
            .get_webview(PREVIEW_LABEL)
            .ok_or_else(|| "preview not attached".to_string())?;
        // Selector is embedded as a JSON string literal so it can't break out
        // of the expression (no string interpolation into raw JS).
        let sel = serde_json::to_string(&selector).map_err(|e| e.to_string())?;
        let expr = format!(
            "(() => {{ const s = {sel}; const el = s ? document.querySelector(s) : document.body; \
             if (!el) return null; const t = (el.innerText || '').slice(0, 20000); \
             return s ? t : (document.title + '\\n' + t); }})()"
        );
        let raw = cdp::evaluate(&webview, &expr)?;
        Ok(extract_eval_value(&raw))
    }

    /// Trusted click. A CSS `selector` is resolved to its viewport-center CSS
    /// pixel via `Runtime.evaluate`, then a real `Input.dispatchMouseEvent`
    /// press/release is dispatched there (not a synthetic `.click()`).
    pub fn click<R: Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
        selector: &str,
    ) -> Result<(), String> {
        let webview = app
            .get_webview(PREVIEW_LABEL)
            .ok_or_else(|| "preview not attached".to_string())?;
        let sel = serde_json::to_string(selector).map_err(|e| e.to_string())?;
        let expr = format!(
            "(() => {{ const el = document.querySelector({sel}); if (!el) return null; \
             el.scrollIntoView({{block:'center',inline:'center'}}); const r = el.getBoundingClientRect(); \
             return {{ x: r.left + r.width/2, y: r.top + r.height/2 }}; }})()"
        );
        let raw = cdp::evaluate(&webview, &expr)?;
        let (x, y) = parse_point(&raw)
            .ok_or_else(|| format!("selector not found or not visible: {selector}"))?;
        cdp::click(&webview, x, y)
    }

    /// Focus `selector` (if given) then type `text` as trusted key input.
    pub fn type_text<R: Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
        selector: Option<&str>,
        text: &str,
    ) -> Result<(), String> {
        if let Some(sel) = selector {
            self.click(app, sel)?;
        }
        let webview = app
            .get_webview(PREVIEW_LABEL)
            .ok_or_else(|| "preview not attached".to_string())?;
        cdp::type_text(&webview, text)
    }
}

/// Pull the `.result.value` out of a `Runtime.evaluate` JSON response, coercing
/// non-strings to their JSON form. Returns an empty string on any shape miss.
fn extract_eval_value(raw: &str) -> String {
    serde_json::from_str::<serde_json::Value>(raw)
        .ok()
        .and_then(|v| v.get("result").and_then(|r| r.get("value")).cloned())
        .map(|v| match v {
            serde_json::Value::String(s) => s,
            serde_json::Value::Null => String::new(),
            other => other.to_string(),
        })
        .unwrap_or_default()
}

/// Parse `{x,y}` returned as `result.value` from a `Runtime.evaluate` call.
fn parse_point(raw: &str) -> Option<(f64, f64)> {
    let v: serde_json::Value = serde_json::from_str(raw).ok()?;
    let val = v.get("result")?.get("value")?;
    let x = val.get("x")?.as_f64()?;
    let y = val.get("y")?.as_f64()?;
    Some((x, y))
}

#[cfg(test)]
mod cdp_value_tests {
    use super::{extract_eval_value, parse_point};

    #[test]
    fn extracts_string_value() {
        let raw = r#"{"result":{"type":"string","value":"hello"}}"#;
        assert_eq!(extract_eval_value(raw), "hello");
    }

    #[test]
    fn null_and_missing_yield_empty() {
        assert_eq!(extract_eval_value(r#"{"result":{"value":null}}"#), "");
        assert_eq!(extract_eval_value(r#"{"nope":1}"#), "");
    }

    #[test]
    fn parses_point() {
        let raw = r#"{"result":{"value":{"x":12.5,"y":34}}}"#;
        assert_eq!(parse_point(raw), Some((12.5, 34.0)));
    }

    #[test]
    fn missing_point_is_none() {
        assert_eq!(parse_point(r#"{"result":{"value":null}}"#), None);
    }
}
