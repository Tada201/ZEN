import { useCallback, useRef } from 'react';
import { createWebSpeechRecognition, readWebSpeechResult, type WebSpeechRecognitionLike } from '@/lib/voice/webSpeechRecognition';

interface UseWebSpeechSttOptions {
    appendLog: (msg: string, status?: 'OK' | 'ERR') => void;
    onTranscript: (text: string) => void;
    setSubtitleSpeaker: (speaker: 'user' | 'agent' | 'system') => void;
    setUserSpeechText: (text: string) => void;
    voiceInputModeRef: React.MutableRefObject<boolean>;
}

export function useWebSpeechStt({
    appendLog,
    onTranscript,
    setSubtitleSpeaker,
    setUserSpeechText,
    voiceInputModeRef,
}: UseWebSpeechSttOptions) {
    const recognitionRef = useRef<WebSpeechRecognitionLike | null>(null);
    const activeRef = useRef(false);

    const start = useCallback(() => {
        if (activeRef.current) return true;
        const recognition = recognitionRef.current ?? createWebSpeechRecognition();
        if (!recognition) {
            appendLog('Web Speech API is unavailable in this WebView.', 'ERR');
            setUserSpeechText('Web Speech is not supported on this device.');
            setSubtitleSpeaker('system');
            return false;
        }

        recognitionRef.current = recognition;
        recognition.continuous = !voiceInputModeRef.current;
        recognition.interimResults = true;
        recognition.lang = navigator.language || 'en-US';
        recognition.onresult = (event) => {
            const result = readWebSpeechResult(event);
            if (result.interim) {
                setUserSpeechText(result.interim);
                setSubtitleSpeaker('user');
            }
            if (result.final) {
                setUserSpeechText(result.final);
                setSubtitleSpeaker('user');
                appendLog(`Web Speech: transcript received (${result.final.length} chars).`);
                onTranscript(result.final);
            }
        };
        recognition.onerror = (event) => {
            activeRef.current = false;
            const detail = event.message ? `${event.error}: ${event.message}` : event.error;
            appendLog(`Web Speech ERR: ${detail}`, 'ERR');
            setUserSpeechText(`Speech recognition error: ${event.error}`);
            setSubtitleSpeaker('system');
        };
        recognition.onend = () => {
            activeRef.current = false;
        };

        try {
            recognition.start();
            activeRef.current = true;
            appendLog('Web Speech recognition started.');
            return true;
        } catch (error) {
            appendLog(`Web Speech start failed: ${error instanceof Error ? error.message : String(error)}`, 'ERR');
            return false;
        }
    }, [appendLog, onTranscript, setSubtitleSpeaker, setUserSpeechText, voiceInputModeRef]);

    const stop = useCallback((abort = false) => {
        const recognition = recognitionRef.current;
        if (!recognition || !activeRef.current) return;
        activeRef.current = false;
        if (abort) recognition.abort();
        else recognition.stop();
    }, []);

    return { start, stop };
}
