/**
 * Custom persistence middleware for the Zen settings store.
 *
 * Features:
 * - localStorage-based persistence via zustand `persist` middleware
 * - Custom serialize/deserialize using settingsMapper (camelCase ↔ snake_case)
 * - Hydration lifecycle: auto-calls `seedSettings` after loading from storage
 * - Dirty tracking: unsaved changes are tracked and can be applied/discarded
 * - Transient key filtering: ephemeral state (isHydrated, isDirty, etc.) is never persisted
 * - Migration detection: handles old camelCase format from previous store versions
 */

import { type PersistStorage, type StorageValue } from "zustand/middleware";
import type { SettingsState } from "../settings/types";
import {
  mapStateToSqlite,
  mapSqliteToState,
} from "../settingsMapper";

/**
 * Keys that should NEVER be persisted to storage.
 * These are transient runtime state like hydration flags and dirty tracking.
 */
const TRANSIENT_KEYS = new Set([
  "isHydrated",
  "isDirty",
  "activeSettings",
  "availableModels",
  "availableModelsByProvider",
  "fetchingModels",
  "connectionStatuses",
  "powerStatus",
  "availableNetworkInterfaces",
  "hardwareInfo",
  "nineRouterImageModels",
  "nineRouterImageModelsLoading",
  "nineRouterImageModelsError",
  "nineRouterImageModelsLastFetchedAt",
]);

const SECRET_KEY_PATTERN = /(apiKey|api_key|token|secret|credential|password)$/i;

function redactSecretsForLocalStorage(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecretsForLocalStorage(item));
  }

  if (value && typeof value === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        continue;
      }
      redacted[key] = redactSecretsForLocalStorage(entry);
    }
    return redacted;
  }

  return value;
}

/**
 * Known camelCase keys from the OLD (v1) store format.
 * Used to detect legacy data and skip snake_case conversion.
 */
const OLD_CAMEL_KEYS = new Set([
  "preferredProvider",
  "animationsEnabled",
  "lowResourceMode",
]);

/**
 * Check if persisted data is in the old camelCase format (v1 store).
 */
function isOldCamelFormat(data: Record<string, unknown>): boolean {
  return Object.keys(data).some((key) => OLD_CAMEL_KEYS.has(key));
}

/**
 * Extract only the persistable subset of state (exclude transient keys).
 *
 * This is the single source of truth for filtering out ephemeral runtime
 * state before writing to localStorage. Also used for initial seeding.
 */
export function getPersistableState(state: Partial<SettingsState>): Partial<SettingsState> {
  const persistable: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (!TRANSIENT_KEYS.has(key)) {
      (persistable as Record<string, unknown>)[key] = value;
    }
  }
  return persistable as Partial<SettingsState>;
}

/**
 * Try to coerce raw persisted data into camelCase state.
 *
 * Strategy (belt-and-suspenders):
 * 1. If data has known old-format camelCase keys → pass through as-is
 * 2. If mapSqliteToState returns non-empty result → use it
 * 3. If mapSqliteToState returns empty but raw data has keys → pass through as-is (fallback)
 * 4. Otherwise → return empty object (start fresh)
 */
function deserializeState(rawState: Record<string, unknown>): Partial<SettingsState> {
  let result: Partial<SettingsState> = {};

  // Strategy 1: Known old-format camelCase keys → pass through
  if (isOldCamelFormat(rawState)) {
    result = rawState as Partial<SettingsState>;
  } else {
    // Strategy 2: Try snake_case → camelCase conversion
    const converted = mapSqliteToState(rawState as any);
    if (Object.keys(converted).length > 0) {
      result = converted;
    } else if (Object.keys(rawState).length > 0) {
      // Strategy 3: Fallback — raw data has keys but conversion returned empty
      console.warn(
        "[SettingsPersistence] mapSqliteToState returned empty for non-empty data — passing through raw state as fallback"
      );
      result = rawState as Partial<SettingsState>;
    }
  }

  // Sanitization: Ensure nested objects are never null if present
  if (result) {
    if ((result as any).providerParams === null) delete (result as any).providerParams;
    if ((result as any).chatPlugins === null) delete (result as any).chatPlugins;
    if ((result as any).toolSettings === null || (result as any).toolSettings === undefined) {
      (result as any).toolSettings = {};
    } else if (typeof (result as any).toolSettings === "string") {
      try {
        (result as any).toolSettings = JSON.parse((result as any).toolSettings);
      } catch {
        (result as any).toolSettings = {};
      }
    }
    if ((result as any).customProviders === null || (result as any).customProviders === undefined) {
      delete (result as any).customProviders;
    } else if (typeof (result as any).customProviders === "string") {
      try {
        const parsed = JSON.parse((result as any).customProviders);
        (result as any).customProviders = Array.isArray(parsed) ? parsed : [];
      } catch {
        (result as any).customProviders = [];
      }
    } else if (!Array.isArray((result as any).customProviders)) {
      (result as any).customProviders = [];
    }
  }

  return result;
}

/**
 * Custom zustand persist storage adapter.
 *
 * - Serialization: camelCase state → snake_case string map → JSON string
 * - Deserialization: JSON string → snake_case string map → camelCase state
 * - Migration: detects old camelCase format and handles it transparently
 * - Hydration: after loading, calls `seedSettings` to merge into the store
 */
export const createSettingsStorage = (_key: string): PersistStorage<SettingsState> => {
  return {
    getItem: async (name: string): Promise<StorageValue<SettingsState> | null> => {
      try {
        const raw = localStorage.getItem(name);
        if (!raw) return null;

        const parsed = JSON.parse(raw);
        const stateVersion = parsed.stateVersion ?? parsed.version ?? 0;

        // Deserialize the stored data into camelCase state
        const sqliteData = parsed.state ?? {};
        const camelState = deserializeState(sqliteData);

        return {
          state: camelState as any,
          version: stateVersion,
        };
      } catch {
        // Corrupt or missing data — start fresh
        return null;
      }
    },

    setItem: async (name: string, value: StorageValue<SettingsState>): Promise<void> => {
      try {
        const persistable = getPersistableState(value.state as Partial<SettingsState>);
        // Convert camelCase state to snake_case string map for storage
        const sqliteData = mapStateToSqlite(
          redactSecretsForLocalStorage(persistable) as Partial<SettingsState>
        );

        localStorage.setItem(
          name,
          JSON.stringify({
            state: sqliteData,
            stateVersion: value.version ?? 0,
          })
        );
      } catch (err) {
        console.error("[SettingsPersistence] Failed to persist settings:", err);
      }
    },

    removeItem: async (name: string): Promise<void> => {
      try {
        localStorage.removeItem(name);
      } catch (err) {
        console.error("[SettingsPersistence] Failed to remove settings:", err);
      }
    },
  };
};

/**
 * Default storage key for the Zen settings store.
 */
export const SETTINGS_STORAGE_KEY = "zen-settings-storage";

/**
 * Pre-configured settings storage adapter using the default storage key.
 */
export const settingsStorage = createSettingsStorage(SETTINGS_STORAGE_KEY);
