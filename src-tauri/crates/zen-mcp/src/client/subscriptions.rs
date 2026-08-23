//! Server→client list-change subscriptions for `McpClient` (Phase 5).
//!
//! MCP servers signal that their tool/resource/prompt catalogs changed with
//! one-way notifications (`notifications/tools/list_changed`, …). For the stdio
//! transport those arrive on the child's stdout; `StdioTransport` forwards the
//! method name on a channel and this module turns that into the right reaction:
//!
//! * `tools/list_changed` → schedule a full resync so the ToolManager catalog
//!   picks up the new/removed `ext:*` adapters. The resync drops and rebuilds
//!   the transport, which closes this listener's channel and ends its loop, so
//!   exactly one listener is ever live per server (no accumulation across
//!   resyncs).
//! * `resources/list_changed` / `prompts/list_changed` / `resources/updated`
//!   → invalidate this server's cached lists so the next explicit read refetches
//!   fresh data. No model insertion happens automatically.
//!
//! Determinism on loss: the channel closes when the reader task stops (child
//! EOF or error), so the listener loop terminates on its own on process loss —
//! there is no orphaned task. Re-subscription happens implicitly because a
//! reconnect spawns a fresh transport with a fresh listener.
//!
//! ponytail: HTTP-transport list-change relies on the existing `mcp_reconnect`
//! command rather than a persistent SSE GET stream. Upgrade path: open a
//! long-lived `GET` event-stream per HTTP server and feed its notification
//! frames into the same handler below.

use std::sync::Arc;

use tokio::sync::mpsc;
use tracing::info;

use crate::types::methods;

use super::McpClient;

impl McpClient {
    /// Spawn a background listener that reacts to a stdio server's list-change
    /// notifications. Consumes the transport's notification receiver (taken
    /// once per transport). The listener ends when the channel closes on
    /// process loss, so callers never need to cancel it explicitly.
    pub(super) fn spawn_stdio_subscription(
        self: &Arc<Self>,
        server_name: String,
        mut notifications: mpsc::UnboundedReceiver<String>,
        ui: Option<Arc<crate::ui::UiBridge>>,
    ) {
        let client = Arc::clone(self);
        tokio::spawn(async move {
            while let Some(method) = notifications.recv().await {
                match method.as_str() {
                    methods::NOTIFICATIONS_TOOLS_LIST_CHANGED => {
                        info!(
                            server = %server_name,
                            "mcp subscription: tools/list_changed, scheduling resync"
                        );
                        client.cache_invalidate_server(&server_name);
                        // A resync rebuilds this server's transport, closing the
                        // channel this loop reads and ending it; a new listener
                        // is spawned for the new transport. `recv()` returns
                        // `None` right after, so we break cleanly below.
                        let resync = Arc::clone(&client);
                        let ui = ui.clone();
                        tokio::spawn(async move {
                            resync.sync_external_servers(ui.as_deref()).await;
                        });
                    }
                    methods::NOTIFICATIONS_RESOURCES_LIST_CHANGED
                    | methods::NOTIFICATIONS_PROMPTS_LIST_CHANGED
                    | methods::NOTIFICATIONS_RESOURCES_UPDATED => {
                        info!(
                            server = %server_name,
                            method = %method,
                            "mcp subscription: list/resource change, invalidating cache"
                        );
                        client.cache_invalidate_server(&server_name);
                    }
                    _ => {
                        // Any other notification (progress, logging, …) is not a
                        // catalog signal; ignore it.
                    }
                }
            }
            info!(
                server = %server_name,
                "mcp subscription: notification stream closed (process loss or resync)"
            );
        });
    }
}
