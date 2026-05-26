use std::path::{Path, PathBuf};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone)]
pub struct RuntimeResources {
    app_data_dir: PathBuf,
    resource_dir: PathBuf,
}

#[derive(Debug, Clone)]
pub struct ResolvedBinary {
    pub path: PathBuf,
    pub source: RuntimeBinarySource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeBinarySource {
    Bundled,
    AppData,
    PathLookup,
}

impl RuntimeResources {
    pub fn new(app_data_dir: &Path, resource_dir: &Path) -> Self {
        Self {
            app_data_dir: app_data_dir.to_path_buf(),
            resource_dir: resource_dir.to_path_buf(),
        }
    }

    pub fn app_data_dir(&self) -> &Path {
        &self.app_data_dir
    }

    pub fn bundled_model_path(&self, model_name: &str) -> PathBuf {
        self.resource_dir
            .join("resources")
            .join("models")
            .join(model_name)
    }

    pub fn downloaded_model_path(&self, model_name: &str) -> PathBuf {
        self.app_data_dir.join("models").join(model_name)
    }

    pub fn whisper_model_path(&self, model_name: &str) -> PathBuf {
        let bundled = self.bundled_model_path(model_name);
        if bundled.exists() {
            bundled
        } else {
            self.downloaded_model_path(model_name)
        }
    }

    pub fn ensure_models_dir(&self) -> Result<PathBuf, std::io::Error> {
        let dir = self.app_data_dir.join("models");
        std::fs::create_dir_all(&dir)?;
        Ok(dir)
    }

    pub fn temp_file_path(&self, file_name: &str) -> PathBuf {
        self.app_data_dir.join(file_name)
    }

    pub fn atomic_write(&self, target_path: &Path, bytes: &[u8]) -> Result<(), String> {
        let temp_path = target_path.with_extension(format!(
            "{}.part",
            target_path
                .extension()
                .and_then(|ext| ext.to_str())
                .unwrap_or("tmp")
        ));

        std::fs::write(&temp_path, bytes)
            .map_err(|e| format!("Failed to write temporary file: {e}"))?;

        std::fs::rename(&temp_path, target_path).map_err(|e| {
            std::fs::remove_file(&temp_path).ok();
            format!("Failed to finalize file: {e}")
        })
    }

    pub fn whisper_server_binary(&self, has_cuda: bool) -> ResolvedBinary {
        let base_dir = self
            .resource_dir
            .join("resources")
            .join("binaries")
            .join("whisper");

        if has_cuda {
            let cublas = base_dir.join("whisper-cublas").join("whisper-server.exe");
            if cublas.exists() {
                return ResolvedBinary {
                    path: cublas,
                    source: RuntimeBinarySource::Bundled,
                };
            }
        }

        let bundled = base_dir.join("whisper-server.exe");
        if bundled.exists() {
            return ResolvedBinary {
                path: bundled,
                source: RuntimeBinarySource::Bundled,
            };
        }

        let app_data = self.app_data_dir.join("whisper-server.exe");
        if app_data.exists() {
            return ResolvedBinary {
                path: app_data,
                source: RuntimeBinarySource::AppData,
            };
        }

        ResolvedBinary {
            path: PathBuf::from("whisper-server"),
            source: RuntimeBinarySource::PathLookup,
        }
    }

    pub fn piper_binary(&self) -> ResolvedBinary {
        let bundled = self
            .resource_dir
            .join("resources")
            .join("binaries")
            .join("piper")
            .join("piper.exe");

        if bundled.exists() {
            return ResolvedBinary {
                path: bundled,
                source: RuntimeBinarySource::Bundled,
            };
        }

        ResolvedBinary {
            path: bundled,
            source: RuntimeBinarySource::Bundled,
        }
    }

    pub fn default_piper_model_path(&self) -> PathBuf {
        self.bundled_model_path("glados_piper_medium.onnx")
    }
}

pub fn configure_std_command_for_binary(command: &mut std::process::Command, binary_path: &Path) {
    if let Some(parent) = binary_path.parent() {
        if parent.exists() {
            command.current_dir(parent);
        }
    }

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
}

pub fn configure_tokio_command_for_binary(
    command: &mut tokio::process::Command,
    binary_path: &Path,
) {
    if let Some(parent) = binary_path.parent() {
        if parent.exists() {
            command.current_dir(parent);
        }
    }

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
}

pub fn kill_pid_sync(pid: u32, name: &str) {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("taskkill");
        cmd.creation_flags(CREATE_NO_WINDOW);
        match cmd.args(["/F", "/PID", &pid.to_string()]).status() {
            Ok(status) if status.success() => {
                tracing::info!(pid = %pid, name = %name, "Process killed via taskkill");
            }
            Ok(status) => {
                tracing::warn!(pid = %pid, name = %name, status = ?status, "taskkill failed");
            }
            Err(e) => {
                tracing::error!(pid = %pid, name = %name, error = %e, "Failed to execute taskkill");
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        use nix::sys::signal::{kill, Signal};
        use nix::unistd::Pid;

        match kill(Pid::from_raw(pid as i32), Signal::SIGKILL) {
            Ok(_) => tracing::info!(pid = %pid, name = %name, "Process killed via SIGKILL"),
            Err(e) => {
                tracing::error!(pid = %pid, name = %name, error = %e, "Failed to kill process")
            }
        }
    }
}
