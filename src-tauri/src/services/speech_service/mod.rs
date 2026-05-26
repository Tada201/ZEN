use crate::services::hardware::HardwareInfo;
use crate::services::runtime_resource::{
    configure_tokio_command_for_binary, kill_pid_sync, RuntimeResources,
};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::process::Command;
use tracing::{info, warn};
use uuid::Uuid;

use reqwest::multipart;

const WHISPER_PORT: u16 = 8080;

#[derive(Debug, Clone, Serialize)]
pub struct ModelFileStatus {
    pub exists: bool,
    pub valid: bool,
    pub size_bytes: u64,
    pub path: String,
    pub source: String,
    pub error: Option<String>,
}

/// Manages the Whisper model lifecycle and transcription.
pub struct SpeechService {
    runtime: RuntimeResources,
    model_path: std::sync::Arc<tokio::sync::RwLock<PathBuf>>,
    model_name: std::sync::Arc<tokio::sync::RwLock<String>>,
    hardware: HardwareInfo,
    server_process: std::sync::Arc<tokio::sync::Mutex<Option<tokio::process::Child>>>,
    watchdog_running: std::sync::Arc<std::sync::atomic::AtomicBool>,
    /// Optional reference to process manager for cleanup tracking
    process_manager: Option<Arc<crate::services::process_manager::ProcessManager>>,
}

impl SpeechService {
    /// Create a new SpeechService pointing to the app data directory.
    pub fn new(
        app_data_dir: &std::path::Path,
        resource_dir: &std::path::Path,
        hardware: HardwareInfo,
    ) -> Self {
        Self::build(app_data_dir, resource_dir, hardware, None)
    }

    /// Create a new SpeechService with process manager integration
    pub fn with_process_manager(
        app_data_dir: &std::path::Path,
        resource_dir: &std::path::Path,
        hardware: HardwareInfo,
        process_manager: Arc<crate::services::process_manager::ProcessManager>,
    ) -> Self {
        Self::build(app_data_dir, resource_dir, hardware, Some(process_manager))
    }

    fn build(
        app_data_dir: &std::path::Path,
        resource_dir: &std::path::Path,
        hardware: HardwareInfo,
        process_manager: Option<Arc<crate::services::process_manager::ProcessManager>>,
    ) -> Self {
        let runtime = RuntimeResources::new(app_data_dir, resource_dir);
        let model_name = "ggml-base.en.bin".to_string();
        let model_path = runtime.whisper_model_path(&model_name);

        Self {
            runtime,
            model_path: std::sync::Arc::new(tokio::sync::RwLock::new(model_path)),
            model_name: std::sync::Arc::new(tokio::sync::RwLock::new(model_name)),
            hardware,
            server_process: std::sync::Arc::new(tokio::sync::Mutex::new(None)),
            watchdog_running: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            process_manager,
        }
    }

    /// Known minimum file sizes (in bytes) for each model to detect truncated downloads.
    fn expected_min_size(model_name: &str) -> u64 {
        match model_name {
            n if n.contains("tiny") => 30_000_000,    // ~39MB
            n if n.contains("base") => 60_000_000,    // ~74MB
            n if n.contains("small") => 200_000_000,  // ~240MB
            n if n.contains("medium") => 700_000_000, // ~760MB
            _ => 1_000_000,                           // at least 1MB for anything valid
        }
    }

    /// Check if the whisper model file exists on disk.
    pub async fn model_exists(&self) -> bool {
        self.model_path.read().await.exists()
    }

    /// Get model name.
    pub async fn model_name(&self) -> String {
        self.model_name.read().await.clone()
    }

    /// Subprocess model - no active memory holding needed.
    /// Always ready if model file exists.
    pub async fn is_loaded(&self) -> bool {
        self.model_exists().await
    }

