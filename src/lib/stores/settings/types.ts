import type { IntelligenceConfig } from "../../../components/settings/types";

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

export const DIRECT_PROVIDER_URLS: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    deepseek: 'https://api.deepseek.com',
    groq: 'https://api.groq.com/openai/v1',
    google: 'https://generativelanguage.googleapis.com/v1beta/openai',
    gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
    mistral: 'https://api.mistral.ai/v1',
    xai: 'https://api.x.ai/v1',
    kilocode: 'https://api.kilo.ai/api/gateway',
    together: 'https://api.together.xyz/v1',
    perplexity: 'https://api.perplexity.ai',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    nine_router: 'http://localhost:20128/v1',
    opencode: 'https://opencode.ai/zen/v1',
};

import { ModelInfo, CustomProviderConfig } from '../../types/provider';

export type BackgroundFit = "cover" | "contain" | "stretch" | "original" | "tile";
export type BackgroundMediaType = "auto" | "image" | "video";
/** Welcome background renderer: animated, static image, or disabled. */
export type WelcomePageQuality = "low" | "high" | "image" | "none";

// ─── Slice Interfaces ─────────────────────────────────────────────────────

export interface AppSlice {
  isHydrated: boolean;
  isDirty: boolean;
  isSyncing: boolean;
  activeSettings: Partial<SettingsState>;
  stagedOriginals: Partial<SettingsState>;
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
  /** Persisted accent color overrides (HSL triples without hsl() wrapper).
   *  When non-empty, ZenThemeProvider reapplies them after a preset load so
   *  user-customized accents survive restarts. */
  accentHsl: string;
  accentGlow: string;
  /** Persisted radius preset override (sharp|smooth|round|pill). */
  radiusPreset: "" | "sharp" | "smooth" | "round" | "pill";
  /** Persisted surface style mode override (flat|subtle|bordered|glass). */
  styleMode: "" | "flat" | "subtle" | "bordered" | "glass";
  animationsEnabled: boolean;
  lowResourceMode: boolean;
  /** Welcome background renderer: low uses SVG, high uses Three.js/WebGL. */
  welcomePageQuality: WelcomePageQuality;
  bootEnabled: boolean;
  bootDuration: number;
  bootDurationMs: number;
  widgetSettings: WidgetSettings;
  compactMode: boolean;
  customCssPath: string;
  customCssEnabled: boolean;
  sidebarPosition: "left" | "right";
  activityBarStyle: "icons" | "icons-text";
  backgroundImageUrl: string;
  backgroundOpacity: number;
  backgroundBlur: number;
  backgroundFit: BackgroundFit;
  backgroundMediaType: BackgroundMediaType;
  optimizedVideos: string[]; // List of paths to optimized video files
  /** When true, completed successful tool groups remain visible in the chat
   *  timeline even after the assistant answer arrives (useful for auditing
   *  past turns). Defaults to false so the transcript stays focused on the
   *  conversation. Persisted across reloads via the settings storage adapter. */
  revealCompletedToolHistory: boolean;

  setAnimationsEnabled: (enabled: boolean) => void;
  setLowResourceMode: (enabled: boolean) => void;
  setRevealCompletedToolHistory: (enabled: boolean) => void;

  handleWidgetToggle: (widgetId: string) => void;
  handleWidgetReorder: (widgetId: string, direction: "up" | "down") => void;
  handleWidgetReset: () => void;
  setBackgroundImageUrl: (url: string) => void;
  setBackgroundOpacity: (opacity: number) => void;
  setBackgroundBlur: (blur: number) => void;
  setBackgroundFit: (fit: BackgroundFit) => void;
  setBackgroundMediaType: (mediaType: BackgroundMediaType) => void;
}

export interface AudioSlice {
  ttsEnabled: boolean;
  ttsEngine: "piper" | "web" | "system";
  sttEnabled: boolean;
  sttEngine: "whisper" | "web" | "moonshine" | "system";
  sttWhisperModel: string;
  sttComputeDevice: string;
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
  ttsPiperVoiceId: string;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  vadThreshold: number;
  voiceDisplayAgentModel: string;

  setForceSttWeb: (val: boolean) => void;
  setForceTtsWeb: (val: boolean) => void;
}

export interface ProviderParams {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  repeatPenalty?: number;
  minP?: number;
  seed?: number;
  stop?: string[];
  [key: string]: any;
}

export interface AiSlice {
  activeProvider: string;
  activeModel: string;
  systemPrompt: string;
  temperature: number; // Keep as global default
  maxTokens: number;  // Keep as global default
  providerParams: Record<string, ProviderParams>;
  reasoningEnabled: boolean;
  reasoningEffort: "low" | "medium" | "high";
  reasoningDisclosureDensity: "compact" | "balanced" | "detailed";
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
  webSearchProvider: "auto" | "tavily" | "exa" | "duckduckgo";
  tavilyApiKey: string;
  exaApiKey: string;
  tavilySearchDepth: "ultra-fast" | "fast" | "basic" | "advanced";
  webSearchMaxResults: number;
  deepResearchModel: string;
  deepResearchMaxRounds: number;
  deepResearchParallelAgents: number;
  deepResearchMaxSourcesPerRound: number;
  embeddingProvider: string;
  streamingSpeed: "instant" | "typewriter";
  titleMakerEnabled: boolean;
  titleMakerModel: string;
  titleMakerProvider: string;
  titleMakerPrompt: string;
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
  updateProviderParams: (provider: string, params: Partial<ProviderParams>) => void;
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
  geminiApiKey: string;
  groqApiKey: string;
  mistralApiKey: string;
  deepseekApiKey: string;
  openrouterApiKey: string;
  togetherApiKey: string;
  perplexityApiKey: string;
  nvidiaApiKey: string;
  qwenApiKey: string;
  xaiApiKey: string;
  kilocodeApiKey: string;
  nineRouterApiKey: string;
  openaiBaseUrl: string;
  anthropicBaseUrl: string;
  googleBaseUrl: string;
  groqBaseUrl: string;
  mistralBaseUrl: string;
  deepseekBaseUrl: string;
  openrouterBaseUrl: string;
  togetherBaseUrl: string;
  perplexityBaseUrl: string;
  qwenBaseUrl: string;
  xaiBaseUrl: string;
  kilocodeBaseUrl: string;
  nvidiaBaseUrl: string;
  mimoBaseUrl: string;
  nineRouterBaseUrl: string;
  opencodeBaseUrl: string;
  // Local providers
  ollamaBaseUrl: string;
  lmstudioBaseUrl: string;
  // Custom providers
  customProviders: CustomProviderConfig[];
  // Transient UI bridge: id of the most recently removed provider. Consumed by
  // settings tabs that hold local selection state so they can drop the stale
  // selection and return to the gallery instead of dereferencing missing data.
  lastRemovedProviderId: string | null;
  // Per-tool auto-approve IDs (transient runtime list, not persisted)
  toolAutoApprove: string[];
  
  // 9Router Image Models (cached from /v1/models/image)
  nineRouterImageModels: ModelInfo[];
  nineRouterImageModelsLoading: boolean;
  nineRouterImageModelsError: string | null;
  nineRouterImageModelsLastFetchedAt: number | null;
  fetchNineRouterImageModels: (force?: boolean) => Promise<void>;

  // Dynamic Catalog
  availableModels: ModelInfo[];
  availableModelsByProvider: Record<string, ModelInfo[]>;
  fetchingModels: boolean;
  connectionStatuses: Record<string, 'idle' | 'success' | 'error'>;
  testingConnections: Record<string, boolean>;

  fetchModels: (providerOverride?: string, force?: boolean) => Promise<string[]>;
  testProviderConnection: (providerOverride?: string) => Promise<void>;
  addCustomProvider: (config: Omit<CustomProviderConfig, 'id' | 'enabled'>) => Promise<string>;
  removeCustomProvider: (id: string) => Promise<void>;
  toggleCustomProvider: (id: string) => void;
  updateCustomProvider: (id: string, updates: Partial<CustomProviderConfig>) => Promise<void>;
  
  syncModelCatalog: () => Promise<void>;
  setDiscoveryMode: (enabled: boolean) => void;
  setProviderError: (error: string | null) => void;
  setAvailableModels: (models: ModelInfo[]) => void;
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
  agentTokenBudget: number;
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
  toolPermissionMode: "plan_mode" | "ask" | "auto_edit" | "yolo";
  toolSettings: Record<string, any>;

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

  memoryEnabled: boolean;
  memoryMaxTurns: number;
  memorySummarizationEnabled: boolean;
  memorySummarizationModel: string;
  memorySemanticRecallEnabled: boolean;
  memoryMaxRecalledMessages: number;
  memoryDriftThreshold: number;
}

// ─── Combined Settings State ──────────────────────────────────────────────

export type SettingsState = AppSlice &
  InterfaceSlice &
  AudioSlice &
  AiSlice &
  ProviderSlice &
  SystemSlice &
  IntelligenceSlice;
