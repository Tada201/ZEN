pub mod document;
pub mod gtsm;
pub mod hardware;
pub mod logging;
pub mod mcp_adapter;
pub mod mcp_config;
pub mod media;
pub mod permissions;
pub mod process_manager;
pub mod runtime_resource;
pub mod secret;
pub mod secret_policy;
pub mod security;
pub mod settings;
pub mod speech_service;
pub mod terminal;
pub mod tool;
pub mod tts_service;
pub mod usage;

pub use document::DocumentService;
pub use media::MediaService;
pub use hardware::{HardwareInfo, HardwareService};
pub use logging::init_backend_logging;
pub use mcp_config::{McpConfigError, McpConfigService, McpServerEntry, McpTransport};
pub use secret::SecretService;
pub use secret_policy::{
    is_secret_key, is_secret_placeholder_write, redact_if_secret, SECRET_PRESENT_SENTINEL,
};
pub use security::{
    AuditEvent, PermissionDecision, PermissionRequest, PrivilegedOperation, RiskLevel,
    SecurityService,
};
pub use settings::SettingsService;
pub use speech_service::SpeechService;
pub use terminal::TerminalService;
pub use tool::ToolService;
pub use tts_service::TtsService;
pub use usage::UsageService;
