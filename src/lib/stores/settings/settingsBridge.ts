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
  "ui.theme":        { field: "themeId",        type: "string" },

  // Workspace
  "workspace.root":  { field: "workspacePath",  type: "string" },

  // Chat / AI
  "chat.temperature":   { field: "temperature",        type: "number" },
  "chat.streaming":     { field: "streamingEnabled",    type: "boolean" },

  // Audio
  "audio.microphone":   { field: "micDeviceId",          type: "string" },
  "audio.speaker":      { field: "speakerDeviceId",      type: "string" },
  "audio.volume":       { field: "soundVolume",          type: "number" },
  "audio.stt":          { field: "sttEnabled",           type: "boolean" },
  "audio.vad":          { field: "vadEnabled",           type: "boolean" },
  "audio.tts":          { field: "ttsEnabled",           type: "boolean" },
  "audio.notifications": { field: "notificationSounds",  type: "boolean" },
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

  // 2. Direct camelCase fields (provider keys, model fields, etc.)
  for (const [key, value] of Object.entries(state)) {
    if (
      !TRANSIENT_FIELDS.has(key) &&
      typeof value !== "function" &&
      !FIELD_TO_DOT[key] // skip if already mapped above
    ) {
      record[key] = String(value);
    }
  }

  // 3. Staged changes on top (override with any pending edits)
  for (const [key, value] of Object.entries(state.activeSettings)) {
    const dotKey = FIELD_TO_DOT[key] || key;
    record[dotKey] = String(value);
  }

  return record;
}

/**
 * Convert a string value from a tab component into the correct typed value
 * for `updateSetting()`. Uses the bridge mapping if it exists, otherwise
 * returns the string as-is.
 */
export function coerceBridgeValue(key: string, value: string): unknown {
  const bridge = DOT_TO_FIELD[key];
  if (!bridge) return value; // passthrough as string

  switch (bridge.type) {
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

/**
 * Get the store field name for a dot-notation key.
 * Falls back to the raw key when no mapping exists (direct camelCase).
 */
export function dotKeyToStoreField(key: string): keyof SettingsState {
  const bridge = DOT_TO_FIELD[key];
  return bridge ? bridge.field : (key as keyof SettingsState);
}

/* ── Internal helpers ───────────────────────────────────────────── */

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
