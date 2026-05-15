import type { StateCreator } from "zustand";
import type { SettingsState, PerformanceProfile, PowerStatus } from "./types";

export interface SystemSlice {
  performanceProfile: PerformanceProfile;
  performanceAutoDetect: boolean;
  cesiumFpsCap: number;
  spaceFpsCap: number;
  animationFpsCap: number;
  mathFpsCap: number;
  metricsPollingInterval: number;
  telemetryEnabled: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
  mapProvider: string;
  weatherApiKey: string;
  terminalShell: string;
  terminalFontSize: number;
  gpuAcceleration: boolean;
  maxMemoryAllocation: number;
  sandboxEnabled: boolean;
  maxExecutionTime: number;
  defaultShell: string;
  shellArgs: string;
  dataDirectory: string;
  autoBackup: boolean;
  agentLoggingEnabled: boolean;
  agentMemoryLimit: number;
  multiAgentEnabled: boolean;
  agentTimeout: number;
  autoCheckEnabled: boolean;
  checkBeta: boolean;
  powerStatus: PowerStatus;
  availableNetworkInterfaces: string[];
  backgroundTasksEnabled: boolean;
  hardwareInfo: {
    cpu: string;
    memory: string;
    gpu?: string;
    vendor?: string;
  } | null;

  setPerformanceProfile: (profile: PerformanceProfile) => void;
  fetchHardwareInfo: () => Promise<void>;
  applyPowerStatus: (status: Partial<PowerStatus>) => void;
}

export const createSystemSlice: StateCreator<SettingsState, [], [], SystemSlice> = (set, get) => ({
  performanceProfile: "balanced",
  performanceAutoDetect: true,
  cesiumFpsCap: 60,
  spaceFpsCap: 60,
  animationFpsCap: 60,
  mathFpsCap: 60,
  metricsPollingInterval: 2000,
  telemetryEnabled: true,
  logLevel: "info",
  mapProvider: "cesium",
  weatherApiKey: "",
  terminalShell: "",
  terminalFontSize: 14,
  gpuAcceleration: true,
  maxMemoryAllocation: 8192,
  sandboxEnabled: true,
  maxExecutionTime: 30,
  defaultShell: "powershell",
  shellArgs: "",
  dataDirectory: "",
  autoBackup: false,
  agentLoggingEnabled: true,
  agentMemoryLimit: 512,
  multiAgentEnabled: false,
  agentTimeout: 120,
  autoCheckEnabled: true,
  checkBeta: false,
  powerStatus: {
    isLaptop: false,
    powerPlan: "balanced",
    batteryLevel: null,
    isCharging: null,
  },
  availableNetworkInterfaces: [],
  backgroundTasksEnabled: true,
  hardwareInfo: null,

  setPerformanceProfile: (profile: PerformanceProfile) => {
    get().updateSetting("performanceProfile", profile);
  },

  fetchHardwareInfo: async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const info = await invoke<{ cpu: string; memory: string; gpu?: string; vendor?: string }>("get_hardware_info");
      set({ hardwareInfo: info });
    } catch {
      // Tauri backend not available — skip
    }
  },

  applyPowerStatus: (status: Partial<PowerStatus>) => {
    const { powerStatus, updateSetting } = get();
    const newStatus = { ...powerStatus, ...status };
    updateSetting("powerStatus", newStatus);

    // Auto-switch performance profile based on power
    if (get().performanceAutoDetect && !newStatus.isCharging) {
      if (newStatus.batteryLevel !== null && newStatus.batteryLevel < 0.2) {
        updateSetting("performanceProfile", "powersaver");
      } else if (!newStatus.isCharging) {
        updateSetting("performanceProfile", "balanced");
      } else {
        updateSetting("performanceProfile", "max");
      }
    }
  },
});
