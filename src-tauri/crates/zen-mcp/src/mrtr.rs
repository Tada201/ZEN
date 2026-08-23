//! Multi Round-Trip Requests (MRTR) protocol types and parsing (Phase 6).
//!
//! A modern MCP server can answer a `tools/call`, `resources/read`, or
//! `prompts/get` with an `InputRequiredResult` (`resultType: "input_required"`)
//! instead of a final result. It carries an `inputRequests` map of
//! server-initiated requests the client must fulfill, plus an opaque
//! `requestState` blob. The client gathers the requested input (here: only
//! `elicitation/create`, the one server-request kind ZEN declares support for),
//! then retries the *original* request with a **new** JSON-RPC id, the
//! `inputResponses` map, and the **verbatim** `requestState` echoed back.
//!
//! This module is pure: it parses/validates the wire shapes and builds the
//! response values. The transport loop and the human-in-the-loop prompt live in
//! `client/mrtr.rs`. Two invariants are enforced here, not by policy elsewhere:
//!
//! - `requestState` is treated as fully opaque — never parsed, inspected, or
//!   modified — and is echoed back byte-for-byte (spec: clients MUST NOT make
//!   assumptions about its contents).
//! - Form-mode elicitation that asks for a credential (password / token / key /
//!   secret) is refused before any UI is shown, so a server can never collect a
//!   secret through the in-band form channel (spec: that MUST go through URL
//!   mode).

use serde_json::{Map, Value};

use crate::resources::sanitize_text;
use crate::types::methods;

/// Message length cap for an elicitation prompt shown to the user.
const MAX_MESSAGE_BYTES: usize = 4 * 1024;
/// Serialized-size cap for a form-mode `requestedSchema`. A conformant schema of
/// flat primitives is tiny; anything past this is treated as a hostile payload
/// and the request is blocked rather than forwarded to the UI/IPC.
const MAX_SCHEMA_BYTES: usize = 32 * 1024;
/// Bound on the number of input requests we will surface for one result. A
/// conformant server sends a handful; this stops a hostile server flooding the
/// UI with prompts.
pub const MAX_INPUT_REQUESTS: usize = 16;

/// The two elicitation modes ZEN supports. `Form` collects structured data
/// in-band; `Url` sends the user out-of-band to a server-provided URL.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ElicitMode {
    Form,
    Url,
}

/// One server-initiated `elicitation/create` request, keyed by the
/// server-assigned identifier used to correlate the response.
#[derive(Debug, Clone)]
pub struct ElicitationRequest {
    /// Server-assigned key in the `inputRequests` map; the matching
    /// `inputResponses` entry MUST reuse it.
    pub key: String,
    pub mode: ElicitMode,
    /// Human-readable, control-stripped reason for the request.
    pub message: String,
    /// URL-mode only: the full URL the server wants the user to open. Never
    /// prefetched; shown verbatim for review.
    pub url: Option<String>,
    /// Form-mode only: the restricted JSON Schema for the requested fields.
    pub requested_schema: Option<Value>,
    /// When set, the request is refused without prompting (e.g. a form-mode
    /// credential request); the reason is surfaced to the timeline.
    pub blocked: Option<String>,
    /// True when `blocked` is a protocol violation that should fail the whole
    /// call (an input method ZEN never declared), rather than a per-request
    /// auto-decline (a credential form or an unusable URL).
    pub fatal: bool,
}

/// A parsed `InputRequiredResult`. `request_state` is opaque and stored as the
/// raw JSON value so it can be echoed back unchanged.
#[derive(Debug, Clone)]
pub struct InputRequired {
    pub requests: Vec<ElicitationRequest>,
    pub request_state: Option<Value>,
}

/// True when a result object is an interim `InputRequiredResult`. A missing
/// `resultType` (earlier-protocol server) MUST be treated as `"complete"`.
pub fn is_input_required(result: &Value) -> bool {
    result.get("resultType").and_then(Value::as_str) == Some("input_required")
}

