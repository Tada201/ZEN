import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
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
}: {
    appendLog: AppendVoiceLog;
    onTranscript: (text: string) => void;
    setSttStatus: Dispatch<SetStateAction<SttServiceStatus>>;
    setSubtitleSpeaker: Dispatch<SetStateAction<SubtitleSpeaker>>;
    setUserSpeechText: Dispatch<SetStateAction<string>>;
}) {
    const recognitionRef = useRef<WebSpeechRecognitionLike | null>(null);
    const recognitionActiveRef = useRef(false);
    const restartTimerRef = useRef<number | null>(null);
    const shouldRunRef = useRef(false);
    const finalTranscriptRef = useRef('');
    const interimTranscriptRef = useRef('');

    const commitTranscript = useCallback(() => {
        const transcript = `${finalTranscriptRef.current} ${interimTranscriptRef.current}`.trim();
        finalTranscriptRef.current = '';
        interimTranscriptRef.current = '';
        if (!transcript) {
            setSttStatus('ready');
            setUserSpeechText('No speech detected.');
            setSubtitleSpeaker('system');
            return;
        }
        setUserSpeechText(transcript);
        setSubtitleSpeaker('user');
        setSttStatus('ready');
        appendLog(`Web Speech: transcript received (${transcript.length} chars).`);
        onTranscript(transcript);
    }, [appendLog, onTranscript, setSttStatus, setSubtitleSpeaker, setUserSpeechText]);

    const startWebRecognition = useCallback(() => {
        shouldRunRef.current = true;
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
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = navigator.language || 'en-US';
        finalTranscriptRef.current = '';
        interimTranscriptRef.current = '';
        recognition.onresult = (event) => {
            const result = readWebSpeechResult(event);
            if (result.final) {
                finalTranscriptRef.current = `${finalTranscriptRef.current} ${result.final}`.trim();
            }
            interimTranscriptRef.current = result.interim;
            const preview = `${finalTranscriptRef.current} ${interimTranscriptRef.current}`.trim();
            if (preview) setUserSpeechText(preview);
            setSubtitleSpeaker('user');
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
            if (shouldRunRef.current) {
                restartTimerRef.current = window.setTimeout(() => {
                    restartTimerRef.current = null;
                    if (shouldRunRef.current && !recognitionActiveRef.current) {
                        try {
                            recognition.start();
                            recognitionActiveRef.current = true;
                            setSttStatus('ready');
                        } catch (error) {
                            setSttStatus('failed');
                            appendLog(`Web Speech restart failed: ${error instanceof Error ? error.message : String(error)}`, 'ERR');
                        }
                    }
                }, 100);
            } else {
                commitTranscript();
            }
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
    }, [appendLog, commitTranscript, setSttStatus, setSubtitleSpeaker, setUserSpeechText]);

    const stopWebRecognition = useCallback((abort = false) => {
        shouldRunRef.current = false;
        // Cancel any pending auto-restart timer
        if (restartTimerRef.current !== null) {
            window.clearTimeout(restartTimerRef.current);
            restartTimerRef.current = null;
        }
        const recognition = recognitionRef.current;
        if (!recognition || !recognitionActiveRef.current) {
            if (!abort) commitTranscript();
            return;
        }
        recognitionActiveRef.current = false;
        if (abort) {
            finalTranscriptRef.current = '';
            interimTranscriptRef.current = '';
            recognition.abort();
        }
        else recognition.stop();
    }, [commitTranscript]);

    return { startWebRecognition, stopWebRecognition };
}
