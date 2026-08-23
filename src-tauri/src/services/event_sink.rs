//! App-side impl of the `zen_core::ports::EventSink` port
//! (BIG_MIGRATION.md Phase 6). Bridges domain event emission to the Tauri
//! emitter. Byte-identical to a direct `app.emit(name, payload)`: same
//! event name, same JSON payload. Event names and payload shapes are the
//! R5 frontend contract — do not drift.

use serde_json::Value;
use tauri::{AppHandle, Emitter};
use zen_core::ports::EventSink;

pub struct TauriEventSink {
    app: AppHandle,
}

impl TauriEventSink {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl EventSink for TauriEventSink {
    fn emit(&self, event: &str, payload: &Value) {
        // Mirrors the historical `let _ = app.emit(event, payload);` sites:
        // emission is best-effort so a closed webview can't crash the loop.
        if let Err(e) = self.app.emit(event, payload.clone()) {
            tracing::warn!(event, error = %e, "EventSink emit failed");
        }
    }

    fn emit_result(&self, event: &str, payload: &Value) -> Result<(), String> {
        self.app
            .emit(event, payload.clone())
            .map_err(|e| e.to_string())
    }
}
