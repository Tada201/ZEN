export interface WebSpeechCapability {
    recognitionApi: boolean;
    microphoneApi: boolean;
    secureContext: boolean;
    onlineLikelyRequired: boolean;
    supported: boolean;
}

type SpeechRecognitionConstructor = new () => unknown;

interface SpeechRecognitionWindow extends Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

export function detectWebSpeechCapability(): WebSpeechCapability {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return {
            recognitionApi: false,
            microphoneApi: false,
            secureContext: false,
            onlineLikelyRequired: true,
            supported: false,
        };
    }

    const speechWindow = window as SpeechRecognitionWindow;
    const recognitionApi = Boolean(
        speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition,
    );
    const microphoneApi = Boolean(navigator.mediaDevices?.getUserMedia);
    const secureContext = window.isSecureContext || window.location.protocol === 'tauri:';

    return {
        recognitionApi,
        microphoneApi,
        secureContext,
        onlineLikelyRequired: true,
        supported: recognitionApi && microphoneApi && secureContext,
    };
}
