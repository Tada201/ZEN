use crate::models::SystemMetrics;
use serde::{Deserialize, Serialize};
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GpuInfo {
    pub id: String,
    pub system_index: u32,
    pub backend_device_index: u32,
    pub name: String,
    pub vendor: String,
    pub vram_mb: Option<u64>,
    pub driver_version: Option<String>,
    pub cuda_capable: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub total_space: u64,
    pub available_space: u64,
    pub is_removable: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HardwareInfo {
    pub cpu: String,
    pub cores: usize,
    pub threads: usize,
    pub memory_gb: f64,
    pub os: String,
    pub hostname: String,
    pub has_cuda: bool,
    pub gpus: Vec<GpuInfo>,
    pub disks: Vec<DiskInfo>,
}

pub struct HardwareService {
    sys: System,
    has_cuda: bool,
}

impl HardwareService {
    pub fn new() -> Self {
        let has_cuda = detect_cuda_driver();

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
        let disks_list = sysinfo::Disks::new_with_refreshed_list();
        let disks = disks_list
            .iter()
            .map(|d| DiskInfo {
                name: d.name().to_string_lossy().to_string(),
                mount_point: d.mount_point().to_string_lossy().to_string(),
                total_space: d.total_space(),
                available_space: d.available_space(),
                is_removable: d.is_removable(),
            })
            .collect();

        HardwareInfo {
            cpu: self
                .sys
                .cpus()
                .first()
                .map(|c| c.brand().to_string())
                .unwrap_or_else(|| "Unknown".to_string()),
            cores: System::physical_core_count().unwrap_or(0),
            threads: self.sys.cpus().len(),
            memory_gb: (self.sys.total_memory() as f64) / (1024.0 * 1024.0 * 1024.0),
            os: System::long_os_version().unwrap_or_else(|| "Unknown".to_string()),
            hostname: System::host_name().unwrap_or_else(|| "Unknown".to_string()),
            has_cuda: self.has_cuda,
            gpus: detect_gpus(self.has_cuda),
            disks,
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

impl Default for HardwareService {
    fn default() -> Self {
        Self::new()
    }
}

fn detect_cuda_driver() -> bool {
    #[cfg(target_os = "windows")]
    {
        std::path::Path::new("C:\\Windows\\System32\\nvcuda.dll").exists()
            || std::path::Path::new("C:\\Windows\\SysWOW64\\nvcuda.dll").exists()
    }

    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("nvidia-smi")
            .arg("--query-gpu=name")
            .arg("--format=csv,noheader")
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    }
}

fn gpu_vendor(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.contains("nvidia")
        || lower.contains("geforce")
        || lower.contains("quadro")
        || lower.contains("rtx")
    {
        "NVIDIA".to_string()
    } else if lower.contains("amd") || lower.contains("radeon") {
        "AMD".to_string()
    } else if lower.contains("intel") || lower.contains("iris") || lower.contains("uhd") {
        "Intel".to_string()
    } else if lower.contains("apple") {
        "Apple".to_string()
    } else {
        "Unknown".to_string()
    }
}

#[cfg(target_os = "windows")]
fn detect_gpus(has_cuda: bool) -> Vec<GpuInfo> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let script = "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion,PNPDeviceID | ConvertTo-Json -Compress";
    let output = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    let Ok(output) = output else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value =
        serde_json::from_str(stdout.trim()).unwrap_or(serde_json::Value::Null);
    let controllers: Vec<serde_json::Value> = if let Some(items) = parsed.as_array() {
        items.clone()
    } else if parsed.is_object() {
        vec![parsed]
    } else {
        Vec::new()
    };

    let mut nvidia_index = 0_u32;
    let mut vulkan_index = 0_u32;
    controllers
        .into_iter()
        .enumerate()
        .filter_map(|(system_index, item)| {
            let name = item.get("Name")?.as_str()?.trim().to_string();
            if name.is_empty() {
                return None;
            }
            let vendor = gpu_vendor(&name);
            let pnp = item
                .get("PNPDeviceID")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_lowercase();
            let vram_mb = item
                .get("AdapterRAM")
                .and_then(|v| v.as_u64())
                .filter(|bytes| *bytes > 0)
                .map(|bytes| bytes / 1024 / 1024);
            let driver_version = item
                .get("DriverVersion")
                .and_then(|v| v.as_str())
                .filter(|value| !value.trim().is_empty())
                .map(|value| value.to_string());
            let cuda_capable = has_cuda && (vendor == "NVIDIA" || pnp.contains("ven_10de"));
            let backend_device_index = if vendor == "NVIDIA" {
                let index = nvidia_index;
                nvidia_index += 1;
                index
            } else {
                let index = vulkan_index;
                vulkan_index += 1;
                index
            };

            Some(GpuInfo {
                id: if pnp.is_empty() {
                    format!("gpu-{system_index}")
                } else {
                    pnp
                },
                system_index: system_index as u32,
                backend_device_index,
                name,
                vendor,
                vram_mb,
                driver_version,
                cuda_capable,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::GpuInfo;
    use serde_json::json;

    #[test]
    fn gpu_info_serializes_required_identity_fields() {
        let gpu = GpuInfo {
            id: "gpu-0".to_string(),
            system_index: 0,
            backend_device_index: 0,
            name: "NVIDIA Test GPU".to_string(),
            vendor: "NVIDIA".to_string(),
            vram_mb: Some(4096),
            driver_version: Some("1.2.3".to_string()),
            cuda_capable: true,
        };

        let value = serde_json::to_value(&gpu).expect("gpu should serialize");
        assert_eq!(value["id"], json!("gpu-0"));
        assert_eq!(value["system_index"], json!(0));
        assert_eq!(value["backend_device_index"], json!(0));
    }

    #[test]
    fn hardware_gpu_identity_fields_are_present_for_detected_gpus() {
        for (expected_index, gpu) in super::detect_gpus(super::detect_cuda_driver())
            .iter()
            .enumerate()
        {
            assert!(!gpu.id.trim().is_empty());
            assert_eq!(gpu.system_index, expected_index as u32);
            assert!(serde_json::to_value(gpu)
                .expect("gpu should serialize")
                .get("backend_device_index")
                .is_some());
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn detect_gpus(has_cuda: bool) -> Vec<GpuInfo> {
    let output = std::process::Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,memory.total,driver_version",
            "--format=csv,noheader,nounits",
        ])
        .output();

    let Ok(output) = output else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .enumerate()
        .filter_map(|(index, line)| {
            let parts: Vec<&str> = line.split(',').map(str::trim).collect();
            let name = parts.first()?.to_string();
            if name.is_empty() {
                return None;
            }
            Some(GpuInfo {
                id: format!("gpu-{index}"),
                system_index: index as u32,
                backend_device_index: index as u32,
                vendor: gpu_vendor(&name),
                name,
                vram_mb: parts.get(1).and_then(|value| value.parse::<u64>().ok()),
                driver_version: parts
                    .get(2)
                    .map(|value| value.to_string())
                    .filter(|value| !value.is_empty()),
                cuda_capable: has_cuda,
            })
        })
        .collect()
}