    /// Check if a specific model file exists and is valid (not truncated).
    pub fn check_model_file(&self, model_name: &str) -> ModelFileStatus {
        let bundled = self.runtime.bundled_model_path(model_name);
        let downloaded = self.runtime.downloaded_model_path(model_name);

        let (path, source) = if bundled.exists() {
            (bundled, "bundled")
        } else if downloaded.exists() {
            (downloaded, "downloaded")
        } else {
            return ModelFileStatus {
                exists: false,
                valid: false,
                size_bytes: 0,
                path: downloaded.display().to_string(),
                source: "none".to_string(),
                error: Some("Model file not found".to_string()),
            };
        };

        let metadata = match std::fs::metadata(&path) {
            Ok(m) => m,
            Err(e) => {
                return ModelFileStatus {
                    exists: false,
                    valid: false,
                    size_bytes: 0,
                    path: path.display().to_string(),
                    source: source.to_string(),
                    error: Some(format!("Cannot read file metadata: {e}")),
                };
            }
        };

        let size = metadata.len();
        let min_size = Self::expected_min_size(model_name);
        let valid = size >= min_size;

        ModelFileStatus {
            exists: true,
            valid,
            size_bytes: size,
            path: path.display().to_string(),
            source: source.to_string(),
            error: if valid {
                None
            } else {
                Some(format!(
                    "File appears truncated: {}MB < expected minimum {}MB",
                    size / (1024 * 1024),
                    min_size / (1024 * 1024)
                ))
            },
        }
    }

