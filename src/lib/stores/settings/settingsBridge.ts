/**
 * Bridge between dot-notation tab keys and typed zustand store fields.
 *
 * Tab components use a flat `Record<string, string>` pattern with dot-notation
 * keys (e.g. "ui.theme", "chat.temperature"). The zustand store uses typed
 * camelCase fields (e.g. `themeId`, `temperature`).
 *
 * This module provides bidirectional mapping and type coercion so that
 * SettingsModal can derive the flat record from the store and write updates
 * back through the store's typed `updateSetting()`.
 */

import type { SettingsState } from "./types";

/* ── Bridge mapping ─────────────────────────────────────────────── */

type FieldType = "string" | "number" | "boolean" | "json";

interface BridgeEntry {
  field: keyof SettingsState;
  type: FieldType;
}

const DOT_TO_FIELD: Record<string, BridgeEntry> = {
  // Interface
  "ui.theme":              { field: "themeId",            type: "string" },
  "ui.accent-hsl":         { field: "accentHsl",          type: "string" },
  "ui.accent-glow":        { field: "accentGlow",         type: "string" },
  "ui.radius-preset":      { field: "radiusPreset",       type: "string" },
  "ui.style-mode":         { field: "styleMode",          type: "string" },
  "ui.background-image":   { field: "backgroundImageUrl", type: "string" },
  "ui.background-opacity": { field: "backgroundOpacity", type: "number" },
  "ui.background-blur":    { field: "backgroundBlur",    type: "number" },
  "ui.background-fit":     { field: "backgroundFit",     type: "string" },
  "ui.background-media-type": { field: "backgroundMediaType", type: "string" },
  "ui.compact-mode":       { field: "compactMode",      type: "boolean" },
  "ui.welcome-page-quality": { field: "welcomePageQuality", type: "string" },

  // Workspace
  "workspace.root":              { field: "workspacePath",            type: "string" },
  "workspace.data-dir":          { field: "dataDirectory",            type: "string" },
  "workspace.sandbox":           { field: "sandboxEnabled",           type: "boolean" },
  "workspace.confirm-writes":    { field: "workspaceConfirmWrites",   type: "boolean" },
  "workspace.allow-external-paths": { field: "workspaceAllowExternalPaths", type: "boolean" },
  "workspace.max-file-size":     { field: "workspaceMaxFileSize",     type: "number" },
  "workspace.auto-stage":        { field: "workspaceAutoStage",       type: "boolean" },
  "workspace.commit-confirmation": { field: "workspaceCommitConfirmation", type: "boolean" },

  // Chat / AI
  "chat.temperature":       { field: "temperature",         type: "number" },
  "chat.streaming":         { field: "streamingEnabled",     type: "boolean" },
  "chat.response-style":    { field: "personalityPreset",    type: "string" },
  "chat.system-instructions": { field: "systemPrompt",       type: "string" },
  "chat.streaming-speed":   { field: "streamingSpeed",       type: "string" },
  "chat.external-tools":    { field: "toolsEnabled",         type: "boolean" },
  "chat.chain-of-thought":  { field: "thinkingMode",         type: "boolean" },
  "chat.reasoning-budget":  { field: "thinkingBudget",       type: "number" },
  "chat.reasoning-effort":  { field: "reasoningEffort",      type: "string" },
  "chat.reasoning-disclosure-density": { field: "reasoningDisclosureDensity", type: "string" },
  "chat.prompt-caching":    { field: "promptCaching",        type: "boolean" },
  "chat.hardware-accel":    { field: "gpuAcceleration",      type: "boolean" },
  "chat.title-maker-enabled": { field: "titleMakerEnabled", type: "boolean" },
  "chat.title-maker-model":   { field: "titleMakerModel", type: "string" },
  "chat.title-maker-provider": { field: "titleMakerProvider", type: "string" },
  "chat.title-maker-prompt":  { field: "titleMakerPrompt", type: "string" },
  // Agent / Orchestrator
  "agent.token-budget":          { field: "agentTokenBudget",      type: "number" },

  // Terminal
  "terminal.shell":              { field: "defaultShell",          type: "string" },
  "terminal.working-dir":        { field: "terminalWorkingDir",    type: "string" },
  "terminal.scrollback":         { field: "terminalScrollback",    type: "number" },
  "terminal.confirm-commands":   { field: "terminalConfirmCommands", type: "boolean" },
  "terminal.auto-execute":       { field: "terminalAutoExecute",   type: "boolean" },
  "terminal.timeout":            { field: "agentTimeout",          type: "number" },
  "terminal.shell-integration":  { field: "terminalShellIntegration", type: "boolean" },
  "terminal.env-vars":           { field: "terminalEnvVars",       type: "boolean" },

  // System / Performance
  "system.low-resource-mode": { field: "lowResourceMode",    type: "boolean" },
  "system.max-cpu-threads":   { field: "systemMaxCpuThreads", type: "number" },
  "system.gpu-offloading":    { field: "gpuAcceleration",     type: "boolean" },
  "system.max-memory":        { field: "maxMemoryAllocation", type: "number" },
  "system.auto-cleanup":      { field: "backgroundTasksEnabled", type: "boolean" },

  // Tools / Permissions (global)
  "tools.yolo-mode":              { field: "toolYoloMode",          type: "boolean" },
  "tools.auto-approve-low-risk":  { field: "toolAutoApproveLowRisk", type: "boolean" },
  "tools.global-default":         { field: "toolGlobalDefault",     type: "string" },
  "tools.permission-mode":        { field: "toolPermissionMode",    type: "string" },


  // Audio
  "audio.microphone":   { field: "micDeviceId",          type: "string" },
  "audio.speaker":      { field: "speakerDeviceId",      type: "string" },
  "audio.volume":       { field: "soundVolume",          type: "number" },
  "audio.stt":          { field: "sttEnabled",           type: "boolean" },
  "audio.vad":          { field: "vadEnabled",           type: "boolean" },
  "audio.tts":          { field: "ttsEnabled",           type: "boolean" },
  "audio.notifications": { field: "notificationSounds",  type: "boolean" },
  "audio.tts-engine":    { field: "ttsEngine",            type: "string" },
  "audio.stt-engine":    { field: "sttEngine",            type: "string" },
  "audio.stt-compute-device": { field: "sttComputeDevice", type: "string" },
  "audio.push-to-talk":  { field: "sttHotkeysEnabled",    type: "boolean" },
  "audio.tts-rate":      { field: "webTtsRate",           type: "number" },
  "audio.system-sounds": { field: "systemSoundsEnabled",  type: "boolean" },
  "audio.haptic":        { field: "hapticFeedbackEnabled",type: "boolean" },

  // Intelligence / RAG
  "rag.enabled":             { field: "ragEnabled",       type: "boolean" },
  "rag.strict-grounding":    { field: "strictGrounding",  type: "boolean" },
  "rag.citations":           { field: "citationsEnabled", type: "boolean" },
  "rag.search-strategy":     { field: "searchStrategy",   type: "string" },
  "rag.top-k":               { field: "topK",             type: "number" },
  "web_search_provider":     { field: "webSearchProvider", type: "string" },
  "tavily_api_key":          { field: "tavilyApiKey",      type: "string" },
  "exa_api_key":             { field: "exaApiKey",         type: "string" },
  "tavily_search_depth":     { field: "tavilySearchDepth", type: "string" },
  "web_search_max_results":  { field: "webSearchMaxResults", type: "number" },
  "embeddings.model":        { field: "embeddingModel",   type: "string" },
  "embeddings.chunk-size":   { field: "chunkSize",        type: "number" },
  "embeddings.chunk-overlap":{ field: "chunkOverlap",     type: "number" },
  "memory.enabled":              { field: "memoryEnabled",              type: "boolean" },
  "memory.max-turns":             { field: "memoryMaxTurns",              type: "number" },
  "memory.summarization_enabled":  { field: "memorySummarizationEnabled",  type: "boolean" },
  "memory.summarization_model":    { field: "memorySummarizationModel",    type: "string" },
  "memory.semantic_recall_enabled":{ field: "memorySemanticRecallEnabled", type: "boolean" },
  "memory.max_recalled_messages":  { field: "memoryMaxRecalledMessages",  type: "number" },
  "memory.drift_threshold":        { field: "memoryDriftThreshold",        type: "number" },
  "providerParams":          { field: "providerParams",   type: "json" },
};

