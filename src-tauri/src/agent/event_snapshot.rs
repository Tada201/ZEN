//! Event-contract snapshot tap (BIG_MIGRATION.md Phase 0, risk R5).
//!
//! Compile-time diagnostic feature, enabled only for dev/test capture runs:
//! ```sh
//! ZEN_EVENT_SNAPSHOT_PATH=test/fixtures/event-snapshot-baseline.jsonl \
//!   cargo test --test agentic_test --features event-snapshot   # headless capture
//! # or interactively:
//! ZEN_EVENT_SNAPSHOT_PATH=<file> npx tauri dev --features event-snapshot
//! ```
//! Every frontend-bound agent event that passes through
//! `AgentEvent::emit_via` or `EventBus::bridge_to_tauri` is appended to the
//! JSONL file as `{"event": <name>, "shape": <payload-shape>}` where the shape
//! recursively replaces values with type names (objects keep sorted keys,
//! arrays collapse to their first element's shape). Diffing the capture
//! across migration phases proves event-name/payload-shape parity without
//! pinning volatile content. When the feature is off, `record` compiles to an
//! inlined no-op — zero runtime cost and zero behavior change.

#[cfg(feature = "event-snapshot")]
pub fn record(event_name: &str, payload: &serde_json::Value) {
    use std::io::Write;
    use std::sync::{Mutex, OnceLock};

    static FILE: OnceLock<Option<Mutex<std::fs::File>>> = OnceLock::new();
    let file = FILE.get_or_init(|| {
        std::env::var("ZEN_EVENT_SNAPSHOT_PATH")
            .ok()
            .and_then(|path| {
                std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&path)
                    .map(|f| Mutex::new(f))
                    .map_err(|e| {
                        tracing::warn!("event-snapshot disabled: cannot open {path}: {e}");
                        e
                    })
                    .ok()
            })
    });

    if let Some(mutex) = file {
        let mut guard = match mutex.lock() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };
        let line = serde_json::json!({ "event": event_name, "shape": shape_of(payload) });
        if let Err(e) = writeln!(guard, "{line}") {
            tracing::warn!("event-snapshot append failed: {e}");
        }
    }
}

#[cfg(not(feature = "event-snapshot"))]
#[inline]
pub fn record(_event_name: &str, _payload: &serde_json::Value) {}

/// Recursive structural fingerprint of a JSON payload: values become type
/// names, objects keep their (sorted) keys, arrays keep one element's shape.
#[cfg(feature = "event-snapshot")]
fn shape_of(v: &serde_json::Value) -> serde_json::Value {
    use serde_json::{json, Value};
    match v {
        Value::Null => json!("null"),
        Value::Bool(_) => json!("bool"),
        Value::Number(_) => json!("number"),
        Value::String(_) => json!("string"),
        Value::Array(a) => match a.first() {
            Some(first) => json!([shape_of(first)]),
            None => json!([]),
        },
        Value::Object(o) => {
            let mapped: serde_json::Map<String, Value> = o
                .iter()
                .map(|(k, val)| (k.clone(), shape_of(val)))
                .collect();
            Value::Object(mapped)
        }
    }
}

#[cfg(all(test, feature = "event-snapshot"))]
mod tests {
    use serde_json::json;

    use super::shape_of;

    #[test]
    fn shape_collapses_values_but_keeps_keys() {
        let payload = json!({
            "chatId": "abc",
            "count": 3,
            "done": true,
            "parts": [{ "text": "hi", "n": 1 }],
            "maybe": null,
        });
        assert_eq!(
            shape_of(&payload),
            json!({
                "chatId": "string",
                "count": "number",
                "done": "bool",
                "parts": [{ "text": "string", "n": "number" }],
                "maybe": "null",
            })
        );
    }

    #[test]
    fn shape_of_empty_array_is_empty() {
        assert_eq!(shape_of(&json!([])), json!([]));
    }
}
