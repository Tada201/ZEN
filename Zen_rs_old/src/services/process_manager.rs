use std::collections::HashMap;
use tokio::sync::RwLock;
use tracing::{error, info, warn};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Tracks a spawned child process that needs cleanup on app exit
pub struct TrackedProcess {
    pub name: String,
    pub pid: u32,
}

/// Centralized process manager for tracking and cleaning up all subprocesses on app exit
pub struct ProcessManager {
    /// Map of process ID to tracked process info
    processes: RwLock<HashMap<String, TrackedProcess>>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            processes: RwLock::new(HashMap::new()),
        }
    }

    /// Register a process for cleanup tracking
    pub async fn register(&self, id: &str, name: &str, pid: u32) {
        let mut processes = self.processes.write().await;
        processes.insert(
            id.to_string(),
            TrackedProcess {
                name: name.to_string(),
                pid,
            },
        );
        info!(id = %id, name = %name, pid = %pid, "Process registered for cleanup");
    }

    /// Unregister a process when it exits naturally
    pub async fn unregister(&self, id: &str) {
        let mut processes = self.processes.write().await;
        if let Some(proc) = processes.remove(id) {
            info!(id = %id, name = %proc.name, "Process unregistered (exited naturally)");
        }
    }

    /// Kill a specific tracked process
    pub async fn kill_process(&self, id: &str) -> bool {
        let mut processes = self.processes.write().await;
        if let Some(proc) = processes.remove(id) {
            if proc.pid == 0 {
                warn!(id = %id, name = %proc.name, "Tracked process has no PID; caller must use its local fallback");
                return false;
            }
            Self::kill_by_pid(proc.pid, &proc.name).await;
            return true;
        }
        false
    }

    /// Kill a process by PID
    pub async fn kill_by_pid(pid: u32, name: &str) {
        #[cfg(target_os = "windows")]
        {
            let mut cmd = std::process::Command::new("taskkill");
            cmd.creation_flags(CREATE_NO_WINDOW);
            // `/T` is required for terminal and compiler children. Killing
            // only the shell leaves descendant processes running after Zen exits.
            cmd.args(["/F", "/T", "/PID", &pid.to_string()]);

            match cmd.status() {
                Ok(status) if status.success() => {
                    info!(pid = %pid, name = %name, "Process killed via taskkill");
                }
                Ok(status) => {
                    warn!(pid = %pid, name = %name, status = ?status, "taskkill failed");
                }
                Err(e) => {
                    error!(pid = %pid, name = %name, error = %e, "Failed to execute taskkill");
                }
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            use nix::sys::signal::{kill, Signal};
            use nix::unistd::Pid;

            match kill(Pid::from_raw(pid as i32), Signal::SIGKILL) {
                Ok(_) => {
                    info!(pid = %pid, name = %name, "Process killed via SIGKILL");
                }
                Err(e) => {
                    error!(pid = %pid, name = %name, error = %e, "Failed to kill process");
                }
            }
        }
    }

    /// Kill all tracked processes - call this on app exit
    pub async fn kill_all(&self) {
        let processes: Vec<_> = {
            let guard = self.processes.read().await;
            guard
                .iter()
                .map(|(id, proc)| (id.clone(), proc.pid, proc.name.clone()))
                .collect()
        };

        if processes.is_empty() {
            info!("No processes to clean up");
            return;
        }

        info!("Cleaning up {} tracked process(es)...", processes.len());

        // Kill all processes concurrently
        let futures: Vec<_> = processes
            .into_iter()
            .map(|(id, pid, name)| async move {
                Self::kill_by_pid(pid, &name).await;
                (id, pid, name)
            })
            .collect();

        for (id, pid, name) in futures::future::join_all(futures).await {
            info!(id = %id, pid = %pid, name = %name, "Process cleanup complete");
        }

        // Clear the map
        let mut guard = self.processes.write().await;
        guard.clear();

        info!("All process cleanup complete");
    }

    /// Get count of tracked processes (for debugging)
    pub async fn count(&self) -> usize {
        self.processes.read().await.len()
    }
}

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

impl Default for ProcessManager {
    fn default() -> Self {
        Self::new()
    }
}
