use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::EnvFilter;

static LOG_GUARD: OnceLock<WorkerGuard> = OnceLock::new();

pub fn init_backend_logging(app_dir: &Path) -> Result<PathBuf, String> {
    let log_dir = app_dir.join("logs");
    std::fs::create_dir_all(&log_dir).map_err(|e| {
        format!(
            "failed to create log directory '{}': {}",
            log_dir.display(),
            e
        )
    })?;

    let file_appender = tracing_appender::rolling::daily(&log_dir, "zen-backend.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        EnvFilter::new(
            "zen=debug,tauri_app_lib=debug,sqlx=warn,hyper=warn,reqwest=warn,tower_http=warn",
        )
    });

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(non_blocking)
        .with_ansi(false)
        .with_target(true)
        .with_thread_ids(true)
        .with_line_number(true)
        .try_init()
        .map_err(|e| format!("failed to initialize tracing subscriber: {}", e))?;

    let _ = LOG_GUARD.set(guard);
    Ok(log_dir)
}
