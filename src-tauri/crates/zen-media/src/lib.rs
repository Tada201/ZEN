//! zen-media — speech (whisper) and TTS (piper) runtimes plus their
//! supporting hardware probe, subprocess lifecycle and HTTP helpers.
//!
//! Tauri-free: the TTS seam emits through `zen_core::ports::EventSink`. The
//! app crate keeps the composition role — constructing the services and
//! wrapping its `AppHandle` in a `TauriEventSink`.

pub mod hardware;
pub mod http;
pub mod process_manager;
pub mod runtime_resource;
pub mod speech_service;
pub mod tts_service;

pub use hardware::{HardwareInfo, HardwareService};
pub use process_manager::ProcessManager;
pub use speech_service::SpeechService;
pub use tts_service::TtsService;
