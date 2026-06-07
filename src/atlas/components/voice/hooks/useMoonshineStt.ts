import { useCallback, useRef } from 'react';
import { createMoonshineRecognition, type MoonshineRecognitionSession } from '@/lib/voice/moonshineRecognition';
import type { VoiceState } from '../VoiceModePanel';

interface UseMoonshineSttOptions {
    appendLog: (msg: string, status?: 'OK' | 'ERR') => void;
    getStream: () => MediaStream | null;
    onTranscript: (text: string) => void;
    setSubtitleSpeaker: (speaker: 'user' | 'agent' | 'system') => void;
    setUserSpeechText: (text: string) => void;
    setVoiceState: (state: VoiceState) => void;
}

export function useMoonshineStt({
    appendLog,
    getStream,
    onTranscript,
    setSubtitleSpeaker,
    setUserSpeechText,
    setVoiceState,
}: UseMoonshineSttOptions) {
    const sessionRef = useRef<MoonshineRecognitionSession | null>(null);
    const startRef = useRef<Promise<void> | null>(null);
    const stopTimerRef = useRef<number | null>(null);
    const readyRef = useRef(false);

    const start = useCallback(async () => {
        const stream = getStream();
        if (!stream) {
            appendLog('Moonshine: microphone pipeline is not ready.', 'ERR');
            return false;
        }
        if (stopTimerRef.current !== null) {
            window.clearTimeout(stopTimerRef.current);
            stopTimerRef.current = null;
        }
        if (startRef.current) {
            await startRef.current;
            return true;
        }

        const startPromise = (async () => {
            if (!sessionRef.current) {
                sessionRef.current = await createMoonshineRecognition({
                    onModelLoading: () => {
                        setVoiceState('initializing');
                        setSubtitleSpeaker('system');
                        setUserSpeechText('Loading Moonshine Tiny...');
                        appendLog('Moonshine: loading local Tiny model and runtime.');
                    },
                    onModelReady: () => appendLog('Moonshine: local Tiny model ready.'),
                    onStarted: () => {
                        readyRef.current = true;
                        setVoiceState('listening');
                        appendLog('Moonshine: recognition started.');
                    },
                    onStopped: () => {
                        readyRef.current = false;
                        appendLog('Moonshine: recognition stopped.');
                    },
                    onInterim: (text) => {
                        if (!text.trim()) return;
                        setSubtitleSpeaker('user');
                        setUserSpeechText(text.trim());
                    },
                    onCommitted: (text) => {
                        const transcript = text.trim();
                        if (!transcript) return;
                        setSubtitleSpeaker('user');
                        setUserSpeechText(transcript);
                        appendLog(`Moonshine: transcript committed (${transcript.length} chars).`);
                        onTranscript(transcript);
                    },
                    onError: (error) => {
                        appendLog(`Moonshine ERR: ${error instanceof Error ? error.message : String(error)}`, 'ERR');
                        setSubtitleSpeaker('system');
                        setUserSpeechText('Moonshine recognition failed.');
                    },
                });
            }
            await sessionRef.current.start(stream);
        })();

        startRef.current = startPromise;
        try {
            await startPromise;
            return true;
        } catch (error) {
            appendLog(`Moonshine start failed: ${error instanceof Error ? error.message : String(error)}`, 'ERR');
            setSubtitleSpeaker('system');
            setUserSpeechText('Moonshine could not start. Check the network for first-use model download.');
            return false;
        } finally {
            startRef.current = null;
        }
    }, [appendLog, getStream, onTranscript, setSubtitleSpeaker, setUserSpeechText, setVoiceState]);

    const stop = useCallback((delayMs = 0) => {
        if (stopTimerRef.current !== null) {
            window.clearTimeout(stopTimerRef.current);
        }
        const stopNow = () => {
            stopTimerRef.current = null;
            sessionRef.current?.stop();
        };
        if (delayMs > 0) stopTimerRef.current = window.setTimeout(stopNow, delayMs);
        else stopNow();
    }, []);

    return { readyRef, start, stop };
}
