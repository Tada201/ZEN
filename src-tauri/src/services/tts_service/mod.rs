use rodio::{buffer::SamplesBuffer, OutputStream, OutputStreamHandle, Sink};
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, RwLock};
use tracing::{error, info};

use crate::services::runtime_resource::{configure_std_command_for_binary, RuntimeResources};

struct AudioHandle(OutputStream, OutputStreamHandle, Sink);

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

    pub async fn speak(&self, text: &str, app: AppHandle) -> Result<(), String> {
        if text.trim().is_empty() {
            return Ok(());
        }

        info!("TTS requested for text length: {}", text.len());

        let text_owned = text.to_string();
        let audio_handle_clone = self.audio_handle.clone();
        let piper_path_clone = self.piper_path.clone();
        let process_manager_clone = self.process_manager.clone();

        let model_path_guard = self.model_path.read().await;
        let model_path_clone = model_path_guard.clone();
        drop(model_path_guard);

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
                    error!(
                        "Failed to spawn piper process: {}. Ensure '{}' exists and is executable.",
                        e, piper_exe
                    );
                    return;
                }
            };

            // Get PID before registering
            let pid = child.id();

            // Register with process manager if available
            if let Some(ref pm) = process_manager_clone {
                let pm_clone = pm.clone();
                let _ = std::thread::spawn(move || {
                    let rt = tokio::runtime::Handle::current();
                    rt.block_on(async move {
                        pm_clone
                            .register(&format!("piper-{}", pid), "piper-tts", pid)
                            .await;
                    });
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
                let _ = std::thread::spawn(move || {
                    let rt = tokio::runtime::Handle::current();
                    rt.block_on(async move {
                        pm_clone.unregister(&format!("piper-{}", pid)).await;
                    });
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

                let buffer = SamplesBuffer::new(channels.get(), sample_rate.get(), samples);

                if let Ok(handle_lock) = audio_handle_clone.try_lock() {
                    if let Some(AudioHandle(_stream, _stream_handle, sink)) = handle_lock.as_ref() {
                        let _ = app.emit(
                            "tts:start",
                            serde_json::json!({ "duration_ms": duration_ms }),
                        );
                        sink.append(buffer);

                        // Emit stop after playback completes without holding the blocking thread
                        let app_clone = app.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(duration_ms));
                            let _ = app_clone.emit("tts:stop", ());
                        });
                    }
                }
            } else {
                error!(
                    "Piper failed or returned empty output. Status: {:?}",
                    output.status
                );
                if !output.stderr.is_empty() {
                    error!("Piper stderr: {}", String::from_utf8_lossy(&output.stderr));
                }
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
