pub mod document;
pub mod gtsm;
pub mod hardware;
pub mod logging;
pub mod process_manager;
pub mod secret;
pub mod security;
pub mod settings;
pub mod speech_service;
pub mod terminal;
pub mod tool;
pub mod tts_service;

pub use document::DocumentService;
pub use hardware::{HardwareInfo, HardwareService};
pub use logging::init_backend_logging;
pub use secret::SecretService;
pub use security::{
    AuditEvent, PermissionDecision, PermissionRequest, PrivilegedOperation, RiskLevel,
    SecurityService,
};
pub use settings::SettingsService;
pub use speech_service::SpeechService;
pub use terminal::TerminalService;
pub use tool::ToolService;
pub use tts_service::TtsService;
