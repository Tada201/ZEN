//! whisper-server subprocess lifecycle for [`SpeechService`]
//! (BIG_MIGRATION.md Phase 10 split — kept under the 700-line warn band).
//! Split-impl block; accesses the parent module's private fields.

use tokio::process::Command;
use tracing::{info, warn};

use super::{is_port_available, SpeechService, PORT_FALLBACK_RANGE, WHISPER_PORT};
use crate::runtime_resource::{configure_tokio_command_for_binary, kill_pid_sync};

impl SpeechService {

    pub async fn start_server(&self) -> Result<(), String> {
        let mut process_guard = self.server_process.lock().await;
        if process_guard.is_some() {
            return Ok(()); // Already running
        }

        if !self.model_exists().await {
            self.ensure_model().await?;
        }

        let resolved_binary = self.resolved_whisper_binary()?;
        info!(
            path = %resolved_binary.path.display(),
            source = ?resolved_binary.source,
            exists = resolved_binary.path.exists(),
            cuda_driver = self.hardware.has_cuda,
            cuda_backend = resolved_binary.path.to_string_lossy().contains("whisper-cublas"),
            "Resolved whisper-server path"
        );

        // Lossy is fine here: the path only feeds a log line.
        let path_str = self.model_path.read().await.to_string_lossy().to_string();
        info!(
            path = %path_str,
            cuda_driver = self.hardware.has_cuda,
            cuda_backend = resolved_binary.path.to_string_lossy().contains("whisper-cublas"),
            "Starting whisper-server with model"
        );

        let mut command = Command::new(&resolved_binary.path);
        configure_tokio_command_for_binary(&mut command, &resolved_binary.path);

        // Probe preferred port, then fall back through nearby ports if occupied.
        let mut bound_port: Option<u16> = None;
        for offset in 0..=PORT_FALLBACK_RANGE {
            let candidate = WHISPER_PORT.saturating_add(offset);
            if is_port_available(candidate).await {
                bound_port = Some(candidate);
                break;
            }
            warn!(
                port = candidate,
                "Port {} is occupied, trying next...", candidate
            );
        }
        let port = bound_port.ok_or_else(|| {
            format!(
                "All ports {}..{} are occupied — cannot start whisper-server",
                WHISPER_PORT,
                WHISPER_PORT + PORT_FALLBACK_RANGE
            )
        })?;
        *self.active_port.write().await = port;
        let port_str = port.to_string();
        command.args(["-m", &path_str, "--port", &port_str, "--host", "127.0.0.1"]);
        if let Some(device) = *self.gpu_device.read().await {
            command.args(["--gpu-device", &device.to_string()]);
        }

        let child = command
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
            if tokio::net::TcpStream::connect(format!("127.0.0.1:{port}"))
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
                "whisper-server failed to bind to port {port} in time"
            ));
        }
        info!(port = port, "whisper-server initialized");

        // Spawn watchdog if not already running
        if !self
            .watchdog_running
            .swap(true, std::sync::atomic::Ordering::SeqCst)
        {
            let process_mtx = self.server_process.clone();
            let runtime = self.runtime.clone();
            let model_path = self.model_path.clone();
            let gpu_device = self.gpu_device.clone();
            let active_port = self.active_port.clone();
            let process_manager = self.process_manager.clone();
            let has_cuda = self.hardware.has_cuda;
            let prefer_vulkan = self.prefers_vulkan();

            tokio::spawn(async move {
                let mut fail_count = 0;
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

                    // Ping the active port
                    let current_port = *active_port.read().await;
                    let is_healthy =
                        tokio::net::TcpStream::connect(format!("127.0.0.1:{current_port}"))
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

                            // Respawn - probe for an available port instead of
                            // blindly using the old one (it may have been taken
                            // by another process during the crash window).
                            let mut respawn_port: Option<u16> = None;
                            for offset in 0..=PORT_FALLBACK_RANGE {
                                let candidate = WHISPER_PORT.saturating_add(offset);
                                if is_port_available(candidate).await {
                                    respawn_port = Some(candidate);
                                    break;
                                }
                            }
                            let respawn_port = respawn_port.unwrap_or(WHISPER_PORT);
                            *active_port.write().await = respawn_port;

                            let Ok(resolved_binary) =
                                runtime.whisper_server_binary(has_cuda, prefer_vulkan)
                            else {
                                tracing::warn!("Whisper runtime unavailable; watchdog will wait for installation before respawning");
                                continue;
                            };
                            let mut command = tokio::process::Command::new(&resolved_binary.path);
                            configure_tokio_command_for_binary(&mut command, &resolved_binary.path);
                            let model = model_path.read().await;
                            let port_str = respawn_port.to_string();
                            // Pass the PathBuf directly — no UTF-8 assumption.
                            command.arg("-m").arg(&*model);
                            command.args([
                                "--port",
                                &port_str,
                                "--host",
                                "127.0.0.1",
                            ]);
                            if let Some(device) = *gpu_device.read().await {
                                command.args(["--gpu-device", &device.to_string()]);
                            }
                            drop(model);

                            if let Ok(new_child) = command
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
                                    port = respawn_port,
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
}
