//! zen-mcp — Model Context Protocol client, config, consent and discovery
//! for the Zen backend workspace (BIG_MIGRATION.md Phase 8).
//!
//! NO tauri: UI interaction flows through the [`ui::UiBridge`] ports
//! (zen-core `EventSink` + [`oauth::flow::OAuthBrowser`]) and secret access
//! through the zen-core `SecretStore` port. Security policy/audit comes from
//! the concrete `zen-security` service (sanctioned dependency). External
//! tools are surfaced to the host via the [`registrar::ExternalToolRegistrar`]
//! port because `zen_tools::ToolRegistry` is generic over the host context.

pub mod client;
pub mod config;
mod config_store;
pub mod consent;
pub mod discovery;
pub mod env;
pub mod mrtr;
pub mod registrar;
pub mod resources;
pub mod sandbox;
pub mod stdio;
pub mod tool_schema;
pub mod types;
pub mod ui;

pub mod oauth;

pub use client::{
    is_external_tool_name, prefixed_external_tool_name, risk_level_from_annotations, McpClient,
};
pub use config::{McpConfigError, McpConfigService, McpScope, McpServerEntry, McpTransport};
pub use consent::{McpConsentStore, PendingConsent};
pub use discovery::{
    McpAvailability, McpCapabilitySummary, McpDiscoveryService, McpInventory, McpServerRecord,
};
pub use registrar::{ExternalToolRegistrar, ExternalToolSpec};
pub use resources::McpResourceContents;
pub use ui::UiBridge;
