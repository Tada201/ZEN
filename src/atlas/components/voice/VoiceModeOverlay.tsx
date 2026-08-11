import { useState, useCallback, useEffect, useRef } from 'react';
import { useUIStore, useSystemStore, useSettingsStore } from '@/atlas/lib/store';
import { stopSpeech, TTS_LEVEL_EVENT } from '@/atlas/lib/webSpeech';
import { voiceApi } from '@/api';
import type { WhisperRuntimeStatus } from '@/api/voiceApi';
import { useAppUptime } from '@/hooks/useAppUptime';
import { VoiceModePanel, type VoiceState } from './VoiceModePanel';
import { type VoiceStageInput, useVoiceStageStore } from './voiceStageStore';
import { getTtftMetric, subscribeTtftMetric, type TtftMetricSnapshot } from '@/lib/ttft';
import { useWebSpeechStt } from './useWebSpeechStt';
import { useMoonshineStt } from './useMoonshineStt';
import { useWhisperStt } from './useWhisperStt';
import { useVoiceChatEvents } from './useVoiceChatEvents';
import { usePushToTalk } from './usePushToTalk';
import { useVoiceAudioGraph } from './useVoiceAudioGraph';
import { useVoiceActivityLoop } from './useVoiceActivityLoop';
import { useBoardEventListener } from './useBoardEventListener';
import { useVoiceAgentActivity } from './useVoiceAgentActivity';
import type { SttServiceStatus, TtsServiceStatus } from './voiceStatus';
import { isWebSpeechRecognitionSupported } from '@/lib/voice/webSpeechRecognition';

