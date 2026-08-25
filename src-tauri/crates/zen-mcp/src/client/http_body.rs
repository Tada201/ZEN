//! Streamable-HTTP response decoding for the MCP HTTP transport.
//!
//! Per the MCP spec a POST may return the JSON-RPC message either as
//! `application/json` OR wrapped in a `text/event-stream` (SSE) body.
//! Response bodies are bounded before conversion to a string so a hostile
//! server cannot consume unbounded memory.

use futures_util::StreamExt;
use serde_json::Value;

pub(super) const MAX_RPC_BODY_BYTES: usize = 2 * 1024 * 1024;

/// Read a JSON-RPC response body, unwrapping SSE framing when the server
/// answered with `text/event-stream`.
pub(super) async fn read_rpc_response(resp: reqwest::Response) -> Result<Value, String> {
    if resp
        .content_length()
        .is_some_and(|length| length > MAX_RPC_BODY_BYTES as u64)
    {
        return Err(format!(
            "response body exceeds {MAX_RPC_BODY_BYTES} byte limit"
        ));
    }

    let is_sse = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|c| c.contains("text/event-stream"))
        .unwrap_or(false);
    let mut stream = resp.bytes_stream();
    let mut bytes = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("bad response body: {e}"))?;
        if bytes.len().saturating_add(chunk.len()) > MAX_RPC_BODY_BYTES {
            return Err(format!(
                "response body exceeds {MAX_RPC_BODY_BYTES} byte limit"
            ));
        }
        bytes.extend_from_slice(&chunk);
    }

    let body = String::from_utf8(bytes).map_err(|_| "response body is not valid UTF-8".to_string())?;
    if is_sse {
        extract_sse_json(&body)
    } else {
        serde_json::from_str(&body).map_err(|e| format!("bad JSON: {e}"))
    }
}

/// Extract the last JSON-RPC object from an SSE stream. Events are
/// delimited by blank lines; a single event may carry multiple `data:`
/// lines (joined with `\n`). Non-`data:` fields are ignored.
fn extract_sse_json(body: &str) -> Result<Value, String> {
    let mut buf = String::new();
    let mut found: Option<Value> = None;
    let mut event_count = 0usize;
    for line in body.lines() {
        if line.is_empty() {
            event_count += 1;
            if event_count > 256 {
                return Err("event-stream exceeds 256 event limit".to_string());
            }
            flush(&mut buf, &mut found);
        } else if let Some(rest) = line.strip_prefix("data:") {
            if !buf.is_empty() {
                buf.push('\n');
            }
            buf.push_str(rest.strip_prefix(' ').unwrap_or(rest));
        }
    }
    flush(&mut buf, &mut found);
    found.ok_or_else(|| "no JSON-RPC message in event-stream response".to_string())
}

fn flush(buf: &mut String, found: &mut Option<Value>) {
    if !buf.is_empty() {
        if let Ok(v) = serde_json::from_str::<Value>(buf.trim()) {
            if v.is_object() {
                *found = Some(v);
            }
        }
        buf.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::{extract_sse_json, MAX_RPC_BODY_BYTES};

    #[test]
    fn unwraps_sse_message() {
        let body = "event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"ok\":true}}\n\n";
        let v = extract_sse_json(body).expect("parse");
        assert_eq!(v["result"]["ok"], serde_json::json!(true));
    }

    #[test]
    fn errors_when_no_data() {
        assert!(extract_sse_json("event: ping\n\n").is_err());
    }

    #[test]
    fn exposes_a_bounded_body_limit() {
        assert_eq!(MAX_RPC_BODY_BYTES, 2 * 1024 * 1024);
    }
}
