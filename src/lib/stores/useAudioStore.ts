import { create } from 'zustand';
import { useSettingsStore } from './useSettingsStore';

interface AudioState {
  isInitialized: boolean;
  masterVolume: number; // 0 to 1
  isMuted: boolean;
  enabled: boolean;

  // Actions
  initialize: () => void;
  setMasterVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  setEnabled: (enabled: boolean) => void;
  syncWithSettings: () => void;
}

/**
 * useAudioStore manages the high-level audio lifecycle and user preferences.
 * It synchronizes with the persistent useSettingsStore.
 */
export const useAudioStore = create<AudioState>((set, get) => ({
  isInitialized: false,
  masterVolume: 0.25,
  isMuted: false,
  enabled: true,

  initialize: () => {
    if (get().isInitialized) return;

    // Sync initial state from persistence
    const settings = useSettingsStore.getState();
    set({
      masterVolume: settings.soundVolume / 100,
      isMuted: !settings.audioFeedbackEnabled,
      enabled: settings.audioFeedbackEnabled,
      isInitialized: true,
    });
  },

  setMasterVolume: (volume) => {
    set({ masterVolume: volume });
    // Push to persistence
    useSettingsStore.getState().updateSetting({ soundVolume: Math.round(volume * 100) });
  },

  setMuted: (muted) => {
    set({ isMuted: muted });
  },

  setEnabled: (enabled) => {
    set({ enabled: enabled, isMuted: !enabled });
    useSettingsStore.getState().updateSetting({ audioFeedbackEnabled: enabled });
  },

  syncWithSettings: () => {
    const settings = useSettingsStore.getState();
    set({
      masterVolume: settings.soundVolume / 100,
      enabled: settings.audioFeedbackEnabled,
      isMuted: !settings.audioFeedbackEnabled,
    });
  }
}));

// Auto-sync on settings changes
useSettingsStore.subscribe(() => {
  useAudioStore.getState().syncWithSettings();
});