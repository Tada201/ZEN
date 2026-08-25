//! Multi Round-Trip Requests (MRTR) transport loop + the human-in-the-loop
//! elicitation prompt (Phase 6).
//!
//! `request_with_mrtr` wraps a single logical MCP request (`tools/call`,
//! `resources/read`, or `prompts/get`) so that when the server answers with an
//! interim `InputRequiredResult` the client gathers the requested input and
//! retries the *original* request with a **new** JSON-RPC id, the gathered
//! `inputResponses`, and the opaque `requestState` echoed back verbatim. The
//! wire parsing/validation lives in `crate::mrtr`; this file owns only the
//! loop, the user prompt, and the safety rules that decide when we refuse to
//! prompt at all.
//!
//! Safety posture (all fail-closed):
//! - No UI handle ⇒ we cannot ask the user, so an input-required result becomes
//!   an error rather than a silent hang or an auto-answer.
//! - A server-request method other than `elicitation/create` (e.g. the
//!   deprecated `sampling/createMessage`) is refused with an error — ZEN never
//!   declared support for it, so a conformant server won't send it.
//! - A form-mode request for a credential is auto-declined without a prompt, so
//!   a secret can never be typed into the in-band form channel.
//! - A URL-mode request is only ever *shown* for consent; the URL is never
//!   prefetched and is only opened, in the OS browser, after explicit accept.

use serde_json::{Map, Value};

use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;
use tracing::warn;

use crate::mrtr::{
    build_elicit_result, build_retry_params, is_input_required, parse_input_required, ElicitMode,
    ElicitationRequest,
};

use super::McpClient;

/// Hard cap on MRTR rounds for one logical request. A conformant server
/// resolves in one or two rounds; this stops a server that keeps returning
/// `input_required` from prompting forever.
const MAX_MRTR_ROUNDS: usize = 5;
/// How long a single elicitation prompt waits for the user before it is
/// treated as a cancel (mirrors the tool-approval timeout).
const ELICIT_TIMEOUT_SECS: u64 = 120;

/// A pending elicitation the transport loop is blocked on. Holds the one-shot
/// sender to release it plus the emit `payload`, so a UI that mounts or reloads
/// after the request fired can replay what's still awaiting a decision.
pub(crate) struct PendingElicit {
    tx: oneshot::Sender<Value>,
    payload: Value,
}

impl McpClient {
    /// Send `method`/`params` to `server_name`, transparently satisfying any
    /// MRTR `InputRequiredResult` via elicitation, and return the final
    /// unwrapped result. `header_name` overrides the modern `Mcp-Name` header
    /// (tool calls use the tool name). `app` is required to prompt the user; a
    /// `None` handle fails closed on an input-required result.
    pub(crate) async fn request_with_mrtr(
        &self,
        ui: Option<&crate::ui::UiBridge>,
        server_name: &str,
        method: &str,
        base_params: Value,
        cancel: Option<&CancellationToken>,
        header_name: Option<&str>,
    ) -> Result<Value, String> {
        let mut params = base_params;
        for round in 0..MAX_MRTR_ROUNDS {
            let result = self
                .request_endpoint(server_name, method, params.clone(), cancel, header_name)
                .await?;
            if !is_input_required(&result) {
                return Ok(result);
            }
            // Last round: the server still wants input we can no longer satisfy.
            // Error before prompting so we don't collect an answer we'll discard.
            if round + 1 == MAX_MRTR_ROUNDS {
                break;
            }
            let parsed = parse_input_required(&result);
            let responses = self
                .gather_input_responses(ui, server_name, cancel, &parsed.requests)
                .await?;
            params = build_retry_params(params, responses, parsed.request_state.as_ref());
        }
        Err(format!(
            "MCP {method} did not complete after {MAX_MRTR_ROUNDS} input rounds"
        ))
    }

    /// Turn each parsed elicitation request into its `ElicitResult`, prompting
    /// the user for the ones we're willing to show and applying the fail-closed
    /// rules for the ones we're not.
    async fn gather_input_responses(
        &self,
        ui: Option<&crate::ui::UiBridge>,
        server_name: &str,
        cancel: Option<&CancellationToken>,
        requests: &[ElicitationRequest],
    ) -> Result<Map<String, Value>, String> {
        let mut responses = Map::new();
        for req in requests {
            // A caller cancellation mid-round aborts the whole logical request
            // rather than prompting for input nobody is waiting on anymore.
            if cancel.is_some_and(CancellationToken::is_cancelled) {
                return Err(format!("MCP {server_name} cancelled during input"));
            }
            // A request whose *method* we never declared support for is a
            // protocol violation; refuse the whole call rather than guess.
            if let Some(reason) = &req.blocked {
                if req.fatal {
                    return Err(format!("MCP server '{server_name}': {reason}"));
                }
                // Credential form / invalid url: decline without prompting.
                warn!(server = %server_name, key = %req.key, "MCP elicitation auto-declined: {}", reason);
                responses.insert(req.key.clone(), build_elicit_result("decline", None));
                continue;
            }
            let value = self
                .prompt_elicitation(ui, server_name, cancel, req)
                .await?;
            responses.insert(req.key.clone(), value);
        }
        Ok(responses)
    }

    /// Emit the elicitation to the UI, await the user's decision, and (for an
    /// accepted URL-mode request) open the URL in the OS browser. Returns the
    /// `ElicitResult` value to echo back to the server. The wait is raced
    /// against the caller `cancel` token and a wall-clock deadline (echoed to
    /// the UI in the payload); either ⇒ the pending entry is dropped, a
    /// `mcp:elicitation:close` event is emitted so any open modal dismisses
    /// itself, and a `cancel` result is returned to the server.
    async fn prompt_elicitation(
        &self,
        ui: Option<&crate::ui::UiBridge>,
        server_name: &str,
        cancel: Option<&CancellationToken>,
        req: &ElicitationRequest,
    ) -> Result<Value, String> {
        let Some(ui) = ui else {
            return Err(
                "MCP server requested user input, but no UI is attached to prompt for it"
                    .to_string(),
            );
        };
        let request_id = uuid::Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel::<Value>();
        let mode = match req.mode {
            ElicitMode::Form => "form",
            ElicitMode::Url => "url",
        };
        let payload = serde_json::json!({
            "requestId": request_id,
            "serverName": server_name,
            "mode": mode,
            "message": req.message,
            "url": req.url,
            "schema": req.requested_schema,
            "timeoutSecs": ELICIT_TIMEOUT_SECS,
        });
        {
            let mut pending = self.lock_elicitations();
            pending.insert(
                request_id.clone(),
                PendingElicit {
                    tx,
                    payload: payload.clone(),
                },
            );
        }
        if let Err(e) = ui.sink.emit_result("mcp:elicitation:request", &payload) {
            self.lock_elicitations().remove(&request_id);
            return Err(format!("failed to surface MCP elicitation: {e}"));
        }

        let timeout = tokio::time::sleep(std::time::Duration::from_secs(ELICIT_TIMEOUT_SECS));
        let cancelled = async {
            match cancel {
                Some(token) => token.cancelled().await,
                None => std::future::pending().await,
            }
        };
        let decision = tokio::select! {
            biased;
            r = rx => match r {
                Ok(value) => value,
                // Sender dropped (session teardown) ⇒ treat as cancel.
                Err(_) => build_elicit_result("cancel", None),
            },
            _ = timeout => self.abandon_elicitation(ui, &request_id),
            _ = cancelled => self.abandon_elicitation(ui, &request_id),
        };

        let action = decision.get("action").and_then(Value::as_str).unwrap_or("cancel");

        // URL mode: only open the URL after an explicit accept, and only via the
        // OS browser (never fetched or rendered in-app). Content is never
        // attached for url mode.
        if req.mode == ElicitMode::Url {
            if action == "accept" {
                if let Some(url) = &req.url {
                    if let Err(e) = ui.browser.open_url(&url.clone()) {
                        warn!(server = %server_name, "failed to open elicitation URL: {}", e);
                    }
                }
            }
            return Ok(build_elicit_result(action, None));
        }

        // Form mode: attach the submitted content only on accept.
        let content = decision.get("content").cloned();
        Ok(build_elicit_result(action, content))
    }

    /// Drop a pending entry the user never answered (timeout / cancel) and tell
    /// the UI to dismiss its modal so a stale prompt can't be submitted into a
    /// call that already moved on. Returns the `cancel` result for the server.
    fn abandon_elicitation(&self, ui: &crate::ui::UiBridge, request_id: &str) -> Value {
        self.lock_elicitations().remove(request_id);
        let _ = ui.sink.emit_result(
            "mcp:elicitation:close",
            &serde_json::json!({ "requestId": request_id }),
        );
        build_elicit_result("cancel", None)
    }

    /// Re-emit every in-flight elicitation so a freshly-mounted or reloaded UI
    /// picks up prompts that fired before it was listening. Called from the
    /// command layer when the frontend (re)subscribes.
    pub fn replay_elicitations(&self, ui: &crate::ui::UiBridge) {
        let payloads: Vec<Value> = {
            let pending = self.lock_elicitations();
            pending.values().map(|p| p.payload.clone()).collect()
        };
        for payload in payloads {
            let _ = ui.sink.emit_result("mcp:elicitation:request", &payload);
        }
    }

