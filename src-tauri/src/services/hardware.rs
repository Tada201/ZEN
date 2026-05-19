use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};
use crate::models::SystemMetrics;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HardwareInfo {
    pub cpu: String,
    pub cores: usize,
    pub threads: usize,
    pub memory_gb: f64,
    pub os: String,
    pub hostname: String,
    pub has_cuda: bool,
}

pub struct HardwareService {
    sys: System,
    has_cuda: bool,
}

impl HardwareService {
    pub fn new() -> Self {
        // Simple CUDA check (could be improved by checking with a crate or searching for nvml)
        let has_cuda = std::path::Path::new("C:\\Windows\\System32\\nvcuda.dll").exists();

        Self {
            sys: System::new_with_specifics(
                RefreshKind::nothing()
                    .with_cpu(CpuRefreshKind::everything())
                    .with_memory(MemoryRefreshKind::everything()),
            ),
            has_cuda,
        }
    }

    pub fn get_info(&self) -> HardwareInfo {
        HardwareInfo {
            cpu: self.sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_else(|| "Unknown".to_string()),
            cores: self.sys.physical_core_count().unwrap_or(0),
            threads: self.sys.cpus().len(),
            memory_gb: (self.sys.total_memory() as f64) / (1024.0 * 1024.0 * 1024.0),
            os: System::long_os_version().unwrap_or_else(|| "Unknown".to_string()),
            hostname: System::host_name().unwrap_or_else(|| "Unknown".to_string()),
            has_cuda: self.has_cuda,
        }
    }

    pub fn get_metrics(&mut self) -> SystemMetrics {
        self.sys.refresh_all();
        
        let cpu_load = self.sys.global_cpu_usage();
        let mem_used = self.sys.used_memory();
        let mem_total = self.sys.total_memory();
        
        SystemMetrics {
            cpu_load,
            mem_used,
            mem_total,
            net_up: 0.0,
            net_down: 0.0,
        }
    }
}
