//! Host-UI bridge ports for MCP flows (BIG_MIGRATION.md Phase 8).
//!
//! The MCP client must stay tauri-free, yet elicitation prompts, status
//! events and OAuth need two host capabilities: emitting frontend events and
//! opening the OS browser. [`UiBridge`] bundles the two ports behind `Arc`s
//! (spawned tasks clone them) so signatures thread one optional handle
//! instead of several.

use std::sync::Arc;

use zen_core::EventSink;

use crate::oauth::flow::OAuthBrowser;

/// Bundle of host capabilities the MCP client uses to talk to the UI.
///
/// Constructed by the app (tauri sink + opener-backed browser) and passed as
/// `Option<&UiBridge>`; `None` means headless/boot path — prompts fail
/// closed exactly as the former `Option<&AppHandle> == None` did.
#[derive(Clone)]
pub struct UiBridge {
    pub sink: Arc<dyn EventSink>,
    pub browser: Arc<dyn OAuthBrowser>,
}
