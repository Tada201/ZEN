import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { VoiceState } from './VoiceModePanel';
import { getVoiceInputStream } from './voiceInputStream';
import type { SttServiceStatus } from './voiceStatus';

const SILENCE_DURATION_MS = 2000;

type SubtitleSpeaker = 'user' | 'agent' | 'system';
type AppendVoiceLog = (msg: string, status?: 'OK' | 'ERR') => void;

export function useVoiceAudioGraph({
    appendLog, autoGainControl, echoCancellation, flushVadUtterance, isOpenRef, micInitSeqRef, moonshineGateRef,
    moonshineStreamRef, noiseSuppression, pttActiveRef, selectedMic, setAiSpeechText, setAmplitude, setMicStatus,
    setRecordingState, setSttStatus, setSubtitleSpeaker, setUserSpeechText, setVoiceState, startMoonshineRecognition,
    stopMoonshineRecognition, stopWebRecognition, sttEngine, streamRef, vadThreshold, voiceInputMode,
    audioCtxRef, analyserRef, gainNodeRef, heardSpeechRef, isRecordingRef, rafRef, recordingChunksRef, workletNodeRef,
}: {
    appendLog: AppendVoiceLog; flushVadUtterance: () => Promise<void>; setRecordingState: (recording: boolean) => void;
    startMoonshineRecognition: (stream: MediaStream | null | undefined) => Promise<boolean>; stopMoonshineRecognition: () => void; stopWebRecognition: (abort?: boolean) => void;
    autoGainControl: boolean; echoCancellation: boolean; noiseSuppression: boolean; selectedMic: string; sttEngine: string; vadThreshold: number; voiceInputMode: boolean;
    setAiSpeechText: Dispatch<SetStateAction<string>>; setAmplitude: Dispatch<SetStateAction<number>>; setMicStatus: Dispatch<SetStateAction<'inactive' | 'live' | 'error'>>;
    setSttStatus: Dispatch<SetStateAction<SttServiceStatus>>;
    setSubtitleSpeaker: Dispatch<SetStateAction<SubtitleSpeaker>>; setUserSpeechText: Dispatch<SetStateAction<string>>; setVoiceState: Dispatch<SetStateAction<VoiceState>>;
    audioCtxRef: MutableRefObject<AudioContext | null>; analyserRef: MutableRefObject<AnalyserNode | null>; gainNodeRef: MutableRefObject<GainNode | null>;
    heardSpeechRef: MutableRefObject<boolean>; isOpenRef: MutableRefObject<boolean>; isRecordingRef: MutableRefObject<boolean>; micInitSeqRef: MutableRefObject<number>;
    moonshineGateRef: MutableRefObject<GainNode | null>; moonshineStreamRef: MutableRefObject<MediaStream | null>; pttActiveRef: MutableRefObject<boolean>;
    rafRef: MutableRefObject<number | null>; recordingChunksRef: MutableRefObject<Float32Array[]>; streamRef: MutableRefObject<MediaStream | null>; workletNodeRef: MutableRefObject<AudioWorkletNode | null>;
}) {
    const initMic = useCallback(async () => {
        const initSeq = ++micInitSeqRef.current;
        setSttStatus('starting');
        try {
            const stream = await getVoiceInputStream({ appendLog, autoGainControl, echoCancellation, noiseSuppression, selectedMic });
            if (!isOpenRef.current || initSeq !== micInitSeqRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
            streamRef.current = stream;
            const ctx = new AudioContext();
            if (!isOpenRef.current || initSeq !== micInitSeqRef.current) {
                stream.getTracks().forEach((track) => track.stop());
                ctx.close().catch(() => undefined);
                return;
            }
            audioCtxRef.current = ctx;
            const src = ctx.createMediaStreamSource(stream);
            const gain = ctx.createGain();
            gain.gain.value = 1;
            gainNodeRef.current = gain;
            const moonshineGate = ctx.createGain();
            moonshineGate.gain.value = voiceInputMode && sttEngine === 'moonshine' ? 0 : 1;
            moonshineGateRef.current = moonshineGate;
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyserRef.current = analyser;
            src.connect(gain);
            gain.connect(analyser);
            src.connect(moonshineGate);
            const moonshineDestination = ctx.createMediaStreamDestination();
            moonshineGate.connect(moonshineDestination);
            moonshineStreamRef.current = moonshineDestination.stream;
            try {
                await ctx.audioWorklet.addModule('/audio/vad-processor.js');
                if (!isOpenRef.current || initSeq !== micInitSeqRef.current) {
                    stream.getTracks().forEach((track) => track.stop());
                    ctx.close().catch(() => undefined);
                    return;
                }
                const worklet = new AudioWorkletNode(ctx, 'vad-processor', { processorOptions: { threshold: vadThreshold, durationMs: SILENCE_DURATION_MS } });
                workletNodeRef.current = worklet;
                analyser.connect(worklet);
                worklet.port.onmessage = (e) => {
                    if (e.data.type === 'AMPLITUDE') { setAmplitude(e.data.value); }
                    if (e.data.type === 'SPEECH_START') {
                        heardSpeechRef.current = true;
                        setVoiceState('listening');
                        setSubtitleSpeaker('user');
                        setUserSpeechText('User is speaking...');
                        setAiSpeechText('');
                        appendLog('VAD: Speech detected.');
                    }
                    if (e.data.type === 'SPEECH_END' && heardSpeechRef.current) {
                        heardSpeechRef.current = false;
                        if (!voiceInputMode && sttEngine === 'whisper') void flushVadUtterance();
                        appendLog('VAD: Silence detected.');
                    }
                    if (e.data.type === 'CHUNK' && isRecordingRef.current) {
                        recordingChunksRef.current.push(e.data.value);
                        if (!heardSpeechRef.current && !pttActiveRef.current && recordingChunksRef.current.length > 100) recordingChunksRef.current.shift();
                    }
                };
            } catch (err) {
                appendLog(`VAD link failure: ${(err as Error).message}`, 'ERR');
                setMicStatus('error');
                setSttStatus('failed');
                stream.getTracks().forEach((track) => track.stop());
                ctx.close().catch(() => undefined);
                return;
            }
            setMicStatus('live');
            setSttStatus('ready');
            setVoiceState('listening');
            setSubtitleSpeaker('system');
            if (!voiceInputMode && sttEngine === 'whisper') setRecordingState(true);
            if (sttEngine === 'moonshine') void startMoonshineRecognition(moonshineStreamRef.current ?? streamRef.current);
            appendLog('Cognitive link established.');
        } catch (err) {
            if (!isOpenRef.current || initSeq !== micInitSeqRef.current) return;
            setMicStatus('error');
            setSttStatus('failed');
            appendLog(`Link failure: ${(err as Error).message}`, 'ERR');
        }
    }, [appendLog, autoGainControl, echoCancellation, flushVadUtterance, isOpenRef, micInitSeqRef, moonshineGateRef, moonshineStreamRef, noiseSuppression, pttActiveRef, selectedMic, setAiSpeechText, setAmplitude, setMicStatus, setRecordingState, setSttStatus, setSubtitleSpeaker, setUserSpeechText, setVoiceState, startMoonshineRecognition, sttEngine, streamRef, vadThreshold, voiceInputMode, audioCtxRef, analyserRef, gainNodeRef, heardSpeechRef, isRecordingRef, recordingChunksRef, workletNodeRef]);

    const cleanupAudio = useCallback(() => {
        micInitSeqRef.current += 1;
        stopWebRecognition(true);
        stopMoonshineRecognition();
        moonshineStreamRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (workletNodeRef.current) {
            workletNodeRef.current.port.onmessage = null;
            workletNodeRef.current.disconnect();
            workletNodeRef.current = null;
        }
        moonshineGateRef.current?.disconnect();
        moonshineGateRef.current = null;
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') audioCtxRef.current.close().catch(() => undefined);
        setMicStatus('inactive');
        isRecordingRef.current = false;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }, [audioCtxRef, isRecordingRef, micInitSeqRef, moonshineGateRef, moonshineStreamRef, rafRef, setMicStatus, stopMoonshineRecognition, stopWebRecognition, streamRef, workletNodeRef]);

    return { cleanupAudio, initMic };
}
