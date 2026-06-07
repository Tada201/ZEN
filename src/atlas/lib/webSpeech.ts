import { emit as emitTauri } from "@tauri-apps/api/event";
import { voiceApi } from "@/api";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";

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

    utterance.onstart = () => void emitTauri("tts:start", { text });
    utterance.onend = () => {
      void emitTauri("tts:stop", {});
      resolve();
    };
    utterance.onerror = (event) => {
      const error = event.error || "Web Speech synthesis failed";
      void emitTauri("tts:error", { error });
      reject(new Error(error));
    };
    window.speechSynthesis.speak(utterance);
  });
}
