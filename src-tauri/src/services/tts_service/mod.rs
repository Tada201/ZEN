use rodio::{buffer::SamplesBuffer, OutputStream, OutputStreamHandle, Sink};
use serde::Serialize;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use tracing::{error, info};
use zen_core::ports::EventSink;

use crate::services::runtime_resource::{configure_std_command_for_binary, RuntimeResources};

struct AudioHandle(OutputStream, OutputStreamHandle, Sink);

/// Piper releases package eSpeak data as `espeak-ng-data/`. Older Zen-managed
/// installs flattened that directory, so accept both layouts while the runtime
/// installer migrates to the canonical path.
fn resolve_espeak_data_dir(piper_path: &std::path::Path) -> Option<PathBuf> {
    let runtime_dir = piper_path.parent()?;
    let canonical = runtime_dir.join("espeak-ng-data");
    if canonical.join("phontab").is_file() {
        return Some(canonical);
    }
    runtime_dir.join("phontab").is_file().then(|| runtime_dir.to_path_buf())
}

/// One sentence-sized caption cue.
///
/// Piper cannot emit word-level timestamps, so we pre-split the text on
/// sentence boundaries and assign estimated start/end times proportional
/// to character count. The frontend uses this to highlight the active
/// sentence in the closed-caption box as Piper plays.
#[derive(Debug, Clone, Serialize)]
pub struct TtsSentenceCue {
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
}

// Safety: OutputStream is !Send on Windows/WASAPI, but we need it to stay alive
// to maintain the audio context. By wrapping it in a Mutex and implementing Send/Sync,
// we satisfy Tauri's State requirements.
unsafe impl Send for AudioHandle {}
unsafe impl Sync for AudioHandle {}

pub struct TtsService {
    audio_handle: Arc<Mutex<Option<AudioHandle>>>,
    model_path: Arc<RwLock<PathBuf>>,
    piper_path: PathBuf,
    /// Optional reference to process manager for cleanup tracking
    process_manager: Option<Arc<crate::services::process_manager::ProcessManager>>,
}

impl TtsService {
    pub fn new_dummy() -> Self {
        Self {
            audio_handle: Arc::new(Mutex::new(None)),
            model_path: Arc::new(RwLock::new(PathBuf::new())),
            piper_path: PathBuf::new(),
            process_manager: None,
        }
    }

    pub fn new(
        _app_data_dir: &std::path::Path,
        resource_dir: &std::path::Path,
    ) -> Result<Self, String> {
        let (stream, stream_handle) = OutputStream::try_default()
            .map_err(|e| format!("Failed to open default audio stream: {}", e))?;
        let sink =
            Sink::try_new(&stream_handle).map_err(|e| format!("Failed to create sink: {}", e))?;

        let runtime = RuntimeResources::new(_app_data_dir, resource_dir);
        let piper_binary = runtime.piper_binary();
        let piper_path = piper_binary.path.clone();

        // Check if there's a custom model saved in settings; otherwise use default
        let model_path = runtime.default_piper_model_path();

        if !piper_path.exists() {
            error!(
                "Piper binary not found at resource path: {}",
                piper_path.display()
            );
        }

        Ok(Self {
            audio_handle: Arc::new(Mutex::new(Some(AudioHandle(stream, stream_handle, sink)))),
            model_path: Arc::new(RwLock::new(model_path)),
            piper_path,
            process_manager: None,
        })
    }

    /// Create a new TtsService with process manager integration
    pub fn with_process_manager(
        _app_data_dir: &std::path::Path,
        resource_dir: &std::path::Path,
        process_manager: Arc<crate::services::process_manager::ProcessManager>,
    ) -> Result<Self, String> {
        let (stream, stream_handle) = OutputStream::try_default()
            .map_err(|e| format!("Failed to open default audio stream: {}", e))?;
        let sink =
            Sink::try_new(&stream_handle).map_err(|e| format!("Failed to create sink: {}", e))?;

        let runtime = RuntimeResources::new(_app_data_dir, resource_dir);
        let piper_binary = runtime.piper_binary();
        let piper_path = piper_binary.path.clone();
        let model_path = runtime.default_piper_model_path();

        if !piper_path.exists() {
            error!(
                "Piper binary not found at resource path: {}",
                piper_path.display()
            );
        }

        Ok(Self {
            audio_handle: Arc::new(Mutex::new(Some(AudioHandle(stream, stream_handle, sink)))),
            model_path: Arc::new(RwLock::new(model_path)),
            piper_path,
            process_manager: Some(process_manager),
        })
    }

