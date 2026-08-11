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

export interface InitPhase {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error" | "skipped";
  elapsed_ms?: number;
}

export interface InitStatus {
  phases: InitPhase[];
  critical_complete: boolean;
  /**
   * True when critical phases AND bg.orchestrator (the chat-essential
   * background service) are in a terminal state. This is the readiness
   * signal the splash UI gates on. Other bg.* phases (speech, tts,
   * lancedb, conversation_store, rag) are external/optional and may be
   * `error` without blocking the boot gate.
   */
  core_complete: boolean;
  /**
   * True when every bg.* phase is in a terminal state (done | skipped |
   * error). Informational only — used for status display, not for the
   * boot gate.
   */
  background_complete: boolean;
}

export const systemApi = {
  relaunchApp: () => callCommand<void>("relaunch_app", {}),
  openExternalPrompt: (operation: "reset" | "restore" | "restart") => callCommand<boolean>("open_external_prompt", { operation }),
  exportDiagnostics: (destination: string) => callCommand<void>("export_diagnostics", { destination }),
  getUserDisplayName: () => callCommand<string>("get_user_display_name", {}),
  getHardwareInfo: () => callCommand<HardwareInfo>("get_hardware_info", {}),
  getSystemMetrics: () => callCommand<BackendSystemMetrics>("get_system_metrics", {}),
  getInitStatus: () => callCommand<InitStatus>("get_init_status", {}),
  /**
   * Signal frontend or backend setup completion to the Rust handoff.
   * Rust performs the splash → main window transition only when BOTH
   * signals have arrived. Canonical Tauri v2 pattern — see
   * https://v2.tauri.app/learn/splashscreen/.
   */
  setComplete: (task: "frontend" | "backend") =>
    callCommand<void>("set_complete", { task }),
};