/// Parse the `inputRequests` / `requestState` of an `InputRequiredResult`.
/// Only `elicitation/create` requests are understood; any other server-request
/// method (e.g. deprecated `sampling/createMessage`, `roots/list`) is marked
/// `blocked` because ZEN never declared support for it.
pub fn parse_input_required(result: &Value) -> InputRequired {
    let request_state = result.get("requestState").cloned();
    let mut requests = Vec::new();
    if let Some(map) = result.get("inputRequests").and_then(Value::as_object) {
        for (key, req) in map.iter().take(MAX_INPUT_REQUESTS) {
            requests.push(parse_one_request(key, req));
        }
    }
    InputRequired {
        requests,
        request_state,
    }
}

fn parse_one_request(key: &str, req: &Value) -> ElicitationRequest {
    let method = req.get("method").and_then(Value::as_str).unwrap_or("");
    let params = req.get("params").cloned().unwrap_or(Value::Null);
    let (message_raw, _) = sanitize_text(
        params.get("message").and_then(Value::as_str).unwrap_or(""),
        MAX_MESSAGE_BYTES,
    );

    if method != methods::ELICITATION_CREATE {
        return ElicitationRequest {
            key: key.to_string(),
            mode: ElicitMode::Form,
            message: message_raw,
            url: None,
            requested_schema: None,
            blocked: Some(format!(
                "server requested unsupported input method '{}'",
                method
            )),
            fatal: true,
        };
    }

    // Absent mode ⇒ form (spec backward-compat default).
    let mode = match params.get("mode").and_then(Value::as_str) {
        Some("url") => ElicitMode::Url,
        _ => ElicitMode::Form,
    };

    match mode {
        ElicitMode::Url => {
            let url = params.get("url").and_then(Value::as_str).map(str::to_string);
            let blocked = match url.as_deref() {
                Some(u) if is_displayable_url(u) => None,
                _ => Some("url-mode elicitation without a valid http(s) URL".to_string()),
            };
            ElicitationRequest {
                key: key.to_string(),
                mode,
                message: message_raw,
                url,
                requested_schema: None,
                blocked,
                fatal: false,
            }
        }
        ElicitMode::Form => {
            let schema = params.get("requestedSchema").cloned();
            let oversized = schema
                .as_ref()
                .is_some_and(|s| s.to_string().len() > MAX_SCHEMA_BYTES);
            let blocked = if oversized {
                Some("form-mode requestedSchema exceeds the size limit".to_string())
            } else {
                schema
                    .as_ref()
                    .filter(|s| schema_requests_secret(s))
                    .map(|_| {
                        "server asked for a credential via form mode; use URL mode for secrets"
                            .to_string()
                    })
            };
            ElicitationRequest {
                key: key.to_string(),
                mode,
                message: message_raw,
                url: None,
                requested_schema: if oversized { None } else { schema },
                blocked,
                fatal: false,
            }
        }
    }
}

/// A URL is displayable only if it parses as an absolute `http`/`https` URL.
/// We never fetch it; this only gates what we are willing to show for consent.
fn is_displayable_url(raw: &str) -> bool {
    url::Url::parse(raw)
        .map(|u| matches!(u.scheme(), "http" | "https"))
        .unwrap_or(false)
}

/// Heuristic secret detector for a form-mode `requestedSchema`. Scans each
/// property's key, `title`, and `format` for credential-like tokens. Erring
/// toward false positives is correct here: refusing a benign field is a minor
/// inconvenience, while rendering a password field violates the spec.
pub fn schema_requests_secret(schema: &Value) -> bool {
    const NEEDLES: &[&str] = &[
        "password", "passwd", "pwd", "passcode", "secret", "token", "apikey", "api_key", "api-key",
        "access_key", "accesskey", "credential", "private_key", "privatekey", "client_secret",
        "clientsecret", "otp", "passphrase", "pin", "auth",
    ];
    let looks_secret = |s: &str| {
        let lower = s.to_ascii_lowercase();
        NEEDLES.iter().any(|n| lower.contains(n))
    };
    let Some(props) = schema.get("properties").and_then(Value::as_object) else {
        return false;
    };
    props.iter().any(|(name, def)| {
        looks_secret(name)
            || def
                .get("title")
                .and_then(Value::as_str)
                .is_some_and(looks_secret)
            || def
                .get("format")
                .and_then(Value::as_str)
                .is_some_and(|f| f.eq_ignore_ascii_case("password"))
    })
}

