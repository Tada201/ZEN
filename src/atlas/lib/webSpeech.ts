import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { voiceApi } from '@/api';

/**
 * Speaks text using the appropriate TTS backend.
 *
 * Priority order:
 *  1. Performance override (forceTtsWeb) -> always uses Web Speech API
 *  2. User-selected ttsEngine in Settings:
 *     - 'web'   -> Web Speech API with selected voice / rate / pitch
 *     - 'piper' -> Local Rust Piper via Tauri IPC
 */
export function speakText(text: string): Promise<void> {
    const { ttsEngine } = useSettingsStore.getState();

    if (ttsEngine === 'web') {
        return speakWithWebSpeech(text);
    }

    return voiceApi.speakText(text).catch(console.error) as Promise<void>;
}

/**
 * Stops any active speech — both web and local Piper.
 */
export function stopSpeech(): void {
    const { ttsEngine } = useSettingsStore.getState();

    if (ttsEngine === 'web') {
        window.speechSynthesis?.cancel();
    } else {
        voiceApi.stopSpeech().catch(console.error);
    }
}

/**
 * Returns all available Web Speech API voices, waiting for async population if needed.
 * On some browsers (and Tauri's WebView), getVoices() is empty on first call and
 * populates asynchronously after the 'voiceschanged' event.
 */
export function getWebSpeechVoices(): Promise<SpeechSynthesisVoice[]> {
    return new Promise((resolve) => {
        if (!window.speechSynthesis) { resolve([]); return; }
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) { resolve(voices); return; }
        // Voices not ready yet — wait for event
        const handler = () => {
            resolve(window.speechSynthesis.getVoices());
            window.speechSynthesis.removeEventListener('voiceschanged', handler);
        };
        window.speechSynthesis.addEventListener('voiceschanged', handler);
        // Safety timeout: resolve empty after 3s if event never fires
        setTimeout(() => { resolve(window.speechSynthesis.getVoices()); }, 3000);
    });
}

function speakWithWebSpeech(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!window.speechSynthesis) {
            console.warn('[TTS] Web Speech API not available, falling back to Piper');
            voiceApi.speakText(text).catch(console.error);
            resolve();
            return;
        }

        window.speechSynthesis.cancel();

        const { webTtsVoiceURI, webTtsRate, webTtsPitch } = useSettingsStore.getState();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = webTtsRate ?? 1.0;
        utterance.pitch = webTtsPitch ?? 1.0;
        utterance.volume = 1.0;

        // Apply the user-selected voice if set
        if (webTtsVoiceURI) {
            const voices = window.speechSynthesis.getVoices();
            const match = voices.find(v => v.voiceURI === webTtsVoiceURI);
            if (match) utterance.voice = match;
        }

        utterance.onend = () => resolve();
        utterance.onerror = (e) => {
            console.error('[TTS] Web Speech error:', e);
            reject(e);
        };

        window.speechSynthesis.speak(utterance);
    });
}
