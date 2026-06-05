import { callCommand } from "./tauriClient";

export interface TranscriptionResult {
  status: "NoSpeech" | "Transcript" | string;
  text?: string;
}

export interface VoiceModel {
  id: string;
  name: string;
  path: string;
  is_default: boolean;
}

export interface WhisperModelStatus {
  exists: boolean;
  valid: boolean;
  size_bytes: number;
  path: string;
  source: "bundled" | "downloaded" | "none" | string;
  error: string | null;
}

export const voiceApi = {
  speakText: (text: string) => callCommand<void>("speak_text", { text }),
  stopSpeech: () => callCommand<void>("stop_speech"),
  transcribeAudio: (audio: number[]) =>
    callCommand<TranscriptionResult>("transcribe_audio", { audio }),
  transcribeStream: (audio: number[]) =>
    callCommand<TranscriptionResult>("transcribe_stream", { audio }),
  listVoiceModels: () => callCommand<VoiceModel[]>("list_voice_models"),
  addVoiceModel: (onnxPath: string, configPath: string) =>
    callCommand<VoiceModel>("add_voice_model", {
      onnxPath,
      configPath,
    }),
  setActiveVoiceModel: (voiceId: string) =>
    callCommand<void>("set_active_voice_model", { voiceId }),
  downloadWhisperModel: (modelName: string) =>
    callCommand<WhisperModelStatus>("download_whisper_model", {
      modelName,
    }),
};