/* ── Reverse map ────────────────────────────────────────────────── */

const FIELD_TO_DOT: Record<string, string> = {};
for (const [dotKey, entry] of Object.entries(DOT_TO_FIELD)) {
  FIELD_TO_DOT[entry.field as string] = dotKey;
}

/* ── Transient / function-only fields to exclude ────────────────── */

const TRANSIENT_FIELDS = new Set<string>([
  "isHydrated",
  "isDirty",
  "activeSettings",
  "stagedOriginals",
  "availableModels",
  "availableModelsByProvider",
  "fetchingModels",
  "connectionStatuses",
  "powerStatus",
  "availableNetworkInterfaces",
  "hardwareInfo",
  "updateSetting",
  "seedSettings",
  "applyChanges",
  "discardChanges",
  "handleWidgetToggle",
  "handleWidgetReorder",
  "handleWidgetReset",
  "switchModel",
  "toggleChatPlugin",
  "setForceSttWeb",
  "setForceTtsWeb",
  "fetchModels",
  "testProviderConnection",
  "addCustomProvider",
  "removeCustomProvider",
  "toggleCustomProvider",
  "updateCustomProvider",
  "setPerformanceProfile",
  "fetchHardwareInfo",
  "applyPowerStatus",
  "updateIntelligenceConfig",
  "setEmbeddingModel",
  "setChunkSize",
  "setChunkOverlap",
]);

