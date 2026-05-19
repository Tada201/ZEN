import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { useUIStore, useSystemStore, useSettingsStore } from '@/atlas/lib/store';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { VoiceOscilloscope } from './VoiceOscilloscope';
import { motion, AnimatePresence } from 'framer-motion';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { cn } from "@/lib/utils";

// ── Memoized Dashboard Panels ──

const StatusPill = React.memo(({ state }: { state: string }) => (
    <div className={`vm-status-pill vm-status-pill--${state}`}>
        {state.toUpperCase()}
    </div>
));

const DiagnosticPanel = React.memo(({ amplitude, tokensPerSec, activeModel, sttEngine, micStatus, memoryUsage }: any) => (
    <aside className="vm-panel vm-diagnostics">
        <div className="vm-panel-header">
            <div className="flex items-center gap-2"><WorkbenchIcon name="solar:cpu-bold" size={12} /> DIAGNOSTICS</div>
            <WorkbenchIcon name="solar:pulse-bold" size={12} />
        </div>
        <div className="vm-panel-content">
            <div className="vm-kb-stat">
                <label>SIGNAL_STRENGTH</label>
                <div className="vm-kb-progress"><div className="vm-kb-fill" style={{ width: `${Math.min(100, amplitude * 250)}%` }} /></div>
            </div>
            <div className="vm-kb-stat">
                <label>Cognitive_LATENCY (ms)</label>
                <div className="font-mono text-xs">{(tokensPerSec ? (1000 / tokensPerSec).toFixed(0) : '24')}ms</div>
            </div>
            <div className="vm-kb-stat">
                <label>CONTEXT_MEMORY</label>
                <div className="vm-kb-progress"><div className="vm-kb-fill" style={{ width: `${memoryUsage ? Math.min(100, parseFloat(memoryUsage) * 10) : 0}%` }} /></div>
            </div>
            <div className="mt-6 p-4 border border-[#00FF9F]/10 bg-white/5 rounded text-[10px] flex flex-col gap-3">
                <div className="flex justify-between"><span>MIC STATUS</span><span className={micStatus === 'live' ? 'text-[#00FF9F]' : 'text-red-500'}>{String(micStatus).toUpperCase()}</span></div>
                <div className="flex justify-between"><span>STT_ENGINE</span><span>{String(sttEngine).toUpperCase()}</span></div>
                <div className="flex justify-between"><span>ACTIVE_MODEL</span><span className="truncate max-w-[120px]">{activeModel || 'NONE'}</span></div>
            </div>
        </div>
    </aside>
));

const RetrievalPanel = React.memo(({ sources }: { sources: any[] }) => (
    <aside className="vm-panel vm-retrieval">
        <div className="vm-panel-header">
            <div className="flex items-center gap-2"><WorkbenchIcon name="solar:global-bold" size={12} /> ARCHIVE_RETRIEVAL</div>
            <WorkbenchIcon name="solar:magnifer-bold" size={12} />
        </div>
        <div className="vm-panel-content">
            {sources && sources.length > 0 ? sources.map((s, i) => (
                <div key={i} className="vm-source-card">
                    <div className="vm-source-type text-[8px] opacity-60 mb-1">SCORE: {(s.score * 100).toFixed(1)}%</div>
                    <div className="vm-source-type">SOURCE: {s.chunk.source.split(/[\\/]/).pop()}</div>
                    <div className="vm-source-content">{s.chunk.text}</div>
                </div>
            )) : (
                <div className="text-[10px] opacity-30 italic text-center mt-10">No active knowledge context...</div>
            )}
        </div>
    </aside>
));

const LogPanel = React.memo(({ lines }: { lines: string[] }) => (
    <aside className="vm-panel vm-console-logs">
        <div className="vm-panel-header">
            <div className="flex items-center gap-2"><WorkbenchIcon name="solar:terminal-bold" size={12} /> SYSTEM_LOGS</div>
        </div>
        <div className="vm-panel-content">
            <div className="vm-log-list">
                {lines.map((line, i) => (
                    <div key={i} className={`vm-log-entry ${i === lines.length - 1 ? 'vm-log-entry--active' : ''}`}>
                        {line}
                    </div>
                ))}
            </div>
        </div>
    </aside>
));

