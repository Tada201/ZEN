/**
 * Zen Settings Store — Composed Zustand store with slice-based architecture.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────┐
 * │                   useSettingsStore                   │
 * ├─────────────────────────────────────────────────────┤
 * │  AppSlice      — Hydration, dirty tracking, apply   │
 * │  InterfaceSlice — Theme, layout, widgets, a11y       │
 * │  AudioSlice     — TTS/STT, volumes, devices          │
 * │  AiSlice        — Providers, models, RAG, plugins    │
 * │  ProviderSlice  — API keys, custom providers, tools  │
 * │  SystemSlice    — Performance, telemetry, hardware   │
 * │  IntelligenceSlice — RAG config, embeddings, chunks  │
 * ├─────────────────────────────────────────────────────┤
 * │  Persist Middleware: localStorage via settingsMapper │
 * │  → camelCase state ↔ snake_case string map           │
 * │  → Automatic hydration on load                       │
 * │  → Transient key filtering (in storage adapter)      │
 * │  → No partialize — storage adapter handles filtering │
 * └─────────────────────────────────────────────────────┘
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SettingsState } from "./settings/types";
import { createAppSlice } from "./settings/createAppSlice";
import { createInterfaceSlice } from "./settings/createInterfaceSlice";
import { createAudioSlice } from "./settings/createAudioSlice";
import { createAISlice } from "./settings/createAISlice";
import { createProviderSlice } from "./settings/createProviderSlice";
import { createSystemSlice } from "./settings/createSystemSlice";
import { createIntelligenceSlice } from "./settings/createIntelligenceSlice";
import { settingsStorage, SETTINGS_STORAGE_KEY } from "./middleware/persistence";

/**
 * Composed settings store with persistence.
 *
 * On rehydration:
 * 1. Zustand persist loads stored state from localStorage
 * 2. The custom storage adapter deserializes snake_case → camelCase
 * 3. onRehydrateStorage calls seedSettings({}) to mark hydration complete
 * 4. The store is now ready for use — all setters are available
 *
 * Note: NO partialize filter is used here. The custom storage adapter
 * (`settingsStorage`) handles transient key filtering internally via
 * `getPersistableState()` in its `setItem` implementation.
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (...a) => ({
      ...createAppSlice(...a),
      ...createInterfaceSlice(...a),
      ...createAudioSlice(...a),
      ...createAISlice(...a),
      ...createProviderSlice(...a),
      ...createSystemSlice(...a),
      ...createIntelligenceSlice(...a),
    } as SettingsState),
    {
      name: SETTINGS_STORAGE_KEY,
      storage: settingsStorage,
      // ⚠️ IMPORTANT: No partialize here — the storage adapter's
      // setItem/getItem handle transient key filtering internally.
      // Setting partialize would starve the adapter of state data.
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            console.error("[SettingsStore] Rehydration failed:", error);
            return;
          }
          // Mark the store as hydrated after successful rehydration
          // setTimeout(0) avoids calling setState during persist callback
          setTimeout(async () => {
            state?.seedSettings({});
            // After local rehydration, hydrate from SQLite backend (async, best-effort)
            // SQLite values override localStorage as the authoritative source.
            await state?.hydrateFromBackend();

            // Use the final SQLite-backed provider selection for discovery.
            // Otherwise the initial chat query can race hydration and omit
            // no-key local providers such as 9Router until Settings is saved.
            const hydratedState = useSettingsStore.getState();
            await hydratedState.fetchModels(hydratedState.activeProvider);
          }, 0);
        };
      },
    }
  )
);
