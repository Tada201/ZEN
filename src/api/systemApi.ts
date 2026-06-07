import { callCommand } from "./tauriClient";

export interface HardwareInfo {
  cpu: string;
  cores: number;
  threads: number;
  memory_gb: number;
  os: string;
  hostname: string;
  has_cuda: boolean;
  gpus: Array<{
    id: string;
    system_index: number;
    backend_device_index: number;
    name: string;
    vendor: string;
    vram_mb?: number | null;
    driver_version?: string | null;
    cuda_capable: boolean;
  }>;
  disks: Array<{
    name: string;
    mount_point: string;
    total_space: number;
    available_space: number;
    is_removable: boolean;
  }>;
}

export interface BackendSystemMetrics {
  cpu_load: number;
  mem_used: number;
  mem_total: number;
  net_up: number;
  net_down: number;
}

export const systemApi = {
  getHardwareInfo: () => callCommand<HardwareInfo>("get_hardware_info", {}),
  getSystemMetrics: () => callCommand<BackendSystemMetrics>("get_system_metrics", {}),
};
