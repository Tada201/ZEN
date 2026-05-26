import { callCommand } from "./tauriClient";

export interface TranscriptionResult {
  status: string;
  text?: string;
}

export const voiceApi = {
  speakText: (text: string) => callCommand<void>("speak_text", { text }),
  stopSpeech: () => callCommand<void>("stop_speech"),
  transcribeAudio: (audio: number[]) =>
    callCommand<TranscriptionResult>("transcribe_audio", { audio }),
};
