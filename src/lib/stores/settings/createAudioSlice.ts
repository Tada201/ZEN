import type { StateCreator } from "zustand";
import type { SettingsState } from "./types";

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

export const createAudioSlice: StateCreator<SettingsState, [], [], AudioSlice> = (set) => ({
  ttsEnabled: false,
  ttsEngine: "piper",
  sttEnabled: false,
  sttEngine: "whisper",
  sttWhisperModel: "base",
  webTtsVoiceURI: "",
  webTtsRate: 1.0,
  webTtsPitch: 1.0,
  soundVolume: 0.8,
  micVolume: 0.8,
  speakerVolume: 0.8,
  audioFeedbackEnabled: true,
  micDeviceId: "",
  speakerDeviceId: "",
  hapticFeedbackEnabled: false,
  voiceInputMode: false,
  notificationSounds: true,
  vadEnabled: false,
  sttHotkeysEnabled: false,
  masterVolume: 0.8,
  isMuted: false,
  webTtsVoice: "",
  sttModel: "base",
  selectedMic: "",
  systemSoundsEnabled: true,

  // Direct set() — immediate state update, not staged
  setForceSttWeb: (val: boolean) => {
    set({ sttEngine: val ? "web" : "whisper" });
  },

  setForceTtsWeb: (val: boolean) => {
    set({ ttsEngine: val ? "web" : "piper" });
  },
});
