import type { AgentConfig, IntelligenceConfig } from "../../../components/settings/types";

// ─── Performance ─────────────────────────────────────────────────────────

export type PerformanceProfile = "max" | "balanced" | "powersaver";

export interface PowerStatus {
  isLaptop: boolean;
  powerPlan: "performance" | "balanced" | "powersaver";
  batteryLevel: number | null;
  isCharging: boolean | null;
}

// ─── Widget Settings ──────────────────────────────────────────────────────

export interface WidgetSettings {
  enabled: string[];
  order: string[];
  sizes: Record<string, "small" | "medium" | "large">;
}

export const DEFAULT_WIDGET_SETTINGS: WidgetSettings = {
  enabled: ["clock", "cpu", "memory"],
  order: ["clock", "cpu", "memory"],
  sizes: {},
};

// ─── Provider Configs ─────────────────────────────────────────────────────

export interface CustomProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  enabled: boolean;
  headers?: Record<string, string>;
}

// ─── Slice Interfaces ─────────────────────────────────────────────────────

export interface AppSlice {
  isHydrated: boolean;
  isDirty: boolean;
  isSyncing: boolean;
  activeSettings: Partial<SettingsState>;
  workspacePath: string;
  hooks: Record<string, boolean>;
  skills: Record<string, boolean>;
  commands: Record<string, string>;

  updateSetting: (<K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void) & ((updates: Partial<SettingsState>) => void);
  batchUpdate: (updates: Partial<SettingsState>) => void;
  seedSettings: (settings: Partial<SettingsState>) => void;
  applyChanges: () => Promise<{ syncFailed: boolean }>;
  /**
   * Hydrate settings from the Tauri SQLite backend.
   * Called once after localStorage rehydration to ensure SQLite values
   * (the authoritative copy) override any stale localStorage data.
   * Silently fails if the backend is unavailable (dev mode without Tauri).
   */
  hydrateFromBackend: () => Promise<void>;
  discardChanges: () => void;
}

export interface InterfaceSlice {
  themeId: string;
  customThemeSource: string;
  animationsEnabled: boolean;
  lowResourceMode: boolean;
  bootEnabled: boolean;
  bootDuration: number;
  bootDurationMs: number;
  widgetSettings: WidgetSettings;
  reducedMotion: boolean;
  customCssPath: string;
  customCssEnabled: boolean;
  sidebarPosition: "left" | "right";
  activityBarStyle: "icons" | "icons-text";

  setAnimationsEnabled: (enabled: boolean) => void;
  setLowResourceMode: (enabled: boolean) => void;

  handleWidgetToggle: (widgetId: string) => void;
  handleWidgetReorder: (widgetId: string, direction: "up" | "down") => void;
  handleWidgetReset: () => void;
}

export interface AudioSlice {
  ttsEnabled: boolean;
  ttsEngine: "piper" | "web" | "system";
  sttEnabled: boolean;
  sttEngine: "whisper" | "web";
  sttWhisperModel: string;
  webTtsVoiceURI: string;
  webTtsRate: number;
  webTtsPitch: number;
  soundVolume: number;
  micVolume: number;
  speakerVolume: number;
  audioFeedbackEnabled: boolean;
  micDeviceId: string;
  speakerDeviceId: string;
  hapticFeedbackEnabled: boolean;
  voiceInputMode: boolean;
  notificationSounds: boolean;
  vadEnabled: boolean;
  sttHotkeysEnabled: boolean;
  masterVolume: number;
  isMuted: boolean;
  webTtsVoice: string;
  sttModel: string;
  selectedMic: string;
  systemSoundsEnabled: boolean;

  setForceSttWeb: (val: boolean) => void;
  setForceTtsWeb: (val: boolean) => void;
}

export interface AiSlice {
  activeProvider: string;
  activeModel: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  reasoningEnabled: boolean;
  reasoningEffort: "low" | "medium" | "high";
  streamingEnabled: boolean;
  streamSpeed: number;
  thinkingMode: boolean;
  promptCaching: boolean;
  enablePromptCaching: boolean;
  ragEnabled: boolean;
  citationsEnabled: boolean;
  strictGrounding: boolean;
  searchStrategy: "hybrid" | "vector" | "keyword" | "semantic" | "disabled";
  topK: number;
  embeddingProvider: string;
  streamingSpeed: "instant" | "typewriter";
  structuredResponseEnabled: boolean;
  selectedSchemaId: string;
  toolsEnabled: boolean;
  streamResponses: boolean;
  gpuAcceleration: boolean;
  thinkingBudget: number;
  personalityPreset: string;
  voiceInstructions: string;
  autoCheckEnabled: boolean;
  checkBeta: boolean;
  minScore: number;
  maxMessagesInMemory: number;
  messageRetentionThreshold: number;
  pinLimit: number;
  chatPlugins: Record<string, boolean>;

  switchModel: (provider: string, model?: string) => Promise<void>;
  toggleChatPlugin: (pluginId: string) => void;
}

export interface ProviderConnectionStatus {
  status: string;
  latency?: number;
  error?: string | null;
}

export interface ProviderSlice {
  // API Keys
  openaiApiKey: string;
  anthropicApiKey: string;
  googleApiKey: string;
  groqApiKey: string;
  mistralApiKey: string;
  deepseekApiKey: string;
  openrouterApiKey: string;
  togetherApiKey: string;
  perplexityApiKey: string;
  // Additional API keys
  geminiApiKey: string;
  qwenApiKey: string;
  xaiApiKey: string;
  kilocodeApiKey: string;
  // Local providers
  ollamaBaseUrl: string;
  lmstudioBaseUrl: string;
  // Custom providers
  customProviders: CustomProviderConfig[];
  // Agent configs
  agentConfigs: AgentConfig[];
  // Tool settings
  toolSettings: Record<string, boolean>;
  toolAutoApprove: string[];
  // Model discovery
  availableModels: Array<{ id: string; name: string; provider: string; contextWindow?: number }>;
  availableModelsByProvider: Record<string, string[]>;
  fetchingModels: boolean;
  connectionStatuses: Record<string, ProviderConnectionStatus>;

  fetchModels: () => Promise<void>;
  testProviderConnection: (provider: string, baseUrl?: string, apiKey?: string) => Promise<boolean>;
  addCustomProvider: (config: CustomProviderConfig) => void;
  removeCustomProvider: (id: string) => void;
  toggleCustomProvider: (id: string) => void;
  updateCustomProvider: (id: string, config: Partial<CustomProviderConfig>) => void;
  setConnectionStatus: (provider: string, status: { status: string; latency?: number; error?: string }) => void;
  setAvailableModels: (models: Array<{ id: string; name: string; provider: string; contextWindow?: number }>) => void;
}

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

// ─── Intelligence Config ──────────────────────────────────────────────────

export interface IntelligenceSlice {
  intelligenceConfig: IntelligenceConfig;
  embeddingModel: string;
  chunkSize: number;
  chunkOverlap: number;
}

// ─── Combined Settings State ──────────────────────────────────────────────

export type SettingsState = AppSlice &
  InterfaceSlice &
  AudioSlice &
  AiSlice &
  ProviderSlice &
  SystemSlice &
  IntelligenceSlice;