    pub async fn set_model(&self, path: PathBuf) {
        let mut model_path = self.model_path.write().await;
        *model_path = path;
        info!("TTS model updated to: {}", model_path.display());
    }

    /// Rebuild the audio output sink on a specific cpal device by name.
    /// `None` resets to the system default. Errors are returned to the caller.
    pub async fn set_output_device(&self, device_name: Option<String>) -> Result<(), String> {
        let new_handle = tokio::task::spawn_blocking(move || build_audio_handle(device_name))
            .await
            .map_err(|e| format!("Audio device task join failed: {e}"))??;

        let mut handle_lock = self.audio_handle.lock().await;
        *handle_lock = Some(new_handle);
        info!("TTS output device updated");
        Ok(())
    }

    pub async fn speak(&self, text: &str, events: Arc<dyn EventSink>) -> Result<(), String> {
        if text.trim().is_empty() {
            return Ok(());
        }

        info!("TTS requested for text length: {}", text.len());

        // ── Pre-flight: verify piper binary exists before spawning ──
        // Note: returns Err directly — the IPC error path handles surfacing.
        // tts:error is only emitted from the blocking task where errors can't propagate.
        if !self.piper_path.exists() {
            let msg = format!(
                "Piper binary not found at '{}'. Download the Piper runtime or switch TTS engine to 'web'.",
                self.piper_path.display()
            );
            error!("{}", msg);
            return Err(msg);
        }

        let text_owned = text.to_string();
        let audio_handle_clone = self.audio_handle.clone();
        let piper_path_clone = self.piper_path.clone();
        let process_manager_clone = self.process_manager.clone();

        let model_path_guard = self.model_path.read().await;
        let model_path_clone = model_path_guard.clone();
        drop(model_path_guard);

        // ── Pre-flight: verify model file exists ──
        if !model_path_clone.exists() {
            let msg = format!(
                "Piper voice model not found at '{}'. Download a voice model in Settings → Audio.",
                model_path_clone.display()
            );
            error!("{}", msg);
            return Err(msg);
        }

        let espeak_data_dir = resolve_espeak_data_dir(&piper_path_clone).ok_or_else(|| {
            format!(
                "Piper eSpeak data is missing beside '{}'. Reinstall Piper from Settings > Dependencies.",
                piper_path_clone.display()
            )
        })?;

        tokio::task::spawn_blocking(move || {
            let piper_exe = piper_path_clone.to_string_lossy().into_owned();
            let model_path = model_path_clone.to_string_lossy().into_owned();

            let mut command = Command::new(&piper_exe);
            configure_std_command_for_binary(&mut command, &piper_path_clone);

            // Find config file: try {model}.json and {model_without_onnx}.json
            let model_p = std::path::PathBuf::from(&model_path);
            let mut config_path = None;

            // Try model.onnx.json
            let c1 = {
                let mut os = model_p.clone().into_os_string();
                os.push(".json");
                std::path::PathBuf::from(os)
            };
            if c1.exists() {
                config_path = Some(c1);
            } else {
                // Try model.json (replacing .onnx with .json)
                let c2 = model_p.with_extension("json");
                if c2.exists() {
                    config_path = Some(c2);
                }
            }

            command.arg("--model").arg(&model_path).arg("--output_raw");
            command.arg("--espeak_data").arg(espeak_data_dir);

            if let Some(cp) = config_path {
                command.arg("--config").arg(cp);
            }

            let mut child = match command
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
            {
                Ok(child) => child,
                Err(e) => {
                    let msg = format!(
                        "Failed to spawn piper process: {}. Ensure '{}' exists and is executable.",
                        e, piper_exe
                    );
                    error!("{}", msg);
                    events.emit("tts:error", &serde_json::json!({ "error": msg }));
                    return;
                }
            };

            // Get PID before registering
            let pid = child.id();

            // Register with process manager if available
            if let Some(ref pm) = process_manager_clone {
                let pm_clone = pm.clone();
                tokio::spawn(async move {
                    pm_clone
                        .register(&format!("piper-{}", pid), "piper-tts", pid)
                        .await;
                });
            }

            if let Some(mut stdin) = child.stdin.take() {
                let text_to_write = format!("{}\n", text_owned);
                std::thread::spawn(move || {
                    if let Err(e) = stdin.write_all(text_to_write.as_bytes()) {
                        error!("Failed to write to piper stdin: {}", e);
                    }
                });
            }

            let output = match child.wait_with_output() {
                Ok(out) => out,
                Err(e) => {
                    error!("Failed to wait on piper process: {}", e);
                    return;
                }
            };

            // Unregister from process manager after completion
            if let Some(ref pm) = process_manager_clone {
                let pm_clone = pm.clone();
                tokio::spawn(async move {
                    pm_clone.unregister(&format!("piper-{}", pid)).await;
                });
            }

            if output.status.success() && !output.stdout.is_empty() {
                let raw_bytes = output.stdout;
                let mut samples: Vec<f32> = Vec::with_capacity(raw_bytes.len() / 2);

                let mut iter = raw_bytes.chunks_exact(2);
                for chunk in &mut iter {
                    let sample_i16 = i16::from_le_bytes([chunk[0], chunk[1]]);
                    // Convert to f32 in range [-1.0, 1.0]
                    samples.push(sample_i16 as f32 / 32768.0);
                }

                let channels = std::num::NonZeroU16::new(1).unwrap();
                let sample_rate = std::num::NonZeroU32::new(22050).unwrap();

                // Calculate estimated duration before playing
                let duration_secs = samples.len() as f32 / 22050.0;
                let duration_ms = (duration_secs * 1000.0) as u64;

                let buffer = SamplesBuffer::new(channels.get(), sample_rate.get(), samples.clone());

                // Build sentence-level caption cues for the closed-caption box.
                // Piper cannot emit word-level timestamps, so we estimate the
                // start/end of each sentence proportionally to its char count.
                let cues = build_sentence_cues(&text_owned, duration_ms);

                if let Ok(handle_lock) = audio_handle_clone.try_lock() {
                    if let Some(AudioHandle(_stream, _stream_handle, sink)) = handle_lock.as_ref() {
                        events.emit(
                            "tts:start",
                            &serde_json::json!({
                                "text": text_owned,
                                "sentences": cues,
                                "duration_ms": duration_ms,
                            }),
                        );
                        sink.append(buffer);

                        // Block this spawn_blocking task until playback actually
                        // finishes. This replaces the previous heuristic
                        // thread::sleep(duration_ms) which could fire
                        // tts:stop early or late depending on Piper's real-time
                        // factor.
                        // Playback tracking loop to emit real-time audio energy levels
                        let start_time = std::time::Instant::now();
                        let sample_rate = 22050.0;
                        let frame_size = 1024;
                        let samples_len = samples.len();

                        while !sink.empty() {
                            let elapsed_secs = start_time.elapsed().as_secs_f32();
                            let current_idx = (elapsed_secs * sample_rate) as usize;
                            if current_idx < samples_len {
                                let end_idx = (current_idx + frame_size).min(samples_len);
                                let frame = &samples[current_idx..end_idx];
                                if !frame.is_empty() {
                                    let mut sum_sq = 0.0;
                                    for &s in frame {
                                        sum_sq += s * s;
                                    }
                                    let rms = (sum_sq / frame.len() as f32).sqrt();
                                    let level = (rms * 5.0).min(1.0);
                                    events
                                        .emit("tts:level", &serde_json::json!({ "level": level }));
                                }
                            }
                            std::thread::sleep(std::time::Duration::from_millis(30));
                        }
                        sink.sleep_until_end();

                        events.emit("tts:stop", &serde_json::Value::Null);
                    } else {
                        events.emit(
                            "tts:error",
                            &serde_json::json!({ "error": "Audio output is not initialized" }),
                        );
                    }
                } else {
                    events.emit(
                        "tts:error",
                        &serde_json::json!({ "error": "Audio output is busy" }),
                    );
                }
            } else {
                let stderr_text = String::from_utf8_lossy(&output.stderr);
                let msg = format!(
                    "Piper failed (exit {:?}). stderr: {}",
                    output.status,
                    if stderr_text.is_empty() {
                        "(empty)".to_string()
                    } else {
                        stderr_text.to_string()
                    }
                );
                error!("{}", msg);
                events.emit("tts:error", &serde_json::json!({ "error": msg }));
            }
        });

        Ok(())
    }

