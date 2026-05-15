import type { StateCreator } from "zustand";
import type { SettingsState } from "./types";
import { invoke } from "@tauri-apps/api/core";
import { mapStateToSqlite, mapSqliteToState } from "../settingsMapper";

export interface AppSlice {
  /** True after persisted settings have been loaded from storage */
  isHydrated: boolean;
  /** True when there are unsaved staged changes in activeSettings */
  isDirty: boolean;
  /** True while backend SQLite sync is in progress after applyChanges */
  isSyncing: boolean;
  /** Staged settings pending application (key-value pairs) */
  activeSettings: Partial<SettingsState>;
  /** Active workspace directory path */
  workspacePath: string;
  /** Enabled hooks map */
  hooks: Record<string, boolean>;
  /** Enabled skills map */
  skills: Record<string, boolean>;
  /** Registered commands map */
  commands: Record<string, string>;

  /**
   * Stage a setting change. Records the key-value pair in `activeSettings`
   * and marks the store as dirty. Use `applyChanges()` to flush staged
   * changes into live state fields and persist them.
   */
  updateSetting: (<K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void) & ((updates: Partial<SettingsState>) => void);
  /**
   * Update multiple settings at once (used by settings tabs for form state).
   * Convenience wrapper that batches multiple updateSetting calls.
   */
  batchUpdate: (updates: Partial<SettingsState>) => void;
  /**
   * Seed settings into the store (used on hydration). Merges provided settings,
   * sets isHydrated to true, and clears dirty state.
   */
  seedSettings: (settings: Partial<SettingsState>) => void;
  /**
   * Apply all staged changes: flush activeSettings into live state fields,
   * persist to backend/storage, then clear dirty state.
   * Returns whether the backend SQLite sync failed (local save always succeeds).
   */
  applyChanges: () => Promise<{ syncFailed: boolean }>;
  /**
   * Hydrate settings from the Tauri SQLite backend.
   * Called once after localStorage rehydration to ensure SQLite values
   * (the authoritative copy) override any stale localStorage data.
   * Silently fails if the backend is unavailable (dev mode without Tauri).
   */
  hydrateFromBackend: () => Promise<void>;
  /** Discard all staged changes without applying them. */
  discardChanges: () => void;
}

/**
 * Keys that should NOT be persisted and should not participate in applyChanges flushing.
 * These are transient runtime-only state fields.
 */
const NON_APPLICABLE_KEYS = new Set([
  "isHydrated",
  "isDirty",
  "isSyncing",
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
  "hydrateFromBackend",
]);

export const createAppSlice: StateCreator<SettingsState, [], [], AppSlice> = (set, get) => ({
  isHydrated: false,
  isDirty: false,
  isSyncing: false,
  activeSettings: {},
  workspacePath: "",
  hooks: {},
  skills: {},
  commands: {},

  updateSetting: ((keyOrUpdates: keyof SettingsState | Partial<SettingsState>, value?: SettingsState[keyof SettingsState]) => {
    if (typeof keyOrUpdates === "object" && keyOrUpdates !== null) {
      set((state) => ({
        ...keyOrUpdates,
        activeSettings: { ...state.activeSettings, ...keyOrUpdates },
        isDirty: true,
      }));
      return;
    }

    set((state) => ({
      [keyOrUpdates]: value,
      activeSettings: { ...state.activeSettings, [keyOrUpdates]: value },
      isDirty: true,
    }));
  }) as AppSlice["updateSetting"],

  batchUpdate: (updates: Partial<SettingsState>) => {
    set((state) => ({
      ...updates,
      activeSettings: { ...state.activeSettings, ...updates },
      isDirty: true,
    }));
  },

  seedSettings: (settings: Partial<SettingsState>) => {
    set((state) => ({
      ...state,
      ...settings,
      isHydrated: true,
      isDirty: false,
      activeSettings: {},
    }));
  },

  applyChanges: async () => {
    const { activeSettings } = get();
    if (Object.keys(activeSettings).length === 0) return { syncFailed: false };

    // Flush staged settings into live state fields
    const flush: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(activeSettings)) {
      if (!NON_APPLICABLE_KEYS.has(key)) {
        flush[key] = value;
      }
    }

    set((state) => ({
      ...state,
      ...(flush as Partial<SettingsState>),
      isDirty: false,
      activeSettings: {},
      isSyncing: true,
    }));

    // Sync changed settings to Tauri SQLite backend (best-effort, non-blocking)
    let syncFailed = false;
    try {
      const sqliteData = mapStateToSqlite(flush as Record<string, unknown>);
      const entries = Object.entries(sqliteData);
      if (entries.length > 0) {
        await Promise.all(
          entries.map(([key, value]) =>
            invoke("set_setting", { key, value })
          )
        );
      }
    } catch (e) {
      console.warn("[SettingsStore] Failed to sync settings to backend:", e);
      syncFailed = true;
    } finally {
      set({ isSyncing: false });
    }

    return { syncFailed };
  },

  hydrateFromBackend: async () => {
    try {
      const sqliteData = await invoke<Record<string, string>>("get_all_settings");
      if (!sqliteData || Object.keys(sqliteData).length === 0) return;

      const converted = mapSqliteToState(sqliteData);
      if (Object.keys(converted).length === 0) return;

      // Merge SQLite values into store — SQLite is authoritative over localStorage
      set((state) => ({
        ...state,
        ...(converted as unknown as Partial<SettingsState>),
      }));

      console.debug(
        `[SettingsStore] Hydrated ${Object.keys(converted).length} settings from SQLite backend`
      );
    } catch (e) {
      // Silently fail — backend may be unavailable (dev mode without Tauri)
      console.debug("[SettingsStore] SQLite backend unavailable — skipping hydration:", e);
    }
  },

  discardChanges: () => {
    set({
      activeSettings: {},
      isDirty: false,
    });
  },
});