/// Build the `ElicitResult` value the client returns for one request:
/// `{ "action": "accept"|"decline"|"cancel", "content"?: {...} }`. `content`
/// is only ever attached on an accepted form submission.
pub fn build_elicit_result(action: &str, content: Option<Value>) -> Value {
    let action = match action {
        "accept" | "decline" | "cancel" => action,
        _ => "cancel",
    };
    let mut obj = Map::new();
    obj.insert("action".to_string(), Value::String(action.to_string()));
    if action == "accept" {
        if let Some(content) = content {
            if content.is_object() {
                obj.insert("content".to_string(), content);
            }
        }
    }
    Value::Object(obj)
}

/// Assemble the retry params: start from the original params, attach the
/// gathered `inputResponses`, and echo the opaque `requestState` **verbatim**
/// when the interim result carried one. Per spec the client MUST NOT include a
/// `requestState` the server did not send.
pub fn build_retry_params(
    mut original: Value,
    input_responses: Map<String, Value>,
    request_state: Option<&Value>,
) -> Value {
    if !original.is_object() {
        original = Value::Object(Map::new());
    }
    if let Value::Object(map) = &mut original {
        map.insert(
            "inputResponses".to_string(),
            Value::Object(input_responses),
        );
        match request_state {
            Some(state) => {
                map.insert("requestState".to_string(), state.clone());
            }
            None => {
                map.remove("requestState");
            }
        }
    }
    original
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_result_type_is_complete() {
        assert!(!is_input_required(&serde_json::json!({"content": []})));
        assert!(is_input_required(
            &serde_json::json!({"resultType": "input_required"})
        ));
        assert!(!is_input_required(
            &serde_json::json!({"resultType": "complete"})
        ));
    }

    #[test]
    fn parses_form_and_url_and_flags_unsupported() {
        let result = serde_json::json!({
            "resultType": "input_required",
            "requestState": "AEAD-blob",
            "inputRequests": {
                "who": {
                    "method": "elicitation/create",
                    "params": {
                        "mode": "form",
                        "message": "name?",
                        "requestedSchema": {"type": "object", "properties": {"name": {"type": "string"}}}
                    }
                },
                "link": {
                    "method": "elicitation/create",
                    "params": {"mode": "url", "url": "https://ex.com/x", "message": "open"}
                },
                "nope": {
                    "method": "sampling/createMessage",
                    "params": {"message": "no"}
                }
            }
        });
        let parsed = parse_input_required(&result);
        // requestState echoed opaque and unchanged.
        assert_eq!(parsed.request_state, Some(serde_json::json!("AEAD-blob")));
        let by_key = |k: &str| parsed.requests.iter().find(|r| r.key == k).unwrap().clone();
        let form = by_key("who");
        assert_eq!(form.mode, ElicitMode::Form);
        assert!(form.blocked.is_none());
        let url = by_key("link");
        assert_eq!(url.mode, ElicitMode::Url);
        assert_eq!(url.url.as_deref(), Some("https://ex.com/x"));
        assert!(url.blocked.is_none());
        // Unsupported server-request method is refused, not fulfilled.
        assert!(by_key("nope").blocked.is_some());
    }

    #[test]
    fn form_credential_request_is_blocked() {
        let schema = serde_json::json!({
            "type": "object",
            "properties": { "api_key": {"type": "string"} }
        });
        assert!(schema_requests_secret(&schema));
        let schema2 = serde_json::json!({
            "type": "object",
            "properties": { "pw": {"type": "string", "format": "password"} }
        });
        assert!(schema_requests_secret(&schema2));
        // Common short credential field names are caught too.
        for name in ["pwd", "passcode", "authToken"] {
            let s = serde_json::json!({"properties": {name: {"type": "string"}}});
            assert!(schema_requests_secret(&s), "{} should be secret", name);
        }
        let benign = serde_json::json!({
            "type": "object",
            "properties": { "name": {"type": "string"}, "email": {"type": "string", "format": "email"} }
        });
        assert!(!schema_requests_secret(&benign));
    }

    #[test]
    fn oversized_form_schema_is_blocked_and_dropped() {
        let mut props = Map::new();
        for i in 0..4000 {
            props.insert(
                format!("f{}", i),
                serde_json::json!({"type": "string", "title": "x".repeat(20)}),
            );
        }
        let result = serde_json::json!({
            "resultType": "input_required",
            "inputRequests": {
                "big": {
                    "method": "elicitation/create",
                    "params": {"mode": "form", "requestedSchema": {"properties": props}}
                }
            }
        });
        let parsed = parse_input_required(&result);
        let req = &parsed.requests[0];
        assert!(req.blocked.is_some(), "oversized schema blocked");
        assert!(req.requested_schema.is_none(), "oversized schema not forwarded");
    }

    #[test]
    fn url_without_valid_url_is_blocked() {
        let result = serde_json::json!({
            "resultType": "input_required",
            "inputRequests": {
                "bad": {"method": "elicitation/create", "params": {"mode": "url", "url": "javascript:alert(1)"}}
            }
        });
        let parsed = parse_input_required(&result);
        assert!(parsed.requests[0].blocked.is_some());
    }

    #[test]
    fn retry_params_echo_state_and_drop_when_absent() {
        let mut responses = Map::new();
        responses.insert("who".to_string(), build_elicit_result("accept", Some(serde_json::json!({"name": "x"}))));
        let with_state = build_retry_params(
            serde_json::json!({"name": "tool", "arguments": {}, "requestState": "stale"}),
            responses.clone(),
            Some(&serde_json::json!("fresh")),
        );
        assert_eq!(with_state.get("requestState"), Some(&serde_json::json!("fresh")));
        assert!(with_state.get("inputResponses").is_some());

        let no_state = build_retry_params(
            serde_json::json!({"name": "tool", "requestState": "stale"}),
            Map::new(),
            None,
        );
        // A retry MUST NOT carry a requestState the interim result didn't send.
        assert!(no_state.get("requestState").is_none());
    }

    #[test]
    fn elicit_result_only_carries_content_on_accept() {
        let accept = build_elicit_result("accept", Some(serde_json::json!({"a": 1})));
        assert_eq!(accept.get("content"), Some(&serde_json::json!({"a": 1})));
        let decline = build_elicit_result("decline", Some(serde_json::json!({"a": 1})));
        assert_eq!(decline.get("action"), Some(&serde_json::json!("decline")));
        assert!(decline.get("content").is_none());
        // Unknown action falls back to cancel.
        assert_eq!(build_elicit_result("weird", None).get("action"), Some(&serde_json::json!("cancel")));
    }

    #[test]
    fn hostile_server_request_flood_is_bounded() {
        // A server flooding the client with input requests can only surface up
        // to MAX_INPUT_REQUESTS prompts, never an unbounded UI storm.
        let mut requests = serde_json::Map::new();
        for i in 0..(MAX_INPUT_REQUESTS + 50) {
            requests.insert(
                format!("k{i}"),
                serde_json::json!({
                    "method": "elicitation/create",
                    "params": {"mode": "form", "message": "hi",
                        "requestedSchema": {"type": "object", "properties": {"name": {"type": "string"}}}}
                }),
            );
        }
        let result = serde_json::json!({
            "resultType": "input_required",
            "inputRequests": Value::Object(requests),
        });
        let parsed = parse_input_required(&result);
        assert_eq!(parsed.requests.len(), MAX_INPUT_REQUESTS);
    }

    #[test]
    fn oversized_message_is_truncated_and_control_stripped() {
        let big = "a".repeat(MAX_MESSAGE_BYTES * 2);
        let result = serde_json::json!({
            "resultType": "input_required",
            "inputRequests": {
                "k": {"method": "elicitation/create",
                    "params": {"mode": "url", "url": "https://ex.com", "message": format!("{big}\u{7}tail")}}
            }
        });
        let parsed = parse_input_required(&result);
        let msg = &parsed.requests[0].message;
        assert!(msg.len() <= MAX_MESSAGE_BYTES);
        assert!(!msg.contains('\u{7}'));
    }
}
