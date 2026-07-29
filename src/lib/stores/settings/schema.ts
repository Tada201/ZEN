import { z } from "zod";
import {
  VOICE_DISPLAY_AGENT_DEFAULT_COMPACT_THRESHOLD,
  VOICE_DISPLAY_AGENT_DEFAULT_CONTEXT_TOKENS,
  VOICE_DISPLAY_AGENT_DEFAULT_MAX_TURNS,
  VOICE_DISPLAY_AGENT_DEFAULT_PROMPT,
} from "./voiceDefaults";

export const SettingsSchema = z.object({
  // ─── Interface ───────────────────────────────────────────────────────────
  themeId: z.string().default("default-dark"),
  customThemeSource: z.string().default(""),
  accentHsl: z.string().default(""),
  accentGlow: z.string().default(""),
  radiusPreset: z.enum(["", "sharp", "smooth", "round", "pill"]).default(""),
  styleMode: z.enum(["", "flat", "subtle", "bordered", "glass"]).default(""),
  animationsEnabled: z.boolean().default(true),
  lowResourceMode: z.boolean().default(false),
  bootEnabled: z.boolean().default(true),
  bootDuration: z.number().min(500).max(5000).default(2500),
  bootDurationMs: z.number().min(500).max(5000).default(2500),
  reducedMotion: z.boolean().default(false),
  customCssEnabled: z.boolean().default(false),
  customCssPath: z.string().default(""),
  sidebarPosition: z.enum(["left", "right"]).default("left"),
  activityBarStyle: z.enum(["icons", "icons-text"]).default("icons"),
  backgroundImageUrl: z.string().default(""),
  backgroundOpacity: z.number().min(0).max(1).default(0.15),
  backgroundBlur: z.number().min(0).max(100).default(0),
  backgroundFit: z.enum(["cover", "contain", "stretch", "original", "tile"]).default("cover"),
  backgroundMediaType: z.enum(["auto", "image", "video"]).default("auto"),
  /** When true, completed successful tool groups remain visible in the chat
   *  timeline even after the assistant answer arrives. Defaults to false so
   *  the transcript stays focused on the conversation. Persisted as the
   *  backend key `ui.reveal-completed-tool-history`. */
  revealCompletedToolHistory: z.boolean().default(false),

  // ─── Audio ───────────────────────────────────────────────────────────────
  ttsEnabled: z.boolean().default(false),
  ttsEngine: z.enum(["piper", "web", "system"]).default("piper"),
  sttEnabled: z.boolean().default(false),
  sttEngine: z.enum(["whisper", "web", "moonshine", "system"]).default("whisper"),
  sttWhisperModel: z.string().default("ggml-tiny.en.bin"),
  sttComputeDevice: z.string().default("auto"),
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
  voiceDisplayAgentEnabled: z.boolean().default(true),
  voiceDisplayAgentModel: z.string().default(""),
  voiceDisplayAgentContextTokens: z.number().min(4096).max(1048576).default(VOICE_DISPLAY_AGENT_DEFAULT_CONTEXT_TOKENS),
  voiceDisplayAgentMaxTurns: z.number().min(1).max(50).default(VOICE_DISPLAY_AGENT_DEFAULT_MAX_TURNS),
  voiceDisplayAgentAutoCompactEnabled: z.boolean().default(true),
  voiceDisplayAgentCompactThreshold: z.number().min(50).max(95).default(VOICE_DISPLAY_AGENT_DEFAULT_COMPACT_THRESHOLD),
  voiceDisplayAgentPrompt: z.string().default(VOICE_DISPLAY_AGENT_DEFAULT_PROMPT),

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
  deepResearchModel: z.string().default(""),
  deepResearchMaxRounds: z.number().int().min(2).max(8).default(6),
  deepResearchParallelAgents: z.number().int().min(1).max(4).default(3),
  deepResearchMaxSourcesPerRound: z.number().int().min(2).max(10).default(3),

  // ─── Memory ──────────────────────────────────────────────────────────────
  maxMessagesInMemory: z.number().min(1).max(500).default(100),
  messageRetentionThreshold: z.number().min(1).max(365).default(30),
  pinLimit: z.number().min(0).max(50).default(10),
  memoryEnabled: z.boolean().default(true),
  memoryMaxTurns: z.number().default(20),
  memorySummarizationEnabled: z.boolean().default(true),
  memorySummarizationModel: z.string().default("llama3.2:1b"),
  memorySemanticRecallEnabled: z.boolean().default(true),
  memoryMaxRecalledMessages: z.number().default(5),
  memoryDriftThreshold: z.number().default(0.3),

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
  toolYoloMode: z.boolean().default(false),
  toolAutoApproveLowRisk: z.boolean().default(true),
  toolGlobalDefault: z.enum(["confirm", "always_allow", "always_deny"]).default("confirm"),
  /**
   * Single source of truth for the runtime permission mode the runner reads.
   * Mirrors the typed `SafetyMode` union in
   * `src/components/settings/Tabs/ToolsSettings.tsx`. Persisted as the
   * backend key `tools.permission-mode` (and the flat form
   * `tool_permission_mode` for older mappers); see SNAKE_OVERRIDES in
   * settingsMapper.ts. Adding a new variant here will propagate through the
   * settings bridge, the typed store, and the backend auto-sync trigger.
   */
  toolPermissionMode: z.enum(["plan_mode", "ask", "auto_edit", "yolo"]).default("ask"),
  toolSettings: z.record(z.string(), z.any()).default({}),

  // ─── Title Maker ─────────────────────────────────────────────────────────
  /**
   * Auto-generated session title settings. The Chat tab UI exposes these via
   * the `chat.title-maker-*` dot-notation keys; the typed store and backend
   * mapper must agree on the snake-case form so the keys round-trip through
   * get_all_settings / set_settings without losing values.
   *
   * `titleMakerProvider` carries the explicit provider identity for the model
   * chosen via the picker — a model id alone is ambiguous across the
   * provider fleet (e.g. `llama3.2:3b` can resolve under ollama OR
   * nine_router). The Rust title-maker command reads this first and falls
   * back to `active_provider` only when it is empty.
   */
  titleMakerEnabled: z.boolean().default(true),
  titleMakerModel: z.string().default(""),
  titleMakerProvider: z.string().default(""),
  titleMakerPrompt: z.string().default(""),

  // ─── Map & Geospatial ────────────────────────────────────────────────────
  mapProvider: z.string().default("cesium"),
  weatherApiKey: z.string().default(""),

  // ─── Workspace Security ──────────────────────────────────────────────────
  sandboxEnabled: z.boolean().default(true),
  workspaceConfirmWrites: z.boolean().default(false),
  workspaceAllowExternalPaths: z.boolean().default(false),
  workspaceMaxFileSize: z.number().min(1).max(500).default(10),
  workspaceAutoStage: z.boolean().default(false),
  workspaceCommitConfirmation: z.boolean().default(true),

  // ─── Terminal ────────────────────────────────────────────────────────────
  defaultShell: z.string().default("powershell"),
  terminalShell: z.string().default(""),
  terminalFontSize: z.number().min(8).max(32).default(14),
  terminalWorkingDir: z.string().default(""),
  terminalScrollback: z.number().min(100).max(100000).default(5000),
  terminalConfirmCommands: z.boolean().default(true),
  terminalAutoExecute: z.boolean().default(false),
  terminalShellIntegration: z.boolean().default(true),
  terminalEnvVars: z.boolean().default(false),

  // ─── System / Performance Extended ───────────────────────────────────────
  systemMaxCpuThreads: z.number().min(1).max(64).default(8),

  // ─── RAG / Knowledge ─────────────────────────────────────────────────────
  ragEnabled: z.boolean().default(false),
  citationsEnabled: z.boolean().default(false),
  strictGrounding: z.boolean().default(false),
  searchStrategy: z.enum(["hybrid", "vector", "keyword", "semantic", "disabled"]).default("hybrid"),
  topK: z.number().min(1).max(100).default(10),
  webSearchProvider: z.enum(["auto", "tavily", "exa", "duckduckgo"]).default("auto"),
  tavilyApiKey: z.string().default(""),
  exaApiKey: z.string().default(""),
  tavilySearchDepth: z.enum(["ultra-fast", "fast", "basic", "advanced"]).default("fast"),
  webSearchMaxResults: z.number().min(1).max(20).default(10),
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
  nvidiaApiKey: z.string().default(""),
  nineRouterBaseUrl: z.string().default("http://localhost:20128/v1"),
  opencodeBaseUrl: z.string().default("https://opencode.ai/zen/v1"),
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
  agentTokenBudget: z.number().min(0).max(10000000).default(0),
  maxExecutionTime: z.number().default(30),
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
