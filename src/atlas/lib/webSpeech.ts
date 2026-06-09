import { emit as emitTauri } from "@tauri-apps/api/event";
import { voiceApi } from "@/api";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";

export const TTS_LEVEL_EVENT = "zen:tts-level";

function emitTtsLevel(level: number): void {
  window.dispatchEvent(new CustomEvent(TTS_LEVEL_EVENT, { detail: { level } }));
}

export function speakText(text: string): Promise<void> {
  const { ttsEngine } = useSettingsStore.getState();
  if (ttsEngine === "web" || ttsEngine === "system") return speakWithWebSpeech(text);
  return voiceApi.speakText(text) as Promise<void>;
}

export function stopSpeech(): void {
  window.speechSynthesis?.cancel();
  voiceApi.stopSpeech().catch(console.error);
}

export function getWebSpeechVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve([]);
      return;
    }
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }
    const handler = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", handler);
    window.setTimeout(() => {
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      resolve(window.speechSynthesis.getVoices());
    }, 3000);
  });
}

function speakWithWebSpeech(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      const error = new Error("Web Speech synthesis is unavailable in this WebView");
      void emitTauri("tts:error", { error: error.message });
      reject(error);
      return;
    }

    window.speechSynthesis.cancel();
    const { webTtsVoiceURI, webTtsRate, webTtsPitch } = useSettingsStore.getState();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = webTtsRate ?? 1;
    utterance.pitch = webTtsPitch ?? 1;
    utterance.volume = 1;

    if (webTtsVoiceURI) {
      const voice = window.speechSynthesis.getVoices().find((candidate) => candidate.voiceURI === webTtsVoiceURI);
      if (voice) utterance.voice = voice;
    }

    utterance.onstart = () => {
      emitTtsLevel(0.45);
      void emitTauri("tts:start", { text });
    };
    utterance.onboundary = (event) => {
      if (event.name && event.name !== "word" && event.name !== "sentence") return;
      const spokenWord = text.slice(event.charIndex, event.charIndex + 18).match(/^\S+/)?.[0] ?? "";
      emitTtsLevel(Math.min(1, 0.35 + spokenWord.length / 18));

      // Calculate sentence bounds for captions
      const before = text.slice(0, event.charIndex);
      const after = text.slice(event.charIndex);
      const lastPunc = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?'));
      const startIdx = lastPunc === -1 ? 0 : lastPunc + 1;
      
      const nextPuncMatch = after.match(/[.!?]/);
      const endIdx = nextPuncMatch && nextPuncMatch.index !== undefined ? event.charIndex + nextPuncMatch.index + 1 : text.length;
      
      const currentSentence = text.slice(startIdx, endIdx).trim();
      if (currentSentence) {
        void emitTauri("tts:caption", { text: currentSentence });
      }
    };
    utterance.onend = () => {
      emitTtsLevel(0);
      void emitTauri("tts:stop", {});
      resolve();
    };
    utterance.onerror = (event) => {
      const error = event.error || "Web Speech synthesis failed";
      emitTtsLevel(0);
      void emitTauri("tts:error", { error });
      reject(new Error(error));
    };
    window.speechSynthesis.speak(utterance);
  });
}
