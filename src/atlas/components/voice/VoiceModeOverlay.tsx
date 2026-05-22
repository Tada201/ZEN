import { useState, useCallback, useEffect, useRef } from 'react';
import { useUIStore, useSystemStore, useSettingsStore } from '@/atlas/lib/store';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { VoiceOscilloscope } from './VoiceOscilloscope';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from "@/lib/utils";
import { Mic, X, Terminal, Cpu, Sparkles, Volume2 } from 'lucide-react';
import { stopSpeech } from '@/atlas/lib/webSpeech';

// Utility helper to strip markdown for clean subtitles
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
    const appUptimeSecs = useUIStore(s => s.appUptimeSecs);

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
            const result = await invoke<{ status: string, text?: string }>('transcribe_audio', { audio: pcmBytesArray });
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
        rafRef.current = requestAnimationFrame(animate);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [voiceModeOpen, voiceInputMode, sttEngine, flushVadUtterance, appendLog, setAiSpeaking]);

    useEffect(() => {
        let unlistens: any[] = [];
        const setup = async () => {
            try {
                unlistens.push(await listen<any>('globe:navigate', () => {}));
                unlistens.push(await listen<any>('drawing:ops', () => {}));
                unlistens.push(await listen<any>('chat:status', (e) => {
                    const m = e.payload.message;
                    if (m.startsWith('Executing:')) setToolAction(m.replace('Executing: ', '').toUpperCase());
                }));
                unlistens.push(await listen('chat:done', () => setToolAction(null)));
                
                unlistens.push(await listen<any>('tts:start', () => {
                    setAiSpeaking(true);
                    setSubtitleSpeaker('agent');
                    setUserSpeechText('');
                }));
                
                unlistens.push(await listen('tts:stop', () => {
                    setAiSpeaking(false);
                }));

                unlistens.push(await listen<any>('chat:partial', () => {
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

    // UI Status definitions
    const stateColors = {
        initializing: 'text-amber-400 bg-amber-400/10 border-amber-500/20',
        listening: 'text-purple-400 bg-purple-400/10 border-purple-500/20',
        processing: 'text-blue-400 bg-blue-400/10 border-blue-500/20',
        speaking: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20',
        idle: 'text-zinc-400 bg-zinc-400/10 border-zinc-500/20',
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-2xl transition-all duration-300">
            {/* Ambient Background Glow Orb */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-gradient-to-tr from-purple-500/10 to-cyan-500/10 blur-[80px] pointer-events-none animate-pulse duration-[8000ms]" />
            
            {/* Main Floating Glass Capsule Card */}
            <div className="relative w-full max-w-lg bg-white/[0.02] dark:bg-black/35 backdrop-blur-xl border border-white/10 dark:border-white/5 rounded-3xl p-8 shadow-[0_24px_80px_rgba(0,0,0,0.5)] flex flex-col items-center gap-8 overflow-hidden transition-all duration-300">
                
                {/* Header Top Bar */}
                <header className="w-full flex items-center justify-between z-10 border-b border-white/5 pb-4">
                    <div className="flex items-center gap-3">
                        <Mic className="w-4 h-4 text-[#00FF9F]" />
                        <span className="font-mono font-bold tracking-[0.25em] text-[10px] text-zinc-400 uppercase">Voice Mode v2.0</span>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Dynamic Status Pill */}
                        <div className={cn("text-[9px] font-bold tracking-widest px-2.5 py-0.5 rounded border uppercase transition-colors duration-200", stateColors[voiceState])}>
                            {voiceState}
                        </div>

                        {/* Collapsible Diagnostics Toggle */}
                        <button 
                            onClick={() => setShowDiagnostics(!showDiagnostics)}
                            className="p-1 rounded bg-white/5 border border-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                            title="Diagnostics Console"
                        >
                            <Terminal size={13} />
                        </button>

                        {/* Custom Rounded Close Button */}
                        <button 
                            onClick={toggleVoiceMode}
                            className="p-1 rounded-full bg-white/5 border border-white/10 hover:bg-red-500/20 hover:border-red-500/30 text-zinc-400 hover:text-red-400 transition-all"
                            title="Close Overlay"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </header>

                {/* Minimal Telemetry Ribbon */}
                <div className="w-full flex justify-between items-center px-2 py-1 text-[9px] font-mono text-zinc-500 z-10">
                    <span>MODE: {voiceInputMode ? 'PUSH-TO-TALK' : 'VAD'}</span>
                    <span className="truncate max-w-[150px]">SYS: {activeModel || 'Zen Core'}</span>
                    <span>MEM: {memoryUsage ? `${Number(memoryUsage).toFixed(1)}GB` : '---'}</span>
                </div>

                {/* Visualizer Core Area */}
                <div className="relative w-full h-32 flex items-center justify-center my-4 overflow-visible z-10">
                    <div className="absolute inset-0 bg-radial-gradient from-[#06b6d4]/5 to-transparent blur-md pointer-events-none" />
                    <VoiceOscilloscope analyserRef={analyserRef} isAiSpeaking={aiSpeaking} isActive={voiceModeOpen} />
                </div>

                {/* Cognitive Actions HUD overlay inside capsule */}
                <AnimatePresence mode="wait">
                    {toolAction && (
                        <motion.div 
                            initial={{ opacity: 0, y: -4 }} 
                            animate={{ opacity: 1, y: 0 }} 
                            exit={{ opacity: 0, y: -4 }} 
                            className="flex items-center gap-2 px-3 py-1 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400 font-mono text-[9px] tracking-wider uppercase animate-pulse"
                        >
                            <Sparkles size={10} />
                            <span>AGENT ACTION: {toolAction}</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Double Panel details (Visible when diagnostics is toggled) */}
                <AnimatePresence>
                    {showDiagnostics && (
                        <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="w-full bg-[#05060b]/80 border border-white/5 rounded-xl p-4 overflow-hidden text-[9px] font-mono text-zinc-400 flex flex-col gap-3 z-10"
                        >
                            <div className="flex justify-between items-center text-zinc-500 border-b border-white/5 pb-1">
                                <span className="flex items-center gap-1.5"><Cpu size={10} /> TELEMETRY DIAGNOSTICS</span>
                                <span>UPTIME: {Math.floor(appUptimeSecs / 60)}M {appUptimeSecs % 60}S</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                                <div className="flex justify-between"><span>STT_ENGINE</span><span className="text-white">{sttEngine.toUpperCase()}</span></div>
                                <div className="flex justify-between"><span>LINK STATUS</span><span className={micStatus === 'live' ? 'text-emerald-400 font-bold' : 'text-red-400'}>{micStatus.toUpperCase()}</span></div>
                                <div className="flex justify-between"><span>AMP SIGNAL</span><span className="text-white">{Math.min(100, Math.floor(amplitude * 250))}%</span></div>
                                <div className="flex justify-between"><span>LATENCY</span><span className="text-white">{tokensPerSec ? `${(1000 / tokensPerSec).toFixed(0)}ms` : '24ms'}</span></div>
                            </div>
                            <div className="h-px bg-white/5 my-1" />
                            <div className="flex flex-col gap-1 max-h-16 overflow-y-auto pr-1">
                                {logLines.slice(-3).map((l, i) => <div key={i} className="truncate text-zinc-500">{l}</div>)}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* VAD / PTT Toggle Control */}
                <div className="w-full flex items-center justify-between border-t border-white/5 pt-4 text-[10px] text-zinc-500 z-10">
                    <span className="flex items-center gap-1"><Volume2 size={12} /> Master Link Volume</span>
                    <span className="font-mono text-zinc-300">80%</span>
                </div>
            </div>

            {/* YouTube-style Closed Captioning Subtitle Box */}
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-full max-w-xl px-6 z-40 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="bg-[#0c0d14]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl flex items-start gap-3.5 transition-all duration-200">
                    
                    {/* Color-Coded Speaker Pill Tag */}
                    {subtitleSpeaker === 'user' && (
                        <span className="shrink-0 text-[9px] font-extrabold tracking-widest px-2.5 py-0.5 rounded border border-purple-500/30 bg-purple-500/10 text-purple-400 select-none uppercase">
                            YOU
                        </span>
                    )}
                    {subtitleSpeaker === 'agent' && (
                        <span className="shrink-0 text-[9px] font-extrabold tracking-widest px-2.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 select-none uppercase">
                            ZEN
                        </span>
                    )}
                    {subtitleSpeaker === 'system' && (
                        <span className="shrink-0 text-[9px] font-extrabold tracking-widest px-2.5 py-0.5 rounded border border-zinc-500/30 bg-zinc-500/10 text-zinc-400 select-none uppercase">
                            SYS
                        </span>
                    )}

                    {/* Subtitle speech text */}
                    <p className={cn(
                        "text-[13px] font-semibold leading-relaxed flex-1 text-left select-none transition-colors duration-200",
                        subtitleSpeaker === 'user' 
                            ? "text-purple-100/90" 
                            : subtitleSpeaker === 'agent' 
                                ? "text-emerald-100/90" 
                                : "text-zinc-500 italic"
                    )}>
                        {subtitleSpeaker === 'user' 
                            ? (userSpeechText || 'Listening for speech...') 
                            : subtitleSpeaker === 'agent' 
                                ? (aiSpeechText || 'Responding...') 
                                : 'Voice link established. Monitoring channel...'}
                    </p>
                </div>
            </div>
        </div>
    );
}