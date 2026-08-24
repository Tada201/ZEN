//! zen-media — speech (whisper) and TTS (piper) runtimes plus their
//! supporting hardware probe, subprocess lifecycle and HTTP helpers
//! (BIG_MIGRATION.md Phase 10).
//!
//! Tauri-free: the TTS seam emits through `zen_core::ports::EventSink`. The
//! app crate keeps the composition role (constructing services, wrapping the
//! `AppHandle` in a `TauriEventSink`) and re-exports these types via §4.6
//! shims until Phase 14.

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