    /// Download a specific whisper model by name, with validation.
    pub async fn download_model(&self, model_name: &str) -> Result<ModelFileStatus, String> {
        let target_path = self.runtime.downloaded_model_path(model_name);

        self.runtime
            .ensure_models_dir()
            .map_err(|e| format!("Failed to create models dir: {e}"))?;

        // Remove any existing partial/corrupt file
        if target_path.exists() {
            let status = self.check_model_file(model_name);
            if status.valid {
                info!(model = %model_name, "Model already exists and is valid, skipping download");
                return Ok(status);
            }
            info!(model = %model_name, "Existing file is invalid/truncated, re-downloading");
            std::fs::remove_file(&target_path).ok();
        }

        let url = format!(
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{}",
            model_name
        );

        info!(url = %url, model = %model_name, "Downloading Whisper model...");

        let response = reqwest::get(&url)
            .await
            .map_err(|e| format!("Download failed: {e}"))?;

        if !response.status().is_success() {
            return Err(format!("Download returned HTTP {}", response.status()));
        }

        // Get content-length for pre-validation if available
        let content_length = response.content_length();
        let min_expected = Self::expected_min_size(model_name);

        if let Some(cl) = content_length {
            if cl < min_expected {
                return Err(format!(
                    "Server reports file size {}MB which is below expected minimum {}MB — aborting",
                    cl / (1024 * 1024),
                    min_expected / (1024 * 1024)
                ));
            }
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read response body: {e}"))?;

        // Validate downloaded size before writing
        if (bytes.len() as u64) < min_expected {
            return Err(format!(
                "Downloaded {}MB but expected at least {}MB — file appears truncated",
                bytes.len() / (1024 * 1024),
                min_expected / (1024 * 1024)
            ));
        }

        self.runtime.atomic_write(&target_path, &bytes)?;

        info!(
            size_mb = bytes.len() / (1024 * 1024),
            path = %target_path.display(),
            "Whisper model downloaded and verified successfully"
        );

        Ok(self.check_model_file(model_name))
    }

    /// Download the whisper model if it doesn't exist (legacy ensure for start_server).
    pub async fn ensure_model(&self) -> Result<(), String> {
        if self.model_exists().await {
            let path_str = self.model_path.read().await.display().to_string();
            info!(path = %path_str, "Whisper model already on disk");
            return Ok(());
        }

        let model_name = self.model_name.read().await.clone();
        self.download_model(&model_name).await?;
        Ok(())
    }

    pub async fn start_server(&self) -> Result<(), String> {
        let mut process_guard = self.server_process.lock().await;
        if process_guard.is_some() {
            return Ok(()); // Already running
        }

        if !self.model_exists().await {
            self.ensure_model().await?;
        }

        let resolved_binary = self.runtime.whisper_server_binary(self.hardware.has_cuda);
        info!(
            path = %resolved_binary.path.display(),
            source = ?resolved_binary.source,
            exists = resolved_binary.path.exists(),
            "Resolved whisper-server path"
        );

        let path_str = self.model_path.read().await.to_str().unwrap().to_string();
        info!(path = %path_str, "Starting whisper-server with model");

        let mut command = Command::new(&resolved_binary.path);
        configure_tokio_command_for_binary(&mut command, &resolved_binary.path);

        let child = command
            .args([
                "-m",
                &path_str,
                "--port",
                &WHISPER_PORT.to_string(),
                "--host",
                "127.0.0.1",
            ])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| {
                format!(
                    "Failed to start whisper-server: {}. Path attempted: {}",
                    e,
                    resolved_binary.path.display()
                )
            })?;

        // Register with process manager if available
        if let Some(ref pm) = self.process_manager {
            if let Some(pid) = child.id() {
                let pm_clone = pm.clone();
                tokio::spawn(async move {
                    pm_clone
                        .register("whisper-server", "whisper-server", pid)
                        .await;
                });
            }
        }

        *process_guard = Some(child);

        // Give the server a moment to bind and load the model into VRAM
        let mut ready = false;
        for _ in 0..60 {
            // wait up to 30s
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            if tokio::net::TcpStream::connect(format!("127.0.0.1:{WHISPER_PORT}"))
                .await
                .is_ok()
            {
                ready = true;
                break;
            }
        }

        if !ready {
            // Clean up the dead child if it failed to bind
            if let Some(mut c) = process_guard.take() {
                let _ = c.kill().await;
            }
            return Err(format!(
                "whisper-server failed to bind to port {WHISPER_PORT} in time"
            ));
        }
        info!("whisper-server initialized");

        // Spawn watchdog if not already running
        if !self
            .watchdog_running
            .swap(true, std::sync::atomic::Ordering::SeqCst)
        {
            let process_mtx = self.server_process.clone();
            let runtime = self.runtime.clone();
            let model_path = self.model_path.clone();
            let process_manager = self.process_manager.clone();
            let has_cuda = self.hardware.has_cuda;

            tokio::spawn(async move {
                let mut fail_count = 0;
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

                    // Ping TCP
                    let is_healthy =
                        tokio::net::TcpStream::connect(format!("127.0.0.1:{WHISPER_PORT}"))
                            .await
                            .is_ok();

                    if is_healthy {
                        fail_count = 0;
                    } else {
                        fail_count += 1;
                        if fail_count >= 3 {
                            tracing::warn!(
                                "Whisper watchdog threshold reached! Restarting server..."
                            );
                            let mut guard = process_mtx.lock().await;

                            if let Some(mut child) = guard.take() {
                                let _ = child.kill().await;
                                if let Some(id) = child.id() {
                                    kill_pid_sync(id, "whisper-server");
                                }
                                if let Some(ref pm) = process_manager {
                                    pm.unregister("whisper-server").await;
                                }
                            }

                            // Respawn - use same binary resolution as start_server()
                            let resolved_binary = runtime.whisper_server_binary(has_cuda);
                            let mut command = tokio::process::Command::new(&resolved_binary.path);
                            configure_tokio_command_for_binary(&mut command, &resolved_binary.path);

                            if let Ok(new_child) = command
                                .args([
                                    "-m",
                                    model_path.read().await.to_str().unwrap(),
                                    "--port",
                                    &WHISPER_PORT.to_string(),
                                    "--host",
                                    "127.0.0.1",
                                ])
                                .stdout(std::process::Stdio::null())
                                .stderr(std::process::Stdio::null())
                                .spawn()
                            {
                                if let Some(ref pm) = process_manager {
                                    if let Some(pid) = new_child.id() {
                                        pm.register("whisper-server", "whisper-server", pid).await;
                                    }
                                }
                                *guard = Some(new_child);
                                fail_count = 0;
                                tracing::info!(
                                    "Whisper server successfully resurrected by watchdog"
                                );
                            }
                        }
                    }
                }
            });
        }

