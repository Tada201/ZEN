//! Console/error capture bridge for the embedded preview webview.
//!
//! The init-script runs in every frame of the preview (all origins, outside the
//! page's CSP — the thing a sandboxed `<iframe>` can't do). It overrides
//! `console.*`, `window.onerror`, and `unhandledrejection`, forwarding each as
//! a JSON message to the native host via `window.chrome.webview.postMessage`.
//! We deliberately use WebView2's native channel, not Tauri's `window.ipc`,
//! because the preview webview is granted no Tauri command capabilities.
//!
//! Nothing here logs credentials or full payloads: only the console level and a
//! size-capped text string cross the boundary (Security.md).

use serde::{Deserialize, Serialize};

/// One captured console/error event. Mirrors the JSON the init-script posts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsoleEntry {
    /// "log" | "info" | "warn" | "error" | "debug" | "exception" | "rejection".
    pub level: String,
    /// Message text, already truncated browser-side to `MAX_MSG_LEN`.
    pub text: String,
    /// Millisecond epoch timestamp from the page.
    #[serde(default)]
    pub ts: f64,
}

/// Cap forwarded from the browser side too; enforced again here as defense in
/// depth against a compromised/renamed page hook.
const MAX_MSG_LEN: usize = 4096;

/// Event name emitted to the frontend when a console entry arrives.
pub const CONSOLE_EVENT: &str = "browser:preview:console";

/// Parse a raw `WebMessageAsString` payload into a `ConsoleEntry`, clamping the
/// text length. Returns `None` for anything that isn't our JSON shape.
pub fn parse_message(raw: &str) -> Option<ConsoleEntry> {
    let mut entry: ConsoleEntry = serde_json::from_str(raw).ok()?;
    if entry.level.is_empty() {
        return None;
    }
    if entry.text.len() > MAX_MSG_LEN {
        entry.text.truncate(MAX_MSG_LEN);
    }
    Some(entry)
}

/// JavaScript injected before any page script runs, in every frame.
pub fn init_script() -> String {
    // Kept as a single string; the `__zenPost` guard avoids double-install if
    // the script is somehow evaluated twice in one frame.
    format!(
        r#"(function(){{
  if (window.__zenPreviewHooked) return;
  window.__zenPreviewHooked = true;
  var MAX = {MAX_MSG_LEN};
  function post(level, args) {{
    try {{
      if (!(window.chrome && window.chrome.webview)) return;
      var text = Array.prototype.map.call(args, function(a) {{
        try {{
          if (typeof a === 'string') return a;
          if (a instanceof Error) return (a.stack || a.message || String(a));
          return JSON.stringify(a);
        }} catch (e) {{ return String(a); }}
      }}).join(' ');
      if (text.length > MAX) text = text.slice(0, MAX);
      window.chrome.webview.postMessage(JSON.stringify({{ level: level, text: text, ts: Date.now() }}));
    }} catch (e) {{}}
  }}
  ['log','info','warn','error','debug'].forEach(function(level) {{
    var orig = console[level];
    console[level] = function() {{ post(level, arguments); if (orig) orig.apply(console, arguments); }};
  }});
  window.addEventListener('error', function(ev) {{
    post('exception', [ev && ev.message ? ev.message : 'error', ev && ev.filename, ev && ev.lineno]);
  }});
  window.addEventListener('unhandledrejection', function(ev) {{
    var r = ev && ev.reason; post('rejection', [r && r.stack ? r.stack : String(r)]);
  }});
}})();"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_message() {
        let e = parse_message(r#"{"level":"error","text":"boom","ts":123}"#).unwrap();
        assert_eq!(e.level, "error");
        assert_eq!(e.text, "boom");
    }

    #[test]
    fn rejects_non_json_and_empty_level() {
        assert!(parse_message("not json").is_none());
        assert!(parse_message(r#"{"level":"","text":"x"}"#).is_none());
    }

    #[test]
    fn truncates_oversized_text() {
        let big = "a".repeat(MAX_MSG_LEN + 100);
        let raw = format!(r#"{{"level":"log","text":"{big}"}}"#);
        let e = parse_message(&raw).unwrap();
        assert_eq!(e.text.len(), MAX_MSG_LEN);
    }

    #[test]
    fn init_script_is_self_guarded() {
        assert!(init_script().contains("__zenPreviewHooked"));
    }
}