    pub async fn stop(&self) {
        let mut handle_lock = self.audio_handle.lock().await;
        // Drop the old handle first to stop all active playback
        let _ = handle_lock.take();
        // Create a fresh handle for future playback
        match OutputStream::try_default() {
            Ok((stream, stream_handle)) => {
                if let Ok(sink) = Sink::try_new(&stream_handle) {
                    *handle_lock = Some(AudioHandle(stream, stream_handle, sink));
                }
            }
            Err(e) => {
                tracing::error!("Failed to reopen audio sink after stop: {}", e);
            }
        }
    }
}

fn build_audio_handle(device_name: Option<String>) -> Result<AudioHandle, String> {
    use cpal::traits::{DeviceTrait, HostTrait};

    let host = cpal::default_host();
    let device = match device_name.as_deref() {
        Some(name) => host
            .output_devices()
            .map_err(|e| format!("Enumerate output devices: {e}"))?
            .find(|d| d.name().map(|n| n == name).unwrap_or(false))
            .ok_or_else(|| format!("Output device '{name}' not found"))?,
        None => host
            .default_output_device()
            .ok_or_else(|| "No default output device available".to_string())?,
    };
    let (stream, stream_handle) =
        OutputStream::try_from_device(&device).map_err(|e| format!("Open output device: {e}"))?;
    let sink = Sink::try_new(&stream_handle).map_err(|e| format!("Create audio sink: {e}"))?;
    Ok(AudioHandle(stream, stream_handle, sink))
}

