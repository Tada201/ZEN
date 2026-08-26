pub mod audit_sink;
pub mod store_ports;
pub mod checkpoint;
pub mod compact;
pub mod data_cleanup;
pub mod attachment_store;
pub mod agent_context;
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
pub mod terminal;
pub mod tool;
pub mod usage;

// Phase 10 shims: speech/tts runtimes plus the hardware probe, subprocess
// manager and runtime-resource helpers moved to the zen-media crate. Every
// historical `crate::services::{hardware,process_manager,runtime_resource,
// speech_service,tts_service}::*` path keeps compiling via these re-exports;
// Phase 14 deletes the shims after rewriting consumers to `zen_media::*`.
pub use zen_media::{hardware, process_manager, runtime_resource, speech_service, tts_service};

pub use checkpoint::{CheckpointInfo, CheckpointService, UndoResult};
pub use document::DocumentService;
pub use media::MediaService;
pub use hardware::{HardwareInfo, HardwareService};
pub use logging::init_backend_logging;

pub use secret::SecretService;
pub use zen_security::secrets::{
    is_secret_key, is_secret_placeholder_write, redact_if_secret, SECRET_PRESENT_SENTINEL,
};
pub use zen_security::service::{
    AuditEvent, PermissionDecision, PermissionRequest, PrivilegedOperation, RiskLevel,
    SecurityService,
};
pub use settings::SettingsService;
pub use speech_service::SpeechService;
pub use terminal::TerminalService;
pub use tool::ToolService;
pub use tts_service::TtsService;
pub use usage::UsageService;

// Phase 8 shims: MCP service logic moved to the zen-mcp crate.
pub use zen_mcp::{
    McpAvailability, McpCapabilitySummary, McpConfigError, McpConfigService, McpConsentStore,
    McpDiscoveryService, McpInventory, McpScope, McpServerEntry, McpTransport, PendingConsent,
};
