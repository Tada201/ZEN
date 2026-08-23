//! App-side impl of the `zen-mcp` `ExternalToolRegistrar` port
//! (BIG_MIGRATION.md Phase 8 construction inversion) plus the host UI bridge.
//!
//! `ToolRegistry` is generic over the host context (`AppHandle` here), so the
//! adapter construction that was inlined in `McpClient::sync_external_servers`
//! moves behind the port: zen-mcp hands validated `ExternalToolSpec`s, this
//! impl wraps each one in an `McpToolAdapter` and registers it. The adapter's
//! `Weak<McpClient>` back-reference is provided via [`McpRegistrar::set_client_weak`]
//! right after the client `Arc` exists — same cycle-break as before.

use std::sync::{Arc, RwLock as StdRwLock, Weak};

use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tokio::sync::RwLock;
use zen_mcp::{ExternalToolRegistrar, ExternalToolSpec, McpClient, UiBridge};
use zen_tools::registry::ToolRegistry;

use crate::services::event_sink::TauriEventSink;
use crate::services::mcp_adapter::McpToolAdapter;

/// Registers external MCP tools into the app's v2 tool registry.
pub struct McpRegistrar {
    registry: Arc<RwLock<ToolRegistry<AppHandle>>>,
    client_weak: StdRwLock<Option<Weak<McpClient>>>,
}

impl McpRegistrar {
    pub fn new(registry: Arc<RwLock<ToolRegistry<AppHandle>>>) -> Self {
        Self {
            registry,
            client_weak: StdRwLock::new(None),
        }
    }

    /// Call immediately after wrapping the `McpClient` in its `Arc`.
    pub fn set_client_weak(self: &Arc<Self>, client: &Arc<McpClient>) {
        *self.client_weak.write().unwrap() = Some(Arc::downgrade(client));
    }
}

#[async_trait::async_trait]
impl ExternalToolRegistrar for McpRegistrar {
    async fn clear_external(&self) -> usize {
        let mut registry = self.registry.write().await;
        registry.remove_by_prefix("ext:")
    }

    async fn register_external(&self, spec: ExternalToolSpec) {
        let mcp_client = self
            .client_weak
            .read()
            .unwrap()
            .clone()
            .unwrap_or_else(|| {
                Weak::new()
            });
        let adapter = McpToolAdapter::new(
            spec.server_name,
            spec.tool_name,
            spec.description,
            spec.parameters,
            spec.output_schema,
            spec.annotations,
            spec.risk_level,
            mcp_client,
        );
        self.registry.write().await.register(Arc::new(adapter));
    }
}

/// Host browser opener backed by `tauri_plugin_opener` (system default
/// browser). Implements zen-mcp's `OAuthBrowser` port for OAuth redirects and
/// elicitation URL links.
pub struct OpenerBrowser {
    app: AppHandle,
}

impl OpenerBrowser {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl zen_mcp::oauth::flow::OAuthBrowser for OpenerBrowser {
    fn open_url(&self, url: &str) -> Result<(), String> {
        self.app
            .opener()
            .open_url(url, None::<&str>)
            .map_err(|e| e.to_string())
    }
}

/// Build the host UI bridge (tauri sink + opener browser) for a handle.
pub fn ui_bridge(app: &AppHandle) -> UiBridge {
    UiBridge {
        sink: Arc::new(TauriEventSink::new(app.clone())),
        browser: Arc::new(OpenerBrowser::new(app.clone())),
    }
}