const ActionPanel = React.memo(({ toolAction, micStatus }: any) => (
    <aside className="vm-panel vm-console-actions">
        <div className="vm-panel-header">
            <div className="flex items-center gap-2"><WorkbenchIcon name="solar:bolt-bold" size={12} /> Cognitive_ACTIONS</div>
            <WorkbenchIcon name="solar:shield-bold" size={12} />
        </div>
        <div className="vm-panel-content flex flex-col justify-center items-center gap-8">
            <AnimatePresence mode="wait">
                {toolAction ? (
                    <motion.div key={toolAction} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="flex flex-col items-center gap-4 text-center">
                        <WorkbenchIcon name="solar:pulse-bold" className="text-orange-500" size={32} />
                        <div className="text-[10px] font-bold tracking-[0.2em]">{toolAction}</div>
                    </motion.div>
                ) : (
                    <motion.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 0.2 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4 text-center">
                        <WorkbenchIcon name="solar:bolt-bold" size={32} />
                        <div className="text-[9px] tracking-widest uppercase">Awaiting instruction...</div>
                    </motion.div>
                )}
            </AnimatePresence>
            <div className="mt-4 w-full px-2">
                <div className="flex justify-between text-[9px] opacity-60 mb-1">
                    <span>SIGNAL_LOCK</span>
                    <span>{micStatus === 'live' ? '88%' : '0%'}</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-[#00FF9F]" style={{ width: micStatus === 'live' ? '88%' : '0%', transition: 'width 2s ease' }}></div>
                </div>
            </div>
        </div>
    </aside>
));

// ── Utils ──

function stripMarkdown(text: string) {
    if (!text) return '';
    const codeBlocks: string[] = [];
    let stripped = text.replace(/```[\s\S]*?```/g, (match) => {
        codeBlocks.push(match.replace(/^```\w*\n?/, '').replace(/\n?```$/, ''));
        return `\x00CB${codeBlocks.length - 1}\x00`;
    });
    stripped = stripped
        .replace(/\[\d+\]/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/#+\s/g, '')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/<.*?>/g, '')
        .replace(/\n/g, ' ')
        .trim();
    stripped = stripped.replace(/\x00CB(\d+)\x00/g, (_, i) => codeBlocks[parseInt(i)]);
    return stripped;
}

type VoiceState = 'initializing' | 'listening' | 'processing' | 'speaking' | 'idle';
const SILENCE_THRESHOLD = 0.015;
const SILENCE_DURATION_MS = 2000;

export function VoiceModeOverlay({ 
    isOpen, 
    onClose, 
    onTranscript,
    messages = [],
    activeModel = ''
}: { 
    isOpen: boolean, 
    onClose: () => void, 
    onTranscript: (text: string) => void,
    messages?: any[],
    activeModel?: string
}) {
    const voiceModeOpen = isOpen;
    const toggleVoiceMode = onClose;
    const userSttEngine = useSettingsStore(s => s.sttEngine);
    const voiceInputMode = useSettingsStore(s => s.voiceInputMode);
    const aiSpeaking = useUIStore(s => s.aiSpeaking);
    const setAiSpeaking = useUIStore(s => s.setAiSpeaking);
    const appUptimeSecs = useUIStore(s => s.appUptimeSecs);

    const sttEngine = userSttEngine || 'web';
    const metrics = useSystemStore(s => s.metrics);

    const tokensPerSec = metrics?.throughput || 0;
    const memoryUsage = metrics?.memory || 0;

    const [voiceState, setVoiceState] = useState<VoiceState>('initializing');
    const [logLines, setLogLines] = useState<string[]>([]);
    const [micStatus, setMicStatus] = useState<'inactive' | 'live' | 'error'>('inactive');
    const [transcript] = useState('');
    const [partialTranscript] = useState('');
    const [toolAction, setToolAction] = useState<string | null>(null);
    const [mapPreview, setMapPreview] = useState<{ lat: number, lon: number, altitude: number, label?: string } | null>(null);
    const [showDrawingPreview, setShowDrawingPreview] = useState(false);
    const [pttHeld, setPttHeld] = useState(false);
    const [amplitude] = useState(0);

    const amplitudeRef = useRef(0);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const rafRef = useRef<number | null>(null);
    const fullAiResponseRef = useRef('');
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);

    const aiTranscriptDomRef = useRef<HTMLDivElement>(null);
    const recordingChunksRef = useRef<Float32Array[]>([]);
    const isRecordingRef = useRef(false);
    const heardSpeechRef = useRef(false);
    const silenceStartRef = useRef<number | null>(null);
    
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
            const result = await invoke<{ status: string, text?: string }>('transcribe_audio', { audio: pcmBytesArray });
            if (result.status === 'Transcript' && result.text?.trim()) {
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
                    if (e.data.type === 'AMPLITUDE') amplitudeRef.current = e.data.value;
                    if (e.data.type === 'SPEECH_START') {
                        heardSpeechRef.current = true;
                        recordingChunksRef.current = [];
                        setVoiceState('listening');
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
                    amplitudeRef.current = Math.min(1, Math.sqrt(sumSq / input.length) * 4);
                };
                analyser.connect(processor);
                processor.connect(ctx.destination);
            }

            setMicStatus('live');
            setVoiceState('listening');
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
        if (voiceModeOpen) { setLogLines([]); initMic(); }
        else { cleanupAudio(); }
        return () => cleanupAudio();
    }, [voiceModeOpen, initMic, cleanupAudio]);

    useEffect(() => {
        if (!voiceModeOpen) return;
        const animate = (time: number) => {
            const amp = amplitudeRef.current;
            const currentAiSpeaking = aiSpeakingRef.current;
            if (currentAiSpeaking && amp > SILENCE_THRESHOLD && !pttActiveRef.current) {
                invoke('stop_speech').catch(() => { });
                setAiSpeaking(false);
                appendLog('Transmission break detected.');
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
        rafRef.current = requestAnimationFrame(animate);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [voiceModeOpen, voiceInputMode, sttEngine, flushVadUtterance, appendLog, setAiSpeaking]);

    useEffect(() => {
        let unlistens: any[] = [];
        const setup = async () => {
            try {
                unlistens.push(await listen<any>('globe:navigate', (e) => { setMapPreview(e.payload); setShowDrawingPreview(false); }));
                unlistens.push(await listen<any>('drawing:ops', () => { setShowDrawingPreview(true); setMapPreview(null); }));
                unlistens.push(await listen<any>('chat:status', (e) => {
                    const m = e.payload.message;
                    if (m.startsWith('Executing:')) setToolAction(m.replace('Executing: ', '').toUpperCase());
                }));
                unlistens.push(await listen('chat:done', () => setToolAction(null)));
                unlistens.push(await listen<any>('tts:start', () => setAiSpeaking(true)));
                unlistens.push(await listen('tts:stop', () => setAiSpeaking(false)));
                unlistens.push(await listen<any>('chat:partial', () => {
                    if (voiceModeOpen && !aiSpeaking) {
                        const lastMsg = messages[messages.length - 1];
                        if (lastMsg?.role === 'assistant') {
                            fullAiResponseRef.current = stripMarkdown(lastMsg.content);
                        }
                        if (aiTranscriptDomRef.current) aiTranscriptDomRef.current.textContent = fullAiResponseRef.current;
                    }
                }));
            } catch (err) { console.error(err); }
        };
        setup();
        return () => unlistens.forEach(fn => fn());
    }, [messages, voiceModeOpen, aiSpeaking, setAiSpeaking]);

    const retrievalSources = useMemo(() => {
        const lastMsg = messages[messages.length - 1];
        return (lastMsg?.role === 'assistant' && lastMsg.context) ? lastMsg.context : [];
    }, [messages]);

    if (!voiceModeOpen) return null;

    return (
        <div className="vm-overlay">
            <div className="vm-backdrop" onClick={toggleVoiceMode} />
            <div className="vm-dashboard">
                <header className="vm-header">
                    <div className="vm-logo-group">
                        <div className="flex items-center gap-3">
                            <WorkbenchIcon name="solar:bolt-bold" className="w-5 h-5 text-[#00FF9F]" />
                            <span className="font-bold tracking-[0.2em] text-[11px] opacity-80">VOICE MODE v2.0</span>
                        </div>
                        <div className="vm-system-status">
                            <span>MODE: {voiceInputMode ? 'PTT' : 'VAD'}</span>
                            <span>MEM: {memoryUsage || '---'}</span>
                            <span>UPTIME: {Math.floor(appUptimeSecs / 60)}M</span>
                            {voiceInputMode && (
                                <span className={cn(pttHeld ? 'text-[#00FF9F] font-bold animate-pulse' : 'text-zinc-600')}>
                                    {pttHeld ? '● TRANSMITTING' : '○ HOLD SPACE'}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        <StatusPill state={voiceState} />
                        <WorkbenchButton onClick={toggleVoiceMode} className="flex items-center gap-2 px-4 py-2 border border-[#00FF9F]/20 text-[10px] tracking-widest hover:border-red-500/50 hover:text-red-500 transition-all">
                            [ CLOSE ]
                        </WorkbenchButton>
                    </div>
                </header>

                <DiagnosticPanel
                    amplitude={amplitude}
                    tokensPerSec={tokensPerSec}
                    activeModel={activeModel}
                    sttEngine={sttEngine}
                    micStatus={micStatus}
                    memoryUsage={memoryUsage}
                />

                <main className="vm-visual-display">
                    <div className="vm-placeholder-text">Waiting for visual data...</div>
                    <div className="vm-preview-overlay">
                        {mapPreview && <div className="vm-map-mini">Map Preview: {mapPreview.label}</div>}
                        {showDrawingPreview && <div className="vm-canvas-mini">Drawing Preview</div>}
                    </div>
                </main>

                <RetrievalPanel sources={retrievalSources} />
                <LogPanel lines={logLines} />

                <section className="vm-console-input">
                    <div className="vm-oscilloscope-container">
                        <VoiceOscilloscope analyserRef={analyserRef} isAiSpeaking={aiSpeaking} isActive={voiceModeOpen} />
                    </div>
                    <div className="vm-transcripts">
                        <div ref={aiTranscriptDomRef} className="vm-ai-response" />
                        {(transcript || partialTranscript) && (
                            <div className="vm-user-transcript">{transcript || partialTranscript}</div>
                        )}
                        {!aiSpeaking && !transcript && !partialTranscript && (
                            <div className="text-[11px] opacity-40 italic tracking-widest">
                                {voiceInputMode ? '[ HOLD SPACE TO TRANSMIT ]' : '[ MONITORING VOICE LINK ]'}
                            </div>
                        )}
                    </div>
                </section>

                <ActionPanel toolAction={toolAction} micStatus={micStatus} />
            </div>
        </div>
    );
}