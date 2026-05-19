import { z } from "zod";

export const SettingsSchema = z.object({
  // ─── Interface ───────────────────────────────────────────────────────────
  themeId: z.string().default("neon-grid"),
  customThemeSource: z.string().default(""),
  animationsEnabled: z.boolean().default(true),
  lowResourceMode: z.boolean().default(false),
  bootEnabled: z.boolean().default(true),
  bootDuration: z.number().min(500).max(10000).default(2500),
  bootDurationMs: z.number().min(500).max(10000).default(2500),
  reducedMotion: z.boolean().default(false),
  customCssEnabled: z.boolean().default(false),
  customCssPath: z.string().default(""),
  sidebarPosition: z.enum(["left", "right"]).default("left"),
  activityBarStyle: z.enum(["icons", "icons-text"]).default("icons"),
  backgroundImageUrl: z.string().default(""),
  backgroundOpacity: z.number().min(0).max(1).default(0.15),
  backgroundBlur: z.number().min(0).max(100).default(0),

  // ─── Audio ───────────────────────────────────────────────────────────────
  ttsEnabled: z.boolean().default(false),
  ttsEngine: z.enum(["piper", "web", "system", "nine_router"]).default("piper"),
  sttEnabled: z.boolean().default(false),
  sttEngine: z.enum(["whisper", "web"]).default("whisper"),
  sttWhisperModel: z.string().default("base"),
  webTtsVoiceURI: z.string().default(""),
  webTtsRate: z.number().min(0.1).max(3.0).default(1.0),
  webTtsPitch: z.number().min(0.1).max(2.0).default(1.0),
  soundVolume: z.number().min(0).max(1).default(0.8),
  masterVolume: z.number().min(0).max(1).default(0.8),
  isMuted: z.boolean().default(false),
  micVolume: z.number().min(0).max(1).default(0.8),
  speakerVolume: z.number().min(0).max(1).default(0.8),
  audioFeedbackEnabled: z.boolean().default(true),
  micDeviceId: z.string().default(""),
  speakerDeviceId: z.string().default(""),
  hapticFeedbackEnabled: z.boolean().default(false),
  voiceInputMode: z.boolean().default(false),
  notificationSounds: z.boolean().default(true),
  vadEnabled: z.boolean().default(false),
  sttHotkeysEnabled: z.boolean().default(false),
  webTtsVoice: z.string().default(""),
  sttModel: z.string().default("base"),
  selectedMic: z.string().default(""),
  systemSoundsEnabled: z.boolean().default(true),

  // ─── Chat & AI ───────────────────────────────────────────────────────────
  activeProvider: z.string().default("ollama"),
  activeModel: z.string().default(""),
  systemPrompt: z.string().default(""),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(1).max(128000).default(4096),
  reasoningEnabled: z.boolean().default(false),
  reasoningEffort: z.enum(["low", "medium", "high"]).default("medium"),
  streamingEnabled: z.boolean().default(true),
  streamSpeed: z.number().min(0).max(1).default(0.5),
  thinkingMode: z.boolean().default(false),
  promptCaching: z.boolean().default(true),

  // ─── Memory ──────────────────────────────────────────────────────────────
  maxMessagesInMemory: z.number().min(1).max(500).default(100),
  messageRetentionThreshold: z.number().min(1).max(365).default(30),
  pinLimit: z.number().min(0).max(50).default(10),

  // ─── Performance ─────────────────────────────────────────────────────────
  performanceProfile: z.enum(["max", "balanced", "powersaver"]).default("balanced"),
  performanceAutoDetect: z.boolean().default(true),
  cesiumFpsCap: z.number().min(15).max(144).default(60),
  spaceFpsCap: z.number().min(15).max(144).default(60),
  animationFpsCap: z.number().min(15).max(144).default(60),
  mathFpsCap: z.number().min(15).max(144).default(60),
  metricsPollingInterval: z.number().min(500).max(30000).default(2000),

  // ─── Security & Tools ────────────────────────────────────────────────────
  telemetryEnabled: z.boolean().default(true),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  backgroundTasksEnabled: z.boolean().default(true),

  // ─── Map & Geospatial ────────────────────────────────────────────────────
  mapProvider: z.string().default("cesium"),
  weatherApiKey: z.string().default(""),

  // ─── Terminal ────────────────────────────────────────────────────────────
  terminalShell: z.string().default(""),
  terminalFontSize: z.number().min(8).max(32).default(14),

  // ─── RAG / Knowledge ─────────────────────────────────────────────────────
  ragEnabled: z.boolean().default(false),
  citationsEnabled: z.boolean().default(false),
  strictGrounding: z.boolean().default(false),
  searchStrategy: z.enum(["hybrid", "vector", "keyword", "semantic", "disabled"]).default("hybrid"),
  topK: z.number().min(1).max(100).default(10),
  minScore: z.number().min(0).max(1).default(0.5),
  embeddingModel: z.string().default("all-MiniLM-L6-v2"),
  chunkSize: z.number().min(128).max(4096).default(1024),
  chunkOverlap: z.number().min(0).max(1024).default(128),
  embeddingProvider: z.string().default("ollama"),

  // ─── Provider URLs ───────────────────────────────────────────────────────
  ollamaBaseUrl: z.string().default("http://localhost:11434"),
  lmstudioBaseUrl: z.string().default("http://localhost:1234"),
  // API Keys (stored as empty strings when not configured)
  openaiApiKey: z.string().default(""),
  anthropicApiKey: z.string().default(""),
  googleApiKey: z.string().default(""),
  geminiApiKey: z.string().default(""),
  qwenApiKey: z.string().default(""),
  xaiApiKey: z.string().default(""),
  kilocodeApiKey: z.string().default(""),
  groqApiKey: z.string().default(""),
  mistralApiKey: z.string().default(""),
  deepseekApiKey: z.string().default(""),
  openrouterApiKey: z.string().default(""),
  togetherApiKey: z.string().default(""),
  perplexityApiKey: z.string().default(""),
  nineRouterBaseUrl: z.string().default("http://localhost:20128/v1"),
  nineRouterApiKey: z.string().default(""),
  aihubmixApiKey: z.string().default(""),

  // ─── Workspace ───────────────────────────────────────────────────────────
  workspacePath: z.string().default(""),

  // ─── Plugins & Extensions ────────────────────────────────────────────────
  hooks: z.record(z.string(), z.boolean()).default({}),
  skills: z.record(z.string(), z.boolean()).default({}),
  commands: z.record(z.string(), z.string()).default({}),

  // ─── Interface Extended ─────────────────────────────────────────────────
  structuredResponseEnabled: z.boolean().default(false),
  selectedSchemaId: z.string().default("standard"),
  toolsEnabled: z.boolean().default(true),
  streamResponses: z.boolean().default(true),
  streamingSpeed: z.enum(["instant", "typewriter"]).default("instant"),
  personalityPreset: z.enum(["neutral", "friendly", "technical", "creative", "concise", "custom"]).default("neutral"),
  voiceInstructions: z.string().default(""),
  agentLoggingEnabled: z.boolean().default(true),
  agentMemoryLimit: z.number().default(512),
  multiAgentEnabled: z.boolean().default(false),
  agentTimeout: z.number().default(120),
  sandboxEnabled: z.boolean().default(true),
  maxExecutionTime: z.number().default(30),
  defaultShell: z.string().default("powershell"),
  shellArgs: z.string().default(""),
  dataDirectory: z.string().default(""),
  autoBackup: z.boolean().default(false),
  maxMemoryAllocation: z.number().default(8192),
  thinkingBudget: z.number().default(4096),
  gpuAcceleration: z.boolean().default(true),
  enablePromptCaching: z.boolean().default(true),
  chatPlugins: z.record(z.string(), z.boolean()).default({}),
  providerParams: z.record(z.string(), z.record(z.string(), z.any())).default({}),
  autoCheckEnabled: z.boolean().default(true),
  checkBeta: z.boolean().default(false),
  customProviders: z.array(z.any()).default([]),
});

export type ValidatedSettings = z.infer<typeof SettingsSchema>;
export const SETTINGS_KEYS = SettingsSchema.keyof().options;
