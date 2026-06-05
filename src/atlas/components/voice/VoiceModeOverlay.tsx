import { useState, useCallback, useEffect, useRef } from 'react';
import { useUIStore, useSystemStore, useSettingsStore } from '@/atlas/lib/store';
import { type UnlistenFn } from '@tauri-apps/api/event';
import { stopSpeech } from '@/atlas/lib/webSpeech';
import { voiceApi } from '@/api';
import { listenAppEvent } from '@/api/events';
import { stripMarkdown } from './voiceTextUtils';
import { useAppUptime } from '@/hooks/useAppUptime';
import { VoiceModePanel, type VoiceState } from './VoiceModePanel';
import { type VoiceStageInput, useVoiceStageStore } from './voiceStageStore';

const SILENCE_DURATION_MS = 2000;

export function VoiceModeOverlay({
    isOpen,
    onClose,
    onTranscript,
    onAbort,
    messages = [],
    activeModel = ''
}: {
    isOpen: boolean,
    onClose: () => void,
    onTranscript: (text: string) => void,
    onAbort?: () => void,
    messages?: any[],
    activeModel?: string
}) {
    const voiceModeOpen = isOpen;
    const toggleVoiceMode = onClose;
    const userSttEngine = useSettingsStore(s => s.sttEngine);
    const voiceInputMode = useSettingsStore(s => s.voiceInputMode);
    const selectedMic = useSettingsStore(s => s.selectedMic ?? '');
    const micVolume = useSettingsStore(s => s.micVolume ?? 0.8);
    const noiseSuppression = useSettingsStore(s => s.noiseSuppression ?? true);
    const echoCancellation = useSettingsStore(s => s.echoCancellation ?? true);
    const autoGainControl = useSettingsStore(s => s.autoGainControl ?? true);
    const vadThreshold = useSettingsStore(s => s.vadThreshold ?? 0.015);
    const aiSpeaking = useUIStore(s => s.aiSpeaking);
    const setAiSpeaking = useUIStore(s => s.setAiSpeaking);
    const clearStage = useVoiceStageStore(s => s.clear);
    const startStage = useVoiceStageStore(s => s.start);
    const pauseStage = useVoiceStageStore(s => s.pause);
    const cancelStage = useVoiceStageStore(s => s.cancel);
    const upsertStageBlock = useVoiceStageStore(s => s.upsert);
    const appUptimeSecs = useAppUptime();

    const sttEngine = userSttEngine === 'web' ? 'whisper' : (userSttEngine || 'whisper');
    const metrics = useSystemStore(s => s.metrics);

    const tokensPerSec = metrics?.throughput || 0;
    const memoryUsage = metrics?.memory || 0;

    // Redesigned Telemetry and caption states
    const [voiceState, setVoiceState] = useState<VoiceState>('initializing');
    const [logLines, setLogLines] = useState<string[]>([]);
    const [micStatus, setMicStatus] = useState<'inactive' | 'live' | 'error'>('inactive');
    const [toolAction, setToolAction] = useState<string | null>(null);
    const [, setPttHeld] = useState(false);
    const [amplitude, setAmplitude] = useState(0);
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [exitConfirmationOpen, setExitConfirmationOpen] = useState(false);

    // YT Closed Caption Subtitle states
    const [subtitleSpeaker, setSubtitleSpeaker] = useState<'user' | 'agent' | 'system'>('system');
    const [userSpeechText, setUserSpeechText] = useState('');
    const [aiSpeechText, setAiSpeechText] = useState('');

    const amplitudeRef = useRef(0);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const rafRef = useRef<number | null>(null);
    const fullAiResponseRef = useRef('');
    const lastStageAiTextRef = useRef('');
    const stageGenerationRef = useRef(0);
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const micInitSeqRef = useRef(0);
    const messagesRef = useRef(messages);

    const recordingChunksRef = useRef<Float32Array[]>([]);
    const isRecordingRef = useRef(false);
    const heardSpeechRef = useRef(false);
    const silenceStartRef = useRef<number | null>(null);
    const lastBargeInRef = useRef<number>(0);

    const aiSpeakingRef = useRef(aiSpeaking);
    useEffect(() => { aiSpeakingRef.current = aiSpeaking; }, [aiSpeaking]);
    useEffect(() => { messagesRef.current = messages; }, [messages]);

    const isOpenRef = useRef(voiceModeOpen);
    isOpenRef.current = voiceModeOpen;

    const voiceInputModeRef = useRef(voiceInputMode);
    voiceInputModeRef.current = voiceInputMode;

    const vadThresholdRef = useRef(vadThreshold);
    useEffect(() => {
        vadThresholdRef.current = vadThreshold;
        if (workletNodeRef.current) {
            workletNodeRef.current.port.postMessage({ type: 'SET_THRESHOLD', value: vadThreshold });
        }
    }, [vadThreshold]);

    const pttActiveRef = useRef(false);

    const appendLog = useCallback((msg: string, status: 'OK' | 'ERR' = 'OK') => {
        const ts = new Date().toLocaleTimeString();
        setLogLines(prev => [...prev.slice(-49), `[${ts}] ${status === 'ERR' ? '!! ' : '> '}${msg}`]);
    }, []);

    const stopVoiceAudio = useCallback(() => {
        stopSpeech();
        voiceApi.stopSpeech().catch(() => undefined);
        setAiSpeaking(false);
    }, [setAiSpeaking]);

    const applyStageBlock = useCallback((block: VoiceStageInput, generation = stageGenerationRef.current) => {
        const state = useVoiceStageStore.getState();
        if (state.lifecycle !== 'active') return;
        if (state.generation !== generation) return;
        upsertStageBlock(block);
    }, [upsertStageBlock]);

    const hasActiveWork = aiSpeaking || voiceState === 'processing' || voiceState === 'speaking' || Boolean(toolAction);

    const confirmLeaveVoiceMode = useCallback(() => {
        setExitConfirmationOpen(false);
        stopVoiceAudio();
        pauseStage();
        stageGenerationRef.current = useVoiceStageStore.getState().generation;
        toggleVoiceMode();
    }, [pauseStage, stopVoiceAudio, toggleVoiceMode]);

    const confirmStopEverything = useCallback(() => {
        setExitConfirmationOpen(false);
        stopVoiceAudio();
        onAbort?.();
        cancelStage('Voice run stopped by the user. Main chat cancellation was requested.');
        stageGenerationRef.current = useVoiceStageStore.getState().generation;
        toggleVoiceMode();
    }, [cancelStage, onAbort, stopVoiceAudio, toggleVoiceMode]);

    const requestVoiceExit = useCallback(() => {
        if (pttActiveRef.current) {
            appendLog('Cannot close while recording. Release SPACE first.');
            return;
        }
        if (hasActiveWork) {
            setExitConfirmationOpen(true);
            return;
        }
        confirmLeaveVoiceMode();
    }, [appendLog, confirmLeaveVoiceMode, hasActiveWork]);

    const processPCMChunks = useCallback(async (chunks: Float32Array[], nativeSampleRate: number) => {
        if (chunks.length === 0) return null;
        const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
        const merged = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
        const targetRate = 16000;
        let samples16k: Float32Array;
        if (nativeSampleRate !== targetRate) {
            const ratio = nativeSampleRate / targetRate;
            const newLength = Math.floor(totalLength / ratio);
            samples16k = new Float32Array(newLength);
            for (let i = 0; i < newLength; i++) samples16k[i] = merged[Math.floor(i * ratio)];
        } else { samples16k = merged; }
        const pcmBytes = new Uint8Array(samples16k.length * 2);
        const view = new DataView(pcmBytes.buffer);
        for (let i = 0; i < samples16k.length; i++) {
            const clamped = Math.max(-1, Math.min(1, samples16k[i]));
            view.setInt16(i * 2, Math.floor(clamped * 32767), true);
        }
        return Array.from(pcmBytes);
    }, []);

    const flushVadUtterance = useCallback(async () => {
        const chunks = [...recordingChunksRef.current];
        recordingChunksRef.current = [];
        if (chunks.length === 0) return;

        setVoiceState('processing');
        const nativeSampleRate = audioCtxRef.current?.sampleRate || 48000;
        const pcmBytesArray = await processPCMChunks(chunks, nativeSampleRate);
        if (!pcmBytesArray) { setVoiceState('listening'); return; }

        try {
            const result = await voiceApi.transcribeAudio(pcmBytesArray);
            if (result.status === 'Transcript' && result.text?.trim()) {
                const transcriptText = result.text.trim();
                setUserSpeechText(transcriptText);
                setAiSpeechText('');
                setSubtitleSpeaker('user');
                applyStageBlock({
                    id: 'voice-user-turn',
                    kind: 'note',
                    title: 'User turn',
                    body: transcriptText,
                });
                onTranscript(transcriptText);
            }
        } catch (err) { appendLog(`VAD ERR: ${err}`, 'ERR'); }
        setVoiceState('listening');
    }, [processPCMChunks, appendLog, onTranscript, applyStageBlock]);

    const setRecordingState = useCallback((recording: boolean) => {
        isRecordingRef.current = recording;
        if (workletNodeRef.current) {
            workletNodeRef.current.port.postMessage({ type: 'SET_RECORDING', value: recording });
        }
    }, []);

    const initMic = useCallback(async () => {
        const initSeq = ++micInitSeqRef.current;
        try {
            const audioConstraints: MediaTrackConstraints = {
                noiseSuppression,
                echoCancellation,
                autoGainControl,
            };
            if (selectedMic && selectedMic !== 'default') {
                audioConstraints.deviceId = { exact: selectedMic };
            }
            const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
            if (!isOpenRef.current || initSeq !== micInitSeqRef.current) {
                stream.getTracks().forEach(t => t.stop());
                return;
            }
            streamRef.current = stream;
            const ctx = new AudioContext();
            if (!isOpenRef.current || initSeq !== micInitSeqRef.current) {
                stream.getTracks().forEach(t => t.stop());
                ctx.close().catch(() => undefined);
                return;
            }
            audioCtxRef.current = ctx;
            const src = ctx.createMediaStreamSource(stream);
            
            const gain = ctx.createGain();
            gain.gain.value = (voiceInputMode ? 0 : micVolume);
            gainNodeRef.current = gain;
            
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyserRef.current = analyser;
            
            src.connect(gain);
            gain.connect(analyser);

            try {
                await ctx.audioWorklet.addModule('/audio/vad-processor.js');
                if (!isOpenRef.current || initSeq !== micInitSeqRef.current) {
                    stream.getTracks().forEach(t => t.stop());
                    ctx.close().catch(() => undefined);
                    return;
                }
                const worklet = new AudioWorkletNode(ctx, 'vad-processor', {
                    processorOptions: { threshold: vadThreshold, durationMs: SILENCE_DURATION_MS }
                });
                workletNodeRef.current = worklet;
                analyser.connect(worklet);

                worklet.port.onmessage = (e) => {
                    if (e.data.type === 'AMPLITUDE') {
                        amplitudeRef.current = e.data.value;
                        setAmplitude(e.data.value);
                    }
                    if (e.data.type === 'SPEECH_START') {
                        heardSpeechRef.current = true;
                        recordingChunksRef.current = [];
                        setVoiceState('listening');
                        setSubtitleSpeaker('user');
                        setUserSpeechText('User is speaking...');
                        setAiSpeechText('');
                        appendLog('VAD: Speech detected.');
                    }
                    if (e.data.type === 'SPEECH_END') {
                        if (heardSpeechRef.current) {
                            heardSpeechRef.current = false;
                            if (!voiceInputMode && sttEngine === 'whisper') flushVadUtterance();
                            appendLog('VAD: Silence detected.');
                        }
                    }
                    if (e.data.type === 'CHUNK' && isRecordingRef.current) {
                        recordingChunksRef.current.push(e.data.value);
                    }
                };
            } catch (err) {
                appendLog(`VAD link failure: ${(err as Error).message}`, 'ERR');
                setMicStatus('error');
                stream.getTracks().forEach(t => t.stop());
                ctx.close().catch(() => undefined);
                return;
            }

            setMicStatus('live');
            setVoiceState('listening');
            setSubtitleSpeaker('system');
            if (!voiceInputMode) setRecordingState(true);
            appendLog('Cognitive link established.');
        } catch (err) {
            if (!isOpenRef.current || initSeq !== micInitSeqRef.current) return;
            setMicStatus('error');
            appendLog(`Link failure: ${(err as Error).message}`, 'ERR');
        }
    }, [appendLog, voiceInputMode, sttEngine, setRecordingState, flushVadUtterance, selectedMic, micVolume, noiseSuppression, echoCancellation, autoGainControl, vadThreshold]);

    const cleanupAudio = useCallback(() => {
        micInitSeqRef.current += 1;
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        if (workletNodeRef.current) {
            workletNodeRef.current.port.onmessage = null;
            workletNodeRef.current.disconnect();
            workletNodeRef.current = null;
        }
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
            audioCtxRef.current.close().catch(() => { });
        }
        setMicStatus('inactive');
        isRecordingRef.current = false;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }, []);

    useEffect(() => {
        const handleKeys = (e: KeyboardEvent) => {
            if (!isOpenRef.current) return;
            if (e.key === 'Escape') {
                if (pttActiveRef.current) {
                    appendLog('Cannot close while recording. Release SPACE first.');
                    return;
                }
                e.preventDefault();
                requestVoiceExit();
                return;
            }
            if (e.key === ' ' && voiceInputModeRef.current) {
                if (e.repeat) return;
                e.preventDefault();
                pttActiveRef.current = true;
                setRecordingState(true);
                setPttHeld(true);
                setUserSpeechText('Recording...');
                setAiSpeechText('');
                setSubtitleSpeaker('user');
                if (gainNodeRef.current && audioCtxRef.current) {
                    gainNodeRef.current.gain.setTargetAtTime(micVolume, audioCtxRef.current.currentTime, 0.05);
                }
                setVoiceState('listening');
                appendLog('PTT: Recording started');
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (!isOpenRef.current) return;
            if (e.key === ' ' && voiceInputModeRef.current) {
                pttActiveRef.current = false;
                setRecordingState(false);
                setPttHeld(false);
                if (gainNodeRef.current && audioCtxRef.current) {
                    gainNodeRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.05);
                }
                setVoiceState('idle');
                if (sttEngine === 'whisper') {
                    flushVadUtterance();
                    appendLog('PTT: Processing...');
                }
            }
        };

        window.addEventListener('keydown', handleKeys, { capture: true });
        window.addEventListener('keyup', handleKeyUp, { capture: true });
        return () => {
            window.removeEventListener('keydown', handleKeys, { capture: true });
            window.removeEventListener('keyup', handleKeyUp, { capture: true });
        };
    }, [requestVoiceExit, sttEngine, flushVadUtterance, appendLog, setRecordingState]);

    useEffect(() => {
        if (voiceModeOpen) { 
            setLogLines([]); 
            setAiSpeechText('');
            setUserSpeechText('');
            setExitConfirmationOpen(false);
            startStage();
            stageGenerationRef.current = useVoiceStageStore.getState().generation;
            clearStage();
            stageGenerationRef.current = useVoiceStageStore.getState().generation;
            applyStageBlock({
                id: 'voice-stage-contract',
                kind: 'note',
                title: 'Stage protocol',
                body: 'Temporary outline: voice mode content stays inside the dashed blackboard bounds. Supported block types are note, metric, table, chart, equation, code, and map placeholder. Future visual agents should update this area through clear, replace, append, upsert, and focus operations.',
            });
            initMic(); 
        }
        else { cleanupAudio(); }
        return () => cleanupAudio();
    }, [voiceModeOpen, initMic, cleanupAudio, clearStage, startStage, applyStageBlock]);

    useEffect(() => {
        if (!voiceModeOpen) return;
        const animate = (time: number) => {
            if (document.hidden || !isOpenRef.current) {
                rafRef.current = null;
                return;
            }
            const amp = amplitudeRef.current;
            const currentAiSpeaking = aiSpeakingRef.current;
            if (currentAiSpeaking && amp > vadThresholdRef.current && !pttActiveRef.current) {
                const now = performance.now();
                if (now - lastBargeInRef.current > 400) {
                    stopVoiceAudio();
                    onAbort?.();
                    appendLog('Transmission break detected.');
                    lastBargeInRef.current = now;
                }
            }
            if (!currentAiSpeaking && !pttActiveRef.current) {
                if (amp > vadThresholdRef.current) {
                    if (!heardSpeechRef.current) {
                        heardSpeechRef.current = true;
                        setVoiceState('speaking');
                    }
                    silenceStartRef.current = time;
                } else if (heardSpeechRef.current && (time - (silenceStartRef.current || 0) > SILENCE_DURATION_MS)) {
                    heardSpeechRef.current = false;
                    setVoiceState('listening');
                    if (!voiceInputMode && sttEngine === 'whisper') flushVadUtterance();
                }
            } else if (currentAiSpeaking) {
                setVoiceState('speaking');
            }
            rafRef.current = requestAnimationFrame(animate);
        };
        const start = () => {
            if (!rafRef.current && !document.hidden) {
                rafRef.current = requestAnimationFrame(animate);
            }
        };
        const stop = () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
        const handleVisibilityChange = () => {
            if (document.hidden) stop();
            else start();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        start();
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            stop();
        };
    }, [voiceModeOpen, voiceInputMode, sttEngine, flushVadUtterance, appendLog, stopVoiceAudio, onAbort]);

    useEffect(() => {
        let unlistens: UnlistenFn[] = [];
        let disposed = false;
        const setup = async () => {
            try {
                const nextUnlistens = [
                    await listenAppEvent('globe:navigate', () => {}),
                    await listenAppEvent('drawing:ops', () => {}),
                    await listenAppEvent('chat:status', (e) => {
                    const m = e.payload.message;
                    if (m?.startsWith('Executing:')) {
                        const action = m.replace('Executing: ', '').toUpperCase();
                        setToolAction(action);
                        applyStageBlock({
                            id: 'voice-tool-action',
                            kind: 'metric',
                            title: 'Tool action',
                            value: action,
                            detail: 'Running from the main assistant pipeline',
                        });
                    }
                    }),
                    await listenAppEvent('chat:done', () => setToolAction(null)),
                
                    await listenAppEvent('tts:start', () => {
                    setAiSpeaking(true);
                    setSubtitleSpeaker('agent');
                    setUserSpeechText('');
                    }),
                
                    await listenAppEvent('tts:stop', () => {
                    setAiSpeaking(false);
                    }),

                    await listenAppEvent('chat:partial', () => {
                    if (isOpenRef.current) {
                        const currentMessages = messagesRef.current;
                        const lastMsg = currentMessages[currentMessages.length - 1];
                        if (lastMsg?.role === 'assistant') {
                            const stripped = stripMarkdown(lastMsg.content);
                            fullAiResponseRef.current = stripped;
                            setAiSpeechText(fullAiResponseRef.current);
                            setSubtitleSpeaker('agent');
                            setUserSpeechText('');
                            const compact = stripped.trim().slice(0, 900);
                            if (compact && compact !== lastStageAiTextRef.current) {
                                lastStageAiTextRef.current = compact;
                                applyStageBlock({
                                    id: 'voice-assistant-response',
                                    kind: 'note',
                                    title: 'Assistant response',
                                    body: compact,
                                });
                            }
                        }
                    }
                    }),
                ];
                if (disposed) {
                    nextUnlistens.forEach(fn => fn());
                    return;
                }
                unlistens = nextUnlistens;
            } catch (err) { console.error(err); }
        };
        setup();
        return () => {
            disposed = true;
            unlistens.forEach(fn => fn());
            unlistens = [];
        };
    }, [setAiSpeaking, applyStageBlock]);

    if (!voiceModeOpen) return null;

    return (
        <VoiceModePanel
            activeModel={activeModel}
            aiSpeaking={aiSpeaking}
            amplitude={amplitude}
            analyserRef={analyserRef}
            appUptimeSecs={appUptimeSecs}
            logLines={logLines}
            memoryUsage={memoryUsage}
            micStatus={micStatus}
            exitConfirmationOpen={exitConfirmationOpen}
            hasActiveWork={hasActiveWork}
            onCancelExit={() => setExitConfirmationOpen(false)}
            onConfirmLeaveVoice={confirmLeaveVoiceMode}
            onConfirmStopEverything={confirmStopEverything}
            onRequestClose={requestVoiceExit}
            onToggleDiagnostics={() => setShowDiagnostics((value) => !value)}
            showDiagnostics={showDiagnostics}
            sttEngine={sttEngine}
            subtitleSpeaker={subtitleSpeaker}
            tokensPerSec={tokensPerSec}
            toolAction={toolAction}
            userSpeechText={userSpeechText}
            aiSpeechText={aiSpeechText}
            voiceInputMode={voiceInputMode}
            voiceModeOpen={voiceModeOpen}
            voiceState={voiceState}
        />
    );
}
