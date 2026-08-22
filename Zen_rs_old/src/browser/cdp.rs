//! Chrome DevTools Protocol bridge for the preview webview.
//!
//! Uses WebView2's in-process `CallDevToolsProtocolMethod` (COM) — **not** a
//! `--remote-debugging-port`, which would open a local socket any process could
//! attach to. This drives trusted input (`Input.dispatchMouseEvent/KeyEvent`),
//! reads the DOM (`Runtime.evaluate`), and could enable `Network.*` logging.
//!
//! Each call marshals a method name + JSON params, pumps the message loop until
//! the completion handler fires, and returns the raw JSON result string.
//!
//! Windows/WebView2 only.

/// Invoke a CDP method synchronously and return its JSON result string.
#[cfg(windows)]
pub fn call_cdp<R: tauri::Runtime>(
    webview: &tauri::webview::Webview<R>,
    method: &str,
    params_json: &str,
) -> Result<String, String> {
    use std::sync::mpsc::channel;
    use webview2_com::{pwstr_from_str, take_pwstr, CallDevToolsProtocolMethodCompletedHandler};
    use windows::core::PCWSTR;

    let method = method.to_string();
    let params_json = if params_json.trim().is_empty() {
        "{}".to_string()
    } else {
        params_json.to_string()
    };

    let (tx, rx) = channel::<Result<String, String>>();
    webview
        .with_webview(move |platform| {
            let result = (|| unsafe {
                let core = platform
                    .controller()
                    .CoreWebView2()
                    .map_err(|e| e.to_string())?;

                let mut method_w = pwstr_from_str(&method);
                let mut params_w = pwstr_from_str(&params_json);

                let (done_tx, done_rx) = channel::<Result<String, String>>();
                let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                    move |hr: windows::core::Result<()>, json: String| {
                        let out = hr.map(|_| json).map_err(|e| e.to_string());
                        let _ = done_tx.send(out);
                        Ok(())
                    },
                ));

                core.CallDevToolsProtocolMethod(
                    PCWSTR(method_w.as_ptr()),
                    PCWSTR(params_w.as_ptr()),
                    &handler,
                )
                .map_err(|e| e.to_string())?;

                // Free the PWSTR buffers after the call has copied them.
                let _ = take_pwstr(std::mem::replace(
                    &mut method_w,
                    windows::core::PWSTR::null(),
                ));
                let _ = take_pwstr(std::mem::replace(
                    &mut params_w,
                    windows::core::PWSTR::null(),
                ));

                webview2_com::wait_with_pump(done_rx).map_err(|e| e.to_string())?
            })();
            let _ = tx.send(result);
        })
        .map_err(|e| e.to_string())?;

    rx.recv().map_err(|_| "cdp channel closed".to_string())?
}

#[cfg(not(windows))]
pub fn call_cdp<R: tauri::Runtime>(
    _webview: &tauri::webview::Webview<R>,
    _method: &str,
    _params_json: &str,
) -> Result<String, String> {
    Err("CDP is only supported on Windows/WebView2".to_string())
}

/// Evaluate a JS expression in the page and return the JSON result of
/// `Runtime.evaluate`. `expression` runs in the page's main world.
pub fn evaluate<R: tauri::Runtime>(
    webview: &tauri::webview::Webview<R>,
    expression: &str,
) -> Result<String, String> {
    let params = serde_json::json!({
        "expression": expression,
        "returnByValue": true,
        "awaitPromise": true,
    });
    call_cdp(webview, "Runtime.evaluate", &params.to_string())
}

/// Dispatch a trusted click (mouse press + release) at CSS pixel `(x, y)`.
pub fn click<R: tauri::Runtime>(
    webview: &tauri::webview::Webview<R>,
    x: f64,
    y: f64,
) -> Result<(), String> {
    for kind in ["mousePressed", "mouseReleased"] {
        let params = serde_json::json!({
            "type": kind,
            "x": x,
            "y": y,
            "button": "left",
            "buttons": 1,
            "clickCount": 1,
        });
        call_cdp(webview, "Input.dispatchMouseEvent", &params.to_string())?;
    }
    Ok(())
}

/// Type `text` as trusted key events (via `Input.insertText`, which reliably
/// targets the focused editable element).
pub fn type_text<R: tauri::Runtime>(
    webview: &tauri::webview::Webview<R>,
    text: &str,
) -> Result<(), String> {
    let params = serde_json::json!({ "text": text });
    call_cdp(webview, "Input.insertText", &params.to_string())?;
    Ok(())
}
