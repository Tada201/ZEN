import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { createMoonshineRecognition, type MoonshineRecognitionSession } from '@/lib/voice/moonshineRecognition';
import type { VoiceState } from './VoiceModePanel';
import type { SttServiceStatus } from './voiceStatus';

type SubtitleSpeaker = 'user' | 'agent' | 'system';
type AppendVoiceLog = (msg: string, status?: 'OK' | 'ERR') => void;

export function useMoonshineStt({
    appendLog,
    onTranscript,
    setSttStatus,
    setSubtitleSpeaker,
    setUserSpeechText,
    setVoiceState,
}: {
    appendLog: AppendVoiceLog;
    onTranscript: (text: string) => void;
    setSttStatus: Dispatch<SetStateAction<SttServiceStatus>>;
    setSubtitleSpeaker: Dispatch<SetStateAction<SubtitleSpeaker>>;
    setUserSpeechText: Dispatch<SetStateAction<string>>;
    setVoiceState: Dispatch<SetStateAction<VoiceState>>;
}) {
    const sessionRef = useRef<MoonshineRecognitionSession | null>(null);
    const startRef = useRef<Promise<void> | null>(null);
    const stopTimerRef = useRef<number | null>(null);
    const moonshineReadyRef = useRef(false);

    const startMoonshineRecognition = useCallback(async (stream: MediaStream | null | undefined) => {
        if (!stream) {
            appendLog('Moonshine: microphone pipeline is not ready.', 'ERR');
            setSttStatus('failed');
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
                        setSttStatus('starting');
                        setVoiceState('initializing');
                        setSubtitleSpeaker('system');
                        setUserSpeechText('Loading Moonshine Tiny...');
                        appendLog('Moonshine: loading local Tiny model and runtime.');
                    },
                    onModelReady: () => appendLog('Moonshine: local Tiny model ready.'),
                    onStarted: () => {
                        moonshineReadyRef.current = true;
                        setSttStatus('ready');
                        setVoiceState('listening');
                        appendLog('Moonshine: recognition started.');
                    },
                    onStopped: () => {
                        moonshineReadyRef.current = false;
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
                        setSttStatus('failed');
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
            setSttStatus('failed');
            appendLog(`Moonshine start failed: ${error instanceof Error ? error.message : String(error)}`, 'ERR');
            setSubtitleSpeaker('system');
            setUserSpeechText('Moonshine could not start. Check the network for first-use model download.');
            return false;
        } finally {
            startRef.current = null;
        }
    }, [appendLog, onTranscript, setSttStatus, setSubtitleSpeaker, setUserSpeechText, setVoiceState]);

    const stopMoonshineRecognition = useCallback((delayMs = 0) => {
        if (stopTimerRef.current !== null) {
            window.clearTimeout(stopTimerRef.current);
        }
        const stop = () => {
            stopTimerRef.current = null;
            sessionRef.current?.stop();
        };
        if (delayMs > 0) stopTimerRef.current = window.setTimeout(stop, delayMs);
        else stop();
    }, []);

    // Clean up session on unmount to prevent WASM transcriber from leaking CPU
    useEffect(() => {
        return () => {
            if (stopTimerRef.current !== null) {
                window.clearTimeout(stopTimerRef.current);
            }
            sessionRef.current?.stop();
            sessionRef.current = null;
            moonshineReadyRef.current = false;
        };
    }, []);

    return { moonshineReadyRef, startMoonshineRecognition, stopMoonshineRecognition };
}