export function VoiceModeOverlay({
    isOpen,
    onClose,
    onTranscript,
    onAbort,
    messages = [],
    activeModel = '',
    chatId = '',
}: {
    isOpen: boolean, onClose: () => void, onTranscript: (text: string) => void, onAbort?: () => void,
    messages?: any[], activeModel?: string, chatId?: string,
}) {
    const voiceModeOpen = isOpen;
    const toggleVoiceMode = onClose;

    const userSttEngine = useSettingsStore(s => s.sttEngine);
    const sttWhisperModel = useSettingsStore(s => s.sttWhisperModel ?? 'ggml-base.en.bin');
    const sttComputeDevice = useSettingsStore(s => s.sttComputeDevice ?? 'auto');
    const ttsEngine = useSettingsStore(s => s.ttsEngine ?? 'piper');
    const ttsPiperVoiceId = useSettingsStore(s => s.ttsPiperVoiceId ?? 'default');
    const webTtsVoiceURI = useSettingsStore(s => s.webTtsVoiceURI ?? '');
    const voiceInputMode = useSettingsStore(s => s.voiceInputMode);
    const selectedMic = useSettingsStore(s => s.selectedMic ?? '');
    const micVolume = useSettingsStore(s => s.micVolume ?? 0.8);
    const noiseSuppression = useSettingsStore(s => s.noiseSuppression ?? true);
    const echoCancellation = useSettingsStore(s => s.echoCancellation ?? true);
    const autoGainControl = useSettingsStore(s => s.autoGainControl ?? true);
    const vadThreshold = useSettingsStore(s => s.vadThreshold ?? 0.015);
    const aiSpeaking = useUIStore(s => s.aiSpeaking);
    const setAiSpeaking = useUIStore(s => s.setAiSpeaking);
    const resetCurrentStage = useVoiceStageStore(s => s.resetCurrent);
    const startStage = useVoiceStageStore(s => s.start);
    const saveCurrentBoard = useVoiceStageStore(s => s.saveCurrentBoard);
    const cancelStage = useVoiceStageStore(s => s.cancel);
    const upsertStageBlock = useVoiceStageStore(s => s.upsert);
    const appUptimeSecs = useAppUptime();
    const sttEngine = userSttEngine || 'whisper';
    const sttModelLabel = sttEngine === 'whisper'
        ? `Whisper Local · ${sttWhisperModel.replace(/^ggml-|\.bin$/g, '')}`
        : sttEngine === 'web'
            ? 'Web Speech API'
            : sttEngine === 'moonshine'
                ? 'Moonshine Local'
                : sttEngine === 'system'
                    ? 'OS Native Speech'
                    : sttEngine;
    const ttsModelLabel =
        ttsEngine === 'piper'
            ? `Piper ${ttsPiperVoiceId || 'default'}`
            : ttsEngine === 'web'
                ? `Web Speech${webTtsVoiceURI ? ` ${webTtsVoiceURI}` : ''}`
                : ttsEngine;
    const metrics = useSystemStore(s => s.metrics);
    const tokensPerSec = metrics?.throughput || 0;
    const memoryUsage = metrics?.memory || 0;
    const [voiceState, setVoiceState] = useState<VoiceState>('initializing');
    const [logLines, setLogLines] = useState<string[]>([]);
    const [micStatus, setMicStatus] = useState<'inactive' | 'live' | 'error'>('inactive');
    const [sttStatus, setSttStatus] = useState<SttServiceStatus>('idle');
    const [moonshineFallback, setMoonshineFallback] = useState(false);
    const [ttsStatus, setTtsStatus] = useState<TtsServiceStatus>('idle');
    const [toolAction, setToolAction] = useState<string | null>(null);
    const [pttHeld, setPttHeld] = useState(false);
    const [amplitude, setAmplitude] = useState(0);
    const [playbackEnergy, setPlaybackEnergy] = useState(0);
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [exitConfirmationOpen, setExitConfirmationOpen] = useState(false);
    const [ttftMetric, setTtftMetric] = useState<TtftMetricSnapshot | null>(() => chatId ? getTtftMetric(chatId) : null);
    const [whisperRuntime, setWhisperRuntime] = useState<WhisperRuntimeStatus | null>(null);
    const [subtitleSpeaker, setSubtitleSpeaker] = useState<'user' | 'agent' | 'system'>('system');
    const [userSpeechText, setUserSpeechText] = useState('');
    const [aiSpeechText, setAiSpeechText] = useState('');

    const amplitudeRef = useRef(0);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const rafRef = useRef<number | null>(null);
    const fullAiResponseRef = useRef('');
    const lastSpokenResponseRef = useRef('');
    const speakingBackRef = useRef(false);
    const stageGenerationRef = useRef(0);
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const moonshineGateRef = useRef<GainNode | null>(null);
    const moonshineStreamRef = useRef<MediaStream | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const micInitSeqRef = useRef(0);
    const messagesRef = useRef(messages);
    const recordingChunksRef = useRef<Float32Array[]>([]);
    const isRecordingRef = useRef(false);
    const flushingRef = useRef(false);
    const heardSpeechRef = useRef(false);
    const silenceStartRef = useRef<number | null>(null);
    const lastBargeInRef = useRef<number>(0);

    const aiSpeakingRef = useRef(aiSpeaking);
    useEffect(() => { aiSpeakingRef.current = aiSpeaking; }, [aiSpeaking]);
    useEffect(() => { messagesRef.current = messages; }, [messages]);
    useEffect(() => { amplitudeRef.current = amplitude; }, [amplitude]);
    useEffect(() => {
        const onTtsLevel = (event: Event) => {
            const level = (event as CustomEvent<{ level?: number }>).detail?.level;
            setPlaybackEnergy(typeof level === 'number' ? Math.max(0, Math.min(1, level)) : 0);
        };
        window.addEventListener(TTS_LEVEL_EVENT, onTtsLevel);
        return () => window.removeEventListener(TTS_LEVEL_EVENT, onTtsLevel);
    }, []);

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
        const line = `[Voice] ${status === 'ERR' ? 'ERR' : 'OK'} ${msg}`;
        if (status === 'ERR') {
            console.warn(line);
        } else {
            console.info(line);
        }
        setLogLines(prev => [...prev.slice(-49), `[${ts}] ${status === 'ERR' ? '!! ' : '> '}${msg}`]);
    }, []);

    const { startWebRecognition, stopWebRecognition } = useWebSpeechStt({
        appendLog,
        onTranscript,
        setSttStatus,
        setSubtitleSpeaker,
        setUserSpeechText,
    });
    const handleMoonshineFallbackState = useCallback((active: boolean) => {
        if (active && !isWebSpeechRecognitionSupported()) return false;
        setMoonshineFallback(active);
        return true;
    }, []);
    const { moonshineFallbackRef, moonshineReadyRef, startMoonshineRecognition, stopMoonshineRecognition } = useMoonshineStt({
        appendLog,
        onTranscript,
        setSttStatus,
        setSubtitleSpeaker,
        setUserSpeechText,
        setVoiceState,
        onFallbackStateChange: handleMoonshineFallbackState,
    });
    useEffect(() => {
        if (!voiceModeOpen || sttEngine !== 'whisper') {
            setWhisperRuntime(null);
            return;
        }

        let active = true;
        voiceApi.getWhisperRuntimeStatus()
            .then((status) => {
                if (!active) return;
                setWhisperRuntime(status);
                const backend = status.backend.toUpperCase();
                const reason = status.backend === 'cuda' || status.backend === 'vulkan'
                    ? `${backend} server active (${status.binary_source})`
                    : status.recommended_backend !== 'cpu'
                        ? `${status.recommended_backend.toUpperCase()} is recommended for ${status.detected_gpu_vendors.join('/')}, but that runtime is unavailable`
                        : 'No supported GPU runtime detected';
                appendLog(`Whisper backend: ${backend}. ${reason}.`);
            })
            .catch((error) => {
                if (!active) return;
                setWhisperRuntime(null);
                appendLog(`Whisper backend status failed: ${error instanceof Error ? error.message : String(error)}`, 'ERR');
            });

        return () => {
            active = false;
        };
    }, [appendLog, sttEngine, voiceModeOpen]);

    const stopVoiceAudio = useCallback(() => {
        stopSpeech();
        voiceApi.stopSpeech().catch(() => undefined);
        speakingBackRef.current = false;
        setAiSpeaking(false);
        setPlaybackEnergy(0);
    }, [setAiSpeaking]);

    const applyStageBlock = useCallback((block: VoiceStageInput, generation = stageGenerationRef.current) => {
        const state = useVoiceStageStore.getState();
        if (state.generation !== generation) return;
        upsertStageBlock(block);
    }, [upsertStageBlock]);

    const { flushVadUtterance, setRecordingState } = useWhisperStt({
        appendLog,
        applyStageBlock,
        audioCtxRef,
        flushingRef,
        isRecordingRef,
        micVolume,
        onTranscript,
        recordingChunksRef,
        setAiSpeechText,
        setSttStatus,
        setSubtitleSpeaker,
        setUserSpeechText,
        setVoiceState,
        sttComputeDevice,
        sttWhisperModel,
        voiceInputModeRef,
        workletNodeRef,
    });

    const { resetSpokenTracking } = useVoiceChatEvents({
        appendLog,
        chatId,
        fullAiResponseRef,
        isOpenRef,
        lastSpokenResponseRef,
        messagesRef,
        setAiSpeaking,
        setAiSpeechText,
        setTtsStatus,
        setSubtitleSpeaker,
        setToolAction,
        setUserSpeechText,
        speakingBackRef,
        setPlaybackEnergy,
    });

    const hasActiveWork = aiSpeaking || voiceState === 'processing' || voiceState === 'speaking' || Boolean(toolAction);

    const confirmLeaveVoiceMode = useCallback(() => {
        setExitConfirmationOpen(false);
        // Do not stop audio or pause stage here, allowing the voice and agent to keep working in the background.
        stageGenerationRef.current = useVoiceStageStore.getState().generation;
        toggleVoiceMode();
    }, [toggleVoiceMode]);

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

    useEffect(() => {
        const handleRequestClose = () => requestVoiceExit();
        window.addEventListener('request-voice-close', handleRequestClose);
        return () => window.removeEventListener('request-voice-close', handleRequestClose);
    }, [requestVoiceExit]);

    usePushToTalk({
        appendLog,
        audioCtxRef,
        flushVadUtterance,
        gainNodeRef,
        heardSpeechRef,
        isOpenRef,
        moonshineFallbackRef,
        moonshineGateRef,
        moonshineReadyRef,
        moonshineStreamRef,
        pttActiveRef,
        recordingChunksRef,
        requestVoiceExit,
        setAiSpeechText,
        setPttHeld,
        setRecordingState,
        setSttStatus,
        setSubtitleSpeaker,
        setUserSpeechText,
        setVoiceState,
        startMoonshineRecognition,
        startWebRecognition,
        stopWebRecognition,
        streamRef,
        sttEngine,
        sttModelLabel,
        voiceInputModeRef,
        workletNodeRef,
    });

    const { cleanupAudio, initMic } = useVoiceAudioGraph({
        appendLog,
        audioCtxRef,
        analyserRef,
        autoGainControl,
        echoCancellation,
        flushVadUtterance,
        gainNodeRef,
        heardSpeechRef,
        isOpenRef,
        isRecordingRef,
        micInitSeqRef,
        moonshineGateRef,
        moonshineStreamRef,
        noiseSuppression,
        pttActiveRef,
        rafRef,
        recordingChunksRef,
        selectedMic,
        setAiSpeechText,
        setAmplitude,
        setMicStatus,
        setRecordingState,
        setSttStatus,
        setSubtitleSpeaker,
        setUserSpeechText,
        setVoiceState,
        startMoonshineRecognition,
        stopMoonshineRecognition,
        stopWebRecognition,
        streamRef,
        sttEngine,
        vadThreshold,
        voiceInputMode,
        workletNodeRef,
    });

    // Open/close lifecycle: only re-runs when voiceModeOpen flips. Settings
    // changes are handled by the dedicated audio-init effect below so a noise
    // suppression toggle does not tear down the entire overlay state.
    useEffect(() => {
        if (voiceModeOpen) {
            setLogLines([]);
            setSttStatus('starting');
            setTtsStatus('idle');
            setAiSpeechText('');
            setUserSpeechText('');
            fullAiResponseRef.current = '';
            lastSpokenResponseRef.current = '';
            resetSpokenTracking();
            speakingBackRef.current = false;
            setExitConfirmationOpen(false);
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
            if (useVoiceStageStore.getState().document.widgets.length > 0) {
                saveCurrentBoard();
            }
            startStage();
            stageGenerationRef.current = useVoiceStageStore.getState().generation;
            resetCurrentStage();
            stageGenerationRef.current = useVoiceStageStore.getState().generation;
            return;
        }
        cleanupAudio();
        return cleanupAudio;
    }, [voiceModeOpen, cleanupAudio]);

    // Audio init: re-runs whenever the mic graph inputs change. No explicit
    // cleanup — initMic uses micInitSeqRef internally to supersede any in-flight
    // initialization, and cleanupAudio is owned by the lifecycle effect above.
    useEffect(() => {
        if (!voiceModeOpen) return;
        initMic();
    }, [voiceModeOpen, initMic]);

    // Web speech recognition: separate from mic init so toggling between
    // engines does not recreate the entire audio graph.
    useEffect(() => {
        if (!voiceModeOpen || sttEngine !== 'web' || voiceInputMode) return;
        startWebRecognition();
        return () => stopWebRecognition();
    }, [voiceModeOpen, sttEngine, voiceInputMode, startWebRecognition, stopWebRecognition]);

    useEffect(() => {
        if (!voiceModeOpen || ttsEngine !== 'piper') return;
        voiceApi.setActiveVoiceModel(ttsPiperVoiceId || 'default').catch((error) => {
            appendLog(`TTS voice sync failed: ${error instanceof Error ? error.message : String(error)}`, 'ERR');
        });
    }, [appendLog, ttsEngine, ttsPiperVoiceId, voiceModeOpen]);

    useEffect(() => {
        if (!chatId) {
            setTtftMetric(null);
            return;
        }
        setTtftMetric(getTtftMetric(chatId));
        return subscribeTtftMetric((updatedChatId, snapshot) => {
            if (updatedChatId === chatId) {
                setTtftMetric(snapshot);
            }
        });
    }, [chatId]);

    useBoardEventListener(chatId);
    const agentActivity = useVoiceAgentActivity(chatId);

    useVoiceActivityLoop({
        aiSpeakingRef, amplitudeRef, appendLog, flushVadUtterance, flushingRef,
        heardSpeechRef, isOpenRef, lastBargeInRef, onAbort, pttActiveRef, rafRef,
        setRecordingState, setVoiceState, silenceStartRef, stopVoiceAudio, sttEngine,
        vadThresholdRef, voiceInputMode, voiceInputModeRef, voiceModeOpen,
    });

    if (!voiceModeOpen) return null;

    const activeSttEngine = sttEngine === 'moonshine' && moonshineFallback ? 'web' : sttEngine;
    const activeSttModelLabel = moonshineFallback ? 'Web Speech fallback' : sttModelLabel;

    const whisperBackend = activeSttEngine === 'web'
        ? 'browser-os'
        : activeSttEngine === 'system'
            ? 'os-native'
            : sttEngine === 'moonshine'
                ? 'local-cpu'
                : whisperRuntime?.backend ?? 'checking';
    const whisperBackendDetail = whisperRuntime
        ? whisperRuntime.backend === 'cuda' || whisperRuntime.backend === 'vulkan'
            ? `Using ${whisperRuntime.backend.toUpperCase()} whisper-server (${whisperRuntime.binary_source})`
            : whisperRuntime.recommended_backend !== 'cpu'
                ? `Using CPU. ${whisperRuntime.recommended_backend.toUpperCase()} is recommended for ${whisperRuntime.detected_gpu_vendors.join('/')}, but its runtime is not installed.`
                : 'Using CPU whisper-server. No supported GPU runtime was detected.'
        : activeSttEngine === 'whisper'
            ? 'Checking Whisper runtime backend...'
            : activeSttEngine === 'web'
                ? 'Speech recognition is provided by the current WebView browser or its operating-system service.'
                : sttEngine === 'system'
                    ? 'Speech recognition is provided by the operating system.'
                    : 'Moonshine local runtime.';

    return (
        <VoiceModePanel
            activeModel={activeModel}
            agentActivity={agentActivity}
            aiSpeaking={aiSpeaking}
            amplitude={amplitude}
            analyserRef={analyserRef}
            playbackEnergy={playbackEnergy}
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
            sttEngine={activeSttEngine}
            sttModel={activeSttModelLabel}
            sttStatus={sttStatus}
            ttsStatus={ttsStatus}
            subtitleSpeaker={subtitleSpeaker}
            ttftMetric={ttftMetric}
            tokensPerSec={tokensPerSec}
            toolAction={toolAction}
            ttsModel={ttsModelLabel}
            captionsAvailable={activeSttEngine === 'web'}
            pttHeld={pttHeld}
            userSpeechText={userSpeechText}
            aiSpeechText={aiSpeechText}
            voiceInputMode={voiceInputMode}
            voiceModeOpen={voiceModeOpen}
            voiceState={voiceState}
            whisperBackend={whisperBackend}
            whisperBackendDetail={whisperBackendDetail}
        />
    );
}