/* ── Public API ─────────────────────────────────────────────────── */

/**
 * Convert the typed zustand store state into a flat `Record<string, string>`
 * so tab components continue to work without changes.
 *
 * Merges in staged (`activeSettings`) changes on top of live state.
 */
export function storeToSettingsRecord(state: SettingsState): Record<string, string> {
  const record: Record<string, string> = {};

  // 1. Explicitly mapped dot-notation keys
  for (const [dotKey, { field, type }] of Object.entries(DOT_TO_FIELD)) {
    const value = state[field];
    if (value !== undefined) {
      record[dotKey] = serializeBridgeValue(value, type);
    }
  }

  // 2. Dynamic tool permission keys from toolSettings
  const ts = (state as any).toolSettings;
  if (ts && typeof ts === "object") {
    for (const [key, value] of Object.entries(ts)) {
      if (key.startsWith("tools.permission.")) {
        record[key] = String(value ?? "");
      }
    }
  }

  // 3. Direct camelCase fields (provider keys, model fields, etc.)
  for (const [key, value] of Object.entries(state)) {
    if (
      !TRANSIENT_FIELDS.has(key) &&
      typeof value !== "function" &&
      !FIELD_TO_DOT[key] // skip if already mapped above
    ) {
      record[key] = String(value);
    }
  }

  // 4. Staged changes on top (override with any pending edits)
  for (const [key, value] of Object.entries(state.activeSettings)) {
    const dotKey = FIELD_TO_DOT[key] || key;
    record[dotKey] = String(value);
  }

  return record;
}

/**
 * Get the store field name for a dot-notation key.
 * - Dynamic tool permission keys ("tools.permission.*") route to toolSettings.
 * - All other keys must be in DOT_TO_FIELD; falls back to the raw key
 *   (but callers should verify the key is known to avoid unmapped fallthrough).
 */
export function dotKeyToStoreField(key: keyof SettingsState | string): keyof SettingsState {
  const bridge = DOT_TO_FIELD[key];
  if (bridge) return bridge.field;
  // Dynamic tool permission keys stored in toolSettings
  if (key.startsWith("tools.permission.")) return "toolSettings" as keyof SettingsState;
  console.warn(`[SettingsBridge] Unmapped dot-notation key: "${key}" — will be lost on persistence`);
  return key as keyof SettingsState;
}

/**
 * Convert a string value from a tab component into the correct typed value
 * for `updateSetting()`. Uses the bridge mapping if it exists, otherwise
 * returns the string as-is.
 */
export function coerceBridgeValue(key: string, value: string): unknown {
  const bridge = DOT_TO_FIELD[key];
  if (bridge) {
    return coerceByType(value, bridge.type);
  }
  // Dynamic tool permission keys → store raw value in toolSettings
  if (key.startsWith("tools.permission.")) return value;
  console.warn(`[SettingsBridge] Unmapped dot-notation key: "${key}" — value stored as raw string`);
  return value;
}

/* ── Internal helpers ───────────────────────────────────────────── */

function coerceByType(value: string, type: FieldType): unknown {
  switch (type) {
    case "number": {
      const n = parseFloat(value);
      return isNaN(n) ? 0 : n;
    }
    case "boolean":
      return value === "true";
    case "json":
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    default:
      return value;
  }
}

function serializeBridgeValue(value: unknown, type: FieldType): string {
  switch (type) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return String(value ?? 0);
    case "json":
      return JSON.stringify(value);
    default:
      return String(value ?? "");
  }
}
