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

export interface WhisperRuntimeStatus {
  backend: "cuda" | "vulkan" | "cpu" | string;
  recommended_backend: "cuda" | "vulkan" | "cpu" | string;
  detected_gpu_vendors: string[];
  cuda_driver_available: boolean;
  cuda_server_available: boolean;
  vulkan_server_available: boolean;
  binary_path: string;
  binary_source: string;
}

export const voiceApi = {
  speakText: (text: string) => callCommand<void>("speak_text", { text }),
  stopSpeech: () => callCommand<void>("stop_speech"),
  transcribeAudio: (audio: number[], modelName?: string, forceTranscribe?: boolean, gpuDevice?: number | null) =>
    callCommand<TranscriptionResult>("transcribe_audio", { audio, modelName, forceTranscribe, gpuDevice }),
  transcribeStream: (audio: number[], modelName?: string, gpuDevice?: number | null) =>
    callCommand<TranscriptionResult>("transcribe_stream", { audio, modelName, gpuDevice }),
  listVoiceModels: () => callCommand<VoiceModel[]>("list_voice_models"),
  addVoiceModel: (onnxPath: string, configPath: string) =>
    callCommand<VoiceModel>("add_voice_model", {
      onnxPath,
      configPath,
    }),
  setActiveVoiceModel: (voiceId: string) =>
    callCommand<void>("set_active_voice_model", { voiceId }),
  getWhisperModelStatus: (modelName: string) =>
    callCommand<WhisperModelStatus>("get_whisper_model_status", {
      modelName,
    }),
  getWhisperRuntimeStatus: () =>
    callCommand<WhisperRuntimeStatus>("get_whisper_runtime_status"),
  downloadWhisperModel: (modelName: string) =>
    callCommand<WhisperModelStatus>("download_whisper_model", {
      modelName,
    }),
};
