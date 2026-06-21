interface SpeechRecognitionAlternativeLike {
    transcript: string;
}

interface SpeechRecognitionResultLike {
    readonly isFinal: boolean;
    readonly length: number;
    [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
    readonly resultIndex: number;
    readonly results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike extends Event {
    readonly error: string;
    readonly message?: string;
}

export interface WebSpeechRecognitionLike {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
}

type WebSpeechRecognitionConstructor = new () => WebSpeechRecognitionLike;

interface SpeechRecognitionWindow extends Window {
    SpeechRecognition?: WebSpeechRecognitionConstructor;
    webkitSpeechRecognition?: WebSpeechRecognitionConstructor;
}

export function isWebSpeechRecognitionSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const speechWindow = window as SpeechRecognitionWindow;
    return Boolean(speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition);
}

export function createWebSpeechRecognition(): WebSpeechRecognitionLike | null {
    if (typeof window === 'undefined') return null;
    const speechWindow = window as SpeechRecognitionWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    return Recognition ? new Recognition() : null;
}

export function readWebSpeechResult(event: SpeechRecognitionEventLike) {
    let interim = '';
    let final = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim() ?? '';
        if (!transcript) continue;
        if (result.isFinal) final += `${transcript} `;
        else interim += `${transcript} `;
    }
    return { interim: interim.trim(), final: final.trim() };
}
