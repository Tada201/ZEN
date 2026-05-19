pub mod hardware;
pub mod terminal;
pub mod document;
pub mod settings;
pub mod gtsm;
pub mod process_manager;
pub mod speech_service;
pub mod tts_service;

pub use hardware::{HardwareService, HardwareInfo};
pub use terminal::TerminalService;
pub use document::DocumentService;
pub use settings::SettingsService;
pub use speech_service::SpeechService;
pub use tts_service::TtsService;