/// Split a piece of text into sentence-sized caption cues with estimated
/// start/end times proportional to character count.
///
/// Piper has no word-level timestamp mode, so the cue times are estimates
/// derived from the relative weight of each sentence. This is good enough
/// to drive a "current sentence" highlight in the closed-caption box; it
/// is not intended for frame-accurate word timing.
fn build_sentence_cues(text: &str, total_duration_ms: u64) -> Vec<TtsSentenceCue> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    let mut sentences: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut chars = trimmed.chars().peekable();
    while let Some(c) = chars.next() {
        current.push(c);
        if matches!(c, '.' | '!' | '?') {
            // Consume any trailing whitespace as part of this sentence
            // so the next cue starts on the first real character.
            while let Some(&next) = chars.peek() {
                if next.is_whitespace() {
                    current.push(chars.next().unwrap());
                } else {
                    break;
                }
            }
            let piece = current.trim().to_string();
            if !piece.is_empty() {
                sentences.push(piece);
            }
            current.clear();
        }
    }
    let tail = current.trim();
    if !tail.is_empty() {
        sentences.push(tail.to_string());
    }
    if sentences.is_empty() {
        sentences.push(trimmed.to_string());
    }

    let weights: Vec<usize> = sentences.iter().map(|s| s.chars().count().max(1)).collect();
    let total_weight: usize = weights.iter().sum();
    let total_ms = total_duration_ms.max(1);

    let mut cues = Vec::with_capacity(sentences.len());
    let mut acc_ms: u64 = 0;
    for (sentence, &weight) in sentences.iter().zip(weights.iter()) {
        let dur = ((weight as u64) * total_ms) / (total_weight as u64);
        let start = acc_ms;
        let end = acc_ms + dur;
        cues.push(TtsSentenceCue {
            text: sentence.clone(),
            start_ms: start,
            end_ms: end,
        });
        acc_ms = end;
    }
    // Pin the final cue's end_ms to the actual total to avoid a 1-cue
    // rounding gap when the last sentence is short.
    if let Some(last) = cues.last_mut() {
        last.end_ms = total_ms;
    }
    cues
}
