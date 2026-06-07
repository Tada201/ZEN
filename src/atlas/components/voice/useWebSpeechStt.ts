import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
    createWebSpeechRecognition,
    readWebSpeechResult,
    type WebSpeechRecognitionLike,
} from '@/lib/voice/webSpeechRecognition';
import type { SttServiceStatus } from './voiceStatus';

type SubtitleSpeaker = 'user' | 'agent' | 'system';
type AppendVoiceLog = (msg: string, status?: 'OK' | 'ERR') => void;

export function useWebSpeechStt({
    appendLog,
    onTranscript,
    setSttStatus,
    setSubtitleSpeaker,
    setUserSpeechText,
    voiceInputModeRef,
}: {
    appendLog: AppendVoiceLog;
    onTranscript: (text: string) => void;
    setSttStatus: Dispatch<SetStateAction<SttServiceStatus>>;
    setSubtitleSpeaker: Dispatch<SetStateAction<SubtitleSpeaker>>;
    setUserSpeechText: Dispatch<SetStateAction<string>>;
    voiceInputModeRef: MutableRefObject<boolean>;
}) {
    const recognitionRef = useRef<WebSpeechRecognitionLike | null>(null);
    const recognitionActiveRef = useRef(false);

    const startWebRecognition = useCallback(() => {
        if (recognitionActiveRef.current) return true;

        const recognition = recognitionRef.current ?? createWebSpeechRecognition();
        if (!recognition) {
            appendLog('Web Speech API is unavailable in this WebView.', 'ERR');
            setSttStatus('failed');
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
            recognitionActiveRef.current = false;
            const detail = event.message ? `${event.error}: ${event.message}` : event.error;
            appendLog(`Web Speech ERR: ${detail}`, 'ERR');
            setUserSpeechText(`Speech recognition error: ${event.error}`);
            setSubtitleSpeaker('system');
        };
        recognition.onend = () => {
            recognitionActiveRef.current = false;
        };

        try {
            setSttStatus('starting');
            recognition.start();
            recognitionActiveRef.current = true;
            setSttStatus('ready');
            appendLog('Web Speech recognition started.');
            return true;
        } catch (error) {
            setSttStatus('failed');
            appendLog(`Web Speech start failed: ${error instanceof Error ? error.message : String(error)}`, 'ERR');
            return false;
        }
    }, [appendLog, onTranscript, setSttStatus, setSubtitleSpeaker, setUserSpeechText, voiceInputModeRef]);

    const stopWebRecognition = useCallback((abort = false) => {
        const recognition = recognitionRef.current;
        if (!recognition || !recognitionActiveRef.current) return;
        recognitionActiveRef.current = false;
        if (abort) recognition.abort();
        else recognition.stop();
    }, []);

    return { startWebRecognition, stopWebRecognition };
}