    /// Resolve a pending elicitation from the command layer. `value` is the raw
    /// `{action, content?}` object the UI collected. Returns an error if no
    /// elicitation is awaiting this id (already resolved, timed out, or stale).
    pub fn resolve_elicitation(&self, request_id: &str, value: Value) -> Result<(), String> {
        let sender = {
            let mut pending = self.lock_elicitations();
            pending.remove(request_id)
        };
        match sender {
            Some(entry) => entry
                .tx
                .send(value)
                .map_err(|_| "elicitation was no longer awaiting a response".to_string()),
            None => Err("no MCP elicitation is pending for this id".to_string()),
        }
    }

    /// Test-only snapshot of how many elicitations are awaiting a response.
    #[cfg(test)]
    pub(crate) fn pending_elicitation_ids(&self) -> Vec<String> {
        self.elicitations.lock().unwrap().keys().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mrtr::ElicitationRequest;

    /// A client with no live endpoints, enough to exercise the fail-closed
    /// elicitation paths that never touch the transport.
    fn test_client() -> McpClient {
        use std::sync::Arc;
        let security = Arc::new(zen_security::service::SecurityService::new());
        let workspace = Arc::new(tokio::sync::RwLock::new(std::env::temp_dir()));
        let config = Arc::new(crate::config::McpConfigService::new(
            workspace,
            security.clone(),
        ));
        let discovery = Arc::new(crate::discovery::McpDiscoveryService::new(config.clone()));
        let consent = Arc::new(crate::consent::McpConsentStore::new(security.clone()));
        McpClient::new(
            Arc::new(crate::registrar::NoopRegistrar),
            config,
            discovery,
            security,
            Arc::new(crate::oauth::test_support::MemSecrets::new()),
            consent,
        )
    }

    #[test]
    fn resolve_unknown_elicitation_errors() {
        let client = test_client();
        assert!(client
            .resolve_elicitation("no-such-id", build_elicit_result("accept", None))
            .is_err());
    }

    #[tokio::test]
    async fn fatal_blocked_request_fails_the_whole_call() {
        // An unsupported server-request method is a protocol violation: the
        // whole gather errors rather than silently declining.
        let client = test_client();
        let reqs = vec![ElicitationRequest {
            key: "k".into(),
            mode: ElicitMode::Form,
            message: "x".into(),
            url: None,
            requested_schema: None,
            blocked: Some("unsupported input method 'sampling/createMessage'".into()),
            fatal: true,
        }];
        assert!(client
            .gather_input_responses(None, "srv", None, &reqs)
            .await
            .is_err());
    }

    #[tokio::test]
    async fn non_fatal_blocked_request_auto_declines_without_ui() {
        // A credential form / bad URL is auto-declined (no UI handle needed),
        // so a secret is never surfaced to the in-band form channel.
        let client = test_client();
        let reqs = vec![ElicitationRequest {
            key: "k".into(),
            mode: ElicitMode::Form,
            message: "give me your api_key".into(),
            url: None,
            requested_schema: None,
            blocked: Some("server asked for a credential via form mode".into()),
            fatal: false,
        }];
        let responses = client
            .gather_input_responses(None, "srv", None, &reqs)
            .await
            .expect("auto-decline should not error");
        assert_eq!(
            responses.get("k").and_then(|v| v.get("action")),
            Some(&serde_json::json!("decline"))
        );
        assert!(client.pending_elicitation_ids().is_empty());
    }

    #[tokio::test]
    async fn unblocked_request_without_ui_fails_closed() {
        // A legitimate prompt with no UI handle cannot ask the user, so it
        // errors rather than hanging or auto-answering.
        let client = test_client();
        let reqs = vec![ElicitationRequest {
            key: "k".into(),
            mode: ElicitMode::Form,
            message: "your name?".into(),
            url: None,
            requested_schema: Some(serde_json::json!({"type": "object"})),
            blocked: None,
            fatal: false,
        }];
        assert!(client
            .gather_input_responses(None, "srv", None, &reqs)
            .await
            .is_err());
    }

    #[tokio::test]
    async fn already_cancelled_token_aborts_before_prompting() {
        // A caller cancellation surfaces as an error instead of prompting, so a
        // cancelled turn never opens a modal nobody is waiting on.
        let client = test_client();
        let token = CancellationToken::new();
        token.cancel();
        let reqs = vec![ElicitationRequest {
            key: "k".into(),
            mode: ElicitMode::Form,
            message: "your name?".into(),
            url: None,
            requested_schema: Some(serde_json::json!({"type": "object"})),
            blocked: None,
            fatal: false,
        }];
        assert!(client
            .gather_input_responses(None, "srv", Some(&token), &reqs)
            .await
            .is_err());
        assert!(client.pending_elicitation_ids().is_empty());
    }
}
