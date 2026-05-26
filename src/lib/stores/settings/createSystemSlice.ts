import type { StateCreator } from "zustand";
import type { SettingsState, PerformanceProfile, PowerStatus } from "./types";
import { systemApi } from "@/api";

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
  // Workspace security
  workspaceConfirmWrites: boolean;
  workspaceAllowExternalPaths: boolean;
  workspaceMaxFileSize: number;
  workspaceAutoStage: boolean;
  workspaceCommitConfirmation: boolean;
  // Terminal extended
  terminalWorkingDir: string;
  terminalScrollback: number;
  terminalConfirmCommands: boolean;
  terminalAutoExecute: boolean;
  terminalShellIntegration: boolean;
  terminalEnvVars: boolean;
  // System performance extended
  systemMaxCpuThreads: number;
  // Tool permissions (global)
  toolYoloMode: boolean;
  toolAutoApproveLowRisk: boolean;
  toolGlobalDefault: "confirm" | "always_allow" | "always_deny";
  toolSettings: Record<string, any>;

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
  workspaceConfirmWrites: false,
  workspaceAllowExternalPaths: false,
  workspaceMaxFileSize: 10,
  workspaceAutoStage: false,
  workspaceCommitConfirmation: true,
  terminalWorkingDir: "",
  terminalScrollback: 5000,
  terminalConfirmCommands: true,
  terminalAutoExecute: false,
  terminalShellIntegration: true,
  terminalEnvVars: false,
  systemMaxCpuThreads: 8,
  toolYoloMode: false,
  toolAutoApproveLowRisk: false,
  toolGlobalDefault: "confirm",
  toolSettings: {},

  setPerformanceProfile: (profile: PerformanceProfile) => {
    get().updateSetting("performanceProfile", profile);
  },

  fetchHardwareInfo: async () => {
    try {
      const info = await systemApi.getHardwareInfo();
      set({
        hardwareInfo: {
          cpu: info.cpu,
          memory: `${info.memory_gb} GB`,
          gpu: info.has_cuda ? "CUDA available" : undefined,
          vendor: info.os,
        },
      });
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
