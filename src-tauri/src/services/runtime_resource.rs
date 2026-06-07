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

    pub fn whisper_cuda_server_path(&self) -> PathBuf {
        self.resource_dir
            .join("resources")
            .join("binaries")
            .join("whisper")
            .join("whisper-cublas")
            .join("whisper-server.exe")
    }

    pub fn whisper_app_data_cuda_server_path(&self) -> PathBuf {
        self.app_data_dir
            .join("binaries")
            .join("whisper")
            .join("whisper-cublas")
            .join("whisper-server.exe")
    }

    pub fn whisper_vulkan_server_path(&self) -> PathBuf {
        self.resource_dir
            .join("resources")
            .join("binaries")
            .join("whisper")
            .join("whisper-vulkan")
            .join("whisper-server.exe")
    }

    pub fn whisper_app_data_vulkan_server_path(&self) -> PathBuf {
        self.app_data_dir
            .join("binaries")
            .join("whisper")
            .join("whisper-vulkan")
            .join("whisper-server.exe")
    }

    pub fn remove_downloaded_model(&self, model_name: &str) -> Result<(), String> {
        let path = self.downloaded_model_path(model_name);
        match std::fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!(
                "Failed to remove downloaded model '{}': {e}",
                path.display()
            )),
        }
    }

    pub fn read_and_remove_temp_file(&self, path: &Path) -> Result<Vec<u8>, String> {
        let data = std::fs::read(path).map_err(|e| {
            std::fs::remove_file(path).ok();
            format!("Failed to read temporary file '{}': {e}", path.display())
        })?;
        std::fs::remove_file(path)
            .map_err(|e| format!("Failed to remove temporary file '{}': {e}", path.display()))?;
        Ok(data)
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

    pub fn whisper_server_binary(&self, has_cuda: bool, prefer_vulkan: bool) -> ResolvedBinary {
        let base_dir = self
            .resource_dir
            .join("resources")
            .join("binaries")
            .join("whisper");

        if has_cuda {
            let cublas = self.whisper_cuda_server_path();
            if cublas.exists() {
                return ResolvedBinary {
                    path: cublas,
                    source: RuntimeBinarySource::Bundled,
                };
            }

            let app_data_cublas = self.whisper_app_data_cuda_server_path();
            if app_data_cublas.exists() {
                return ResolvedBinary {
                    path: app_data_cublas,
                    source: RuntimeBinarySource::AppData,
                };
            }
        }

        if prefer_vulkan {
            let vulkan = self.whisper_vulkan_server_path();
            if vulkan.exists() {
                return ResolvedBinary {
                    path: vulkan,
                    source: RuntimeBinarySource::Bundled,
                };
            }

            let app_data_vulkan = self.whisper_app_data_vulkan_server_path();
            if app_data_vulkan.exists() {
                return ResolvedBinary {
                    path: app_data_vulkan,
                    source: RuntimeBinarySource::AppData,
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDirs {
        root: PathBuf,
        app_data: PathBuf,
        resources: PathBuf,
    }

    impl TestDirs {
        fn new(name: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock should be after UNIX_EPOCH")
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "zen-runtime-resource-{name}-{}-{unique}",
                std::process::id()
            ));
            let app_data = root.join("app-data");
            let resources = root.join("resources-root");

            fs::create_dir_all(&app_data).expect("create test app data dir");
            fs::create_dir_all(&resources).expect("create test resource dir");

            Self {
                root,
                app_data,
                resources,
            }
        }

        fn runtime_resources(&self) -> RuntimeResources {
            RuntimeResources::new(&self.app_data, &self.resources)
        }
    }

    impl Drop for TestDirs {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn resolves_model_paths_under_resource_and_app_data_roots() {
        let dirs = TestDirs::new("model-paths");
        let resources = dirs.runtime_resources();

        assert_eq!(resources.app_data_dir(), dirs.app_data.as_path());
        assert_eq!(
            resources.bundled_model_path("ggml-base.bin"),
            dirs.resources
                .join("resources")
                .join("models")
                .join("ggml-base.bin")
        );
        assert_eq!(
            resources.downloaded_model_path("ggml-base.bin"),
            dirs.app_data.join("models").join("ggml-base.bin")
        );
        assert_eq!(
            resources.temp_file_path("capture.wav"),
            dirs.app_data.join("capture.wav")
        );
    }

    #[test]
    fn whisper_model_path_prefers_bundled_model_when_present() {
        let dirs = TestDirs::new("whisper-bundled");
        let resources = dirs.runtime_resources();
        let bundled = resources.bundled_model_path("tiny.en.bin");

        fs::create_dir_all(bundled.parent().expect("bundled model has parent"))
            .expect("create bundled model parent");
        fs::write(&bundled, b"bundled").expect("write bundled model");

        assert_eq!(resources.whisper_model_path("tiny.en.bin"), bundled);
    }

    #[test]
    fn whisper_model_path_falls_back_to_downloaded_model_path() {
        let dirs = TestDirs::new("whisper-downloaded");
        let resources = dirs.runtime_resources();

        assert_eq!(
            resources.whisper_model_path("tiny.en.bin"),
            resources.downloaded_model_path("tiny.en.bin")
        );
    }

    #[test]
    fn ensure_models_dir_creates_app_data_models_directory() {
        let dirs = TestDirs::new("ensure-models");
        let resources = dirs.runtime_resources();

        let models_dir = resources
            .ensure_models_dir()
            .expect("ensure models dir should succeed");

        assert_eq!(models_dir, dirs.app_data.join("models"));
        assert!(models_dir.is_dir());
    }

    #[test]
    fn atomic_write_writes_bytes_via_part_file_and_removes_it() {
        let dirs = TestDirs::new("atomic-write");
        let resources = dirs.runtime_resources();
        let target = dirs.app_data.join("voice.onnx");
        let part = target.with_extension("onnx.part");

        resources
            .atomic_write(&target, b"model-bytes")
            .expect("atomic write should succeed");

        assert_eq!(fs::read(&target).expect("read target"), b"model-bytes");
        assert!(!part.exists(), "temporary part file should be renamed away");
    }

    #[test]
    fn atomic_write_replaces_existing_file() {
        let dirs = TestDirs::new("atomic-replace");
        let resources = dirs.runtime_resources();
        let target = dirs.app_data.join("voice.onnx");

        fs::write(&target, b"old").expect("write existing target");

        resources
            .atomic_write(&target, b"new")
            .expect("atomic write should replace existing file");

        assert_eq!(fs::read(&target).expect("read replaced target"), b"new");
    }

    #[test]
    fn atomic_write_cleans_part_file_when_finalize_fails() {
        let dirs = TestDirs::new("atomic-cleanup");
        let resources = dirs.runtime_resources();
        let target = dirs.app_data.join("blocked.onnx");
        let part = target.with_extension("onnx.part");

        fs::create_dir(&target).expect("create directory at target path");

        let error = resources
            .atomic_write(&target, b"cannot-finalize")
            .expect_err("finalize should fail when target is a directory");

        assert!(error.contains("Failed to finalize file"));
        assert!(!part.exists(), "temporary part file should be cleaned up");
        assert!(target.is_dir(), "existing target directory should remain");
    }

    #[test]
    fn remove_downloaded_model_removes_file_and_tolerates_missing_file() {
        let dirs = TestDirs::new("remove-downloaded-model");
        let resources = dirs.runtime_resources();
        let model_path = resources.downloaded_model_path("tiny.en.bin");

        fs::create_dir_all(model_path.parent().expect("model path has parent"))
            .expect("create model parent");
        fs::write(&model_path, b"bad-model").expect("write downloaded model");

        resources
            .remove_downloaded_model("tiny.en.bin")
            .expect("remove downloaded model");
        assert!(!model_path.exists());

        resources
            .remove_downloaded_model("tiny.en.bin")
            .expect("missing model removal should be idempotent");
    }

    #[test]
    fn read_and_remove_temp_file_returns_bytes_and_deletes_file() {
        let dirs = TestDirs::new("read-remove-temp");
        let resources = dirs.runtime_resources();
        let temp = resources.temp_file_path("capture.wav");

        fs::write(&temp, b"wav-bytes").expect("write temp audio");
        let bytes = resources
            .read_and_remove_temp_file(&temp)
            .expect("read and remove temp file");

        assert_eq!(bytes, b"wav-bytes");
        assert!(!temp.exists());
    }

    #[test]
    fn read_and_remove_temp_file_reports_missing_temp_file() {
        let dirs = TestDirs::new("read-missing-temp");
        let resources = dirs.runtime_resources();
        let temp = resources.temp_file_path("missing.wav");

        let error = resources
            .read_and_remove_temp_file(&temp)
            .expect_err("missing temp file should fail");

        assert!(error.contains("Failed to read temporary file"));
        assert!(!temp.exists());
    }
}
