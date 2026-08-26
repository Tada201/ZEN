//! App-side services.
//!
//! Each submodule owns behavior that needs Tauri's `AppHandle`, the app's
//! `AppState`, or the OS keyring. Crate-owned services (security policy,
//! MCP, media runtimes) are imported from `zen_security::`, `zen_mcp::`, and
//! `zen_media::` directly — this module re-exports only its own submodules'
//! public types.
pub mod agent_context;
pub mod attachment_store;
pub mod audit_sink;
pub mod checkpoint;
pub mod compact;
pub mod data_cleanup;
pub mod document;
pub mod event_sink;
pub mod goal;
pub mod gtsm;
pub mod logging;
pub mod mcp_adapter;
pub mod mcp_registrar;
pub mod media;
pub mod secret;
pub mod settings;
pub mod store_ports;
pub mod terminal;
pub mod tool;
pub mod usage;

pub use checkpoint::{CheckpointInfo, CheckpointService, UndoResult};
pub use document::DocumentService;
pub use logging::init_backend_logging;
pub use media::MediaService;
pub use secret::SecretService;
pub use settings::SettingsService;
pub use terminal::TerminalService;
pub use tool::ToolService;
pub use usage::UsageService;
