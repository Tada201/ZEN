import { useState, useCallback, useEffect, useRef } from 'react';
import { useUIStore, useSystemStore, useSettingsStore } from '@/atlas/lib/store';
import { type UnlistenFn } from '@tauri-apps/api/event';
import { stopSpeech } from '@/atlas/lib/webSpeech';
import { voiceApi } from '@/api';
import { listenAppEvent } from '@/api/events';
import { stripMarkdown } from './voiceTextUtils';
import { useAppUptime } from '@/hooks/useAppUptime';
import { VoiceModePanel, type VoiceState } from './VoiceModePanel';

const SILENCE_THRESHOLD = 0.015;
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
    const aiSpeaking = useUIStore(s => s.aiSpeaking);
    const setAiSpeaking = useUIStore(s => s.setAiSpeaking);
    const appUptimeSecs = useAppUptime();

    const sttEngine = userSttEngine || 'web';
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

    // YT Closed Caption Subtitle states
    const [subtitleSpeaker, setSubtitleSpeaker] = useState<'user' | 'agent' | 'system'>('system');
    const [userSpeechText, setUserSpeechText] = useState('');
    const [aiSpeechText, setAiSpeechText] = useState('');

    const amplitudeRef = useRef(0);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const rafRef = useRef<number | null>(null);
    const fullAiResponseRef = useRef('');
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);

    const recordingChunksRef = useRef<Float32Array[]>([]);
    const isRecordingRef = useRef(false);
    const heardSpeechRef = useRef(false);
    const silenceStartRef = useRef<number | null>(null);
    const lastBargeInRef = useRef<number>(0);

    const aiSpeakingRef = useRef(aiSpeaking);
    useEffect(() => { aiSpeakingRef.current = aiSpeaking; }, [aiSpeaking]);

    const isOpenRef = useRef(voiceModeOpen);
    isOpenRef.current = voiceModeOpen;

    const voiceInputModeRef = useRef(voiceInputMode);
    voiceInputModeRef.current = voiceInputMode;

    const pttActiveRef = useRef(false);

    const appendLog = useCallback((msg: string, status: 'OK' | 'ERR' = 'OK') => {
        const ts = new Date().toLocaleTimeString();
        setLogLines(prev => [...prev.slice(-49), `[${ts}] ${status === 'ERR' ? '!! ' : '> '}${msg}`]);
    }, []);

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
                setUserSpeechText(result.text.trim());
                setAiSpeechText('');
                setSubtitleSpeaker('user');
                onTranscript(result.text.trim());
            }
        } catch (err) { appendLog(`VAD ERR: ${err}`, 'ERR'); }
        setVoiceState('listening');
    }, [processPCMChunks, appendLog, onTranscript]);

    const setRecordingState = useCallback((recording: boolean) => {
        isRecordingRef.current = recording;
        if (workletNodeRef.current) {
            workletNodeRef.current.port.postMessage({ type: 'SET_RECORDING', value: recording });
        }
    }, []);

    const initMic = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const ctx = new AudioContext();
            audioCtxRef.current = ctx;
            const src = ctx.createMediaStreamSource(stream);
            
            const gain = ctx.createGain();
            gain.gain.value = (voiceInputMode ? 0 : 1);
            gainNodeRef.current = gain;
            
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyserRef.current = analyser;
            
            src.connect(gain);
            gain.connect(analyser);

            try {
                await ctx.audioWorklet.addModule('/vad-processor.js');
                const worklet = new AudioWorkletNode(ctx, 'vad-processor', {
                    processorOptions: { threshold: SILENCE_THRESHOLD, durationMs: SILENCE_DURATION_MS }
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
                appendLog('Worklet failure, falling back to legacy processing...', 'ERR');
                const processor = ctx.createScriptProcessor(4096, 1, 1);
                scriptProcessorRef.current = processor;
                processor.onaudioprocess = (e) => {
                    const input = e.inputBuffer.getChannelData(0);
                    if (isRecordingRef.current) recordingChunksRef.current.push(new Float32Array(input));
                    let sumSq = 0;
                    for (let i = 0; i < input.length; i++) sumSq += input[i] * input[i];
                    const val = Math.min(1, Math.sqrt(sumSq / input.length) * 4);
                    amplitudeRef.current = val;
                    setAmplitude(val);
                };
                analyser.connect(processor);
                processor.connect(ctx.destination);
            }

            setMicStatus('live');
            setVoiceState('listening');
            setSubtitleSpeaker('system');
            if (!voiceInputMode) setRecordingState(true);
            appendLog('Cognitive link established.');
        } catch (err) {
            setMicStatus('error');
            appendLog(`Link failure: ${(err as Error).message}`, 'ERR');
        }
    }, [appendLog, voiceInputMode, sttEngine, setRecordingState, flushVadUtterance]);

    const cleanupAudio = useCallback(() => {
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current.onaudioprocess = null;
            scriptProcessorRef.current = null;
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
                toggleVoiceMode();
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
                    gainNodeRef.current.gain.setTargetAtTime(1, audioCtxRef.current.currentTime, 0.05);
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
    }, [toggleVoiceMode, sttEngine, flushVadUtterance, appendLog, setRecordingState]);

    useEffect(() => {
        if (voiceModeOpen) { 
            setLogLines([]); 
            setAiSpeechText('');
            setUserSpeechText('');
            initMic(); 
        }
        else { cleanupAudio(); }
        return () => cleanupAudio();
    }, [voiceModeOpen, initMic, cleanupAudio]);

    useEffect(() => {
        if (!voiceModeOpen) return;
        const animate = (time: number) => {
            if (document.hidden || !isOpenRef.current) {
                rafRef.current = null;
                return;
            }
            const amp = amplitudeRef.current;
            const currentAiSpeaking = aiSpeakingRef.current;
            if (currentAiSpeaking && amp > SILENCE_THRESHOLD && !pttActiveRef.current) {
                const now = performance.now();
                if (now - lastBargeInRef.current > 400) {
                    stopSpeech();
                    onAbort?.();
                    setAiSpeaking(false);
                    appendLog('Transmission break detected.');
                    lastBargeInRef.current = now;
                }
            }
            if (!currentAiSpeaking && !pttActiveRef.current) {
                if (amp > SILENCE_THRESHOLD) {
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
    }, [voiceModeOpen, voiceInputMode, sttEngine, flushVadUtterance, appendLog, setAiSpeaking]);

    useEffect(() => {
        let unlistens: UnlistenFn[] = [];
        const setup = async () => {
            try {
                unlistens.push(await listenAppEvent('globe:navigate', () => {}));
                unlistens.push(await listenAppEvent('drawing:ops', () => {}));
                unlistens.push(await listenAppEvent('chat:status', (e) => {
                    const m = e.payload.message;
                    if (m?.startsWith('Executing:')) setToolAction(m.replace('Executing: ', '').toUpperCase());
                }));
                unlistens.push(await listenAppEvent('chat:done', () => setToolAction(null)));
                
                unlistens.push(await listenAppEvent('tts:start', () => {
                    setAiSpeaking(true);
                    setSubtitleSpeaker('agent');
                    setUserSpeechText('');
                }));
                
                unlistens.push(await listenAppEvent('tts:stop', () => {
                    setAiSpeaking(false);
                }));

                unlistens.push(await listenAppEvent('chat:partial', () => {
                    if (voiceModeOpen) {
                        const lastMsg = messages[messages.length - 1];
                        if (lastMsg?.role === 'assistant') {
                            fullAiResponseRef.current = stripMarkdown(lastMsg.content);
                            setAiSpeechText(fullAiResponseRef.current);
                            setSubtitleSpeaker('agent');
                            setUserSpeechText('');
                        }
                    }
                }));
            } catch (err) { console.error(err); }
        };
        setup();
        return () => unlistens.forEach(fn => fn());
    }, [messages, voiceModeOpen, setAiSpeaking]);

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
            onClose={toggleVoiceMode}
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