        Ok(())
    }

    /// Transcribe 16kHz mono f32 audio samples (range -1.0 to 1.0).
    pub async fn transcribe(
        &self,
        samples: Vec<f32>,
        requested_model: &str,
    ) -> Result<String, String> {
        // Check if model needs changing
        let mut current_model = self.model_name.write().await;
        if *current_model != requested_model {
            self.stop_server().await;

            *current_model = requested_model.to_string();
            let mut current_path = self.model_path.write().await;
            *current_path = self.runtime.whisper_model_path(requested_model);
        }
        drop(current_model);

        // Ensure the server is running
        {
            let process_guard = self.server_process.lock().await;
            if process_guard.is_none() {
                drop(process_guard);
                self.start_server().await?;
            }
        }

        // Generate a temporary WAV file path
        let temp_wav_path = self
            .runtime
            .temp_file_path(&format!("temp_{}.wav", Uuid::new_v4()));

        // Write WAV using hound
        {
            let spec = hound::WavSpec {
                channels: 1,
                sample_rate: 16000,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            };

            let mut writer = hound::WavWriter::create(&temp_wav_path, spec)
                .map_err(|e| format!("Failed to create WAV writer: {e}"))?;

            for &sample in &samples {
                let amplitude = sample * i16::MAX as f32;
                writer
                    .write_sample(amplitude as i16)
                    .map_err(|e| format!("Failed to write sample: {e}"))?;
            }
            writer
                .finalize()
                .map_err(|e| format!("Failed to finalize WAV: {e}"))?;
        }

        info!(path = %temp_wav_path.display(), "Saved temp audio, sending to whisper-server");

        // Read the WAV file contents
        let audio_data = std::fs::read(&temp_wav_path).map_err(|e| {
            std::fs::remove_file(&temp_wav_path).ok();
            format!("Failed to read temp WAV: {}", e)
        })?;

        // Clean up file immediately after reading
        std::fs::remove_file(&temp_wav_path).ok();

        // Prepare multipart form data
        let part = multipart::Part::bytes(audio_data)
            .file_name("audio.wav")
            .mime_str("audio/wav")
            .unwrap();

        let form = multipart::Form::new()
            .text("language", "en")
            .text("response_format", "json")
            .text("initial_prompt", "Zen, map, operational, aircraft, tracking, coordinates, weather, earthquakes, routing, terminate, system, radar, terminal, agent, OSINT, intelligence.")
            .part("file", part);

        // Send request to local whisper-server
        let client = reqwest::Client::new();
        let res = client
            .post(format!("http://127.0.0.1:{WHISPER_PORT}/inference"))
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("Failed to send request to whisper-server: {}", e))?;

        if !res.status().is_success() {
            return Err(format!(
                "whisper-server returned error status: {}",
                res.status()
            ));
        }

        let body: serde_json::Value = res
            .json()
            .await
            .map_err(|e| format!("Failed to parse whisper-server JSON: {}", e))?;

        // The exact structure of whisper-server JSON
        // Usually: { "text": " transcript here" }
        if let Some(text) = body.get("text").and_then(|v| v.as_str()) {
            let transcript = text.trim().to_string();

            if transcript.is_empty() {
                warn!("Whisper returned empty transcript");
            } else {
                info!(transcript = %transcript, "Transcription complete");
            }

            Ok(transcript)
        } else {
            Err("Failed to find 'text' field in whisper-server response".to_string())
        }
    }

    /// Kills the background whisper-server when the struct is dropped or manually called
    pub async fn stop_server(&self) {
        let mut process_guard = self.server_process.lock().await;
        if let Some(mut child) = process_guard.take() {
            info!("Stopping background whisper-server...");

            // Unregister from process manager
            if let Some(ref pm) = self.process_manager {
                pm.unregister("whisper-server").await;
            }

            let _ = child.kill().await;
        }
    }
}

impl Drop for SpeechService {
    fn drop(&mut self) {
        // Attempt synchronous kill if dropped
        if let Ok(mut process_guard) = self.server_process.try_lock() {
            if let Some(child) = process_guard.take() {
                if let Some(id) = child.id() {
                    // Unregister from process manager first
                    if let Some(ref pm) = self.process_manager {
                        let pm_clone = pm.clone();
                        // Can't await in Drop, so spawn
                        tokio::spawn(async move {
                            pm_clone.unregister("whisper-server").await;
                        });
                    }

                    kill_pid_sync(id, "whisper-server");
                }
            }
        }
    }
}

/// Convert 16-bit PCM bytes (little-endian) to f32 samples in [-1.0, 1.0].
pub fn pcm_i16_to_f32(pcm_bytes: &[u8]) -> Vec<f32> {
    pcm_bytes
        .chunks_exact(2)
        .map(|chunk| {
            let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
            sample as f32 / 32768.0
        })
        .collect()
}
