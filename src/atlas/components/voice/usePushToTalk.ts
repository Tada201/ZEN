import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { VoiceState } from './VoiceModePanel';
import type { SttServiceStatus } from './voiceStatus';

type SubtitleSpeaker = 'user' | 'agent' | 'system';
type AppendVoiceLog = (msg: string, status?: 'OK' | 'ERR') => void;
type FinishReason = 'keyup' | 'blur' | 'visibility' | 'click' | 'limit';
const PTT_LIMIT_MS = 20_000;
export const VOICE_PTT_TOGGLE_EVENT = 'zen:voice:toggle-ptt';

function consumeVoiceSpaceEvent(e: KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
}

export function usePushToTalk({
    appendLog, audioCtxRef, flushVadUtterance, gainNodeRef, heardSpeechRef, isOpenRef,
    moonshineGateRef, moonshineReadyRef, moonshineStreamRef, pttActiveRef, recordingChunksRef,
    requestVoiceExit, setAiSpeechText, setPttHeld, setRecordingState, setSttStatus,
    setSubtitleSpeaker, setUserSpeechText, setVoiceState, startMoonshineRecognition,
    startWebRecognition, stopWebRecognition, streamRef, sttEngine, sttModelLabel,
    voiceInputModeRef, workletNodeRef,
}: {
    appendLog: AppendVoiceLog; flushVadUtterance: () => Promise<void>; requestVoiceExit: () => void;
    audioCtxRef: MutableRefObject<AudioContext | null>; gainNodeRef: MutableRefObject<GainNode | null>; heardSpeechRef: MutableRefObject<boolean>; isOpenRef: MutableRefObject<boolean>;
    moonshineGateRef: MutableRefObject<GainNode | null>; moonshineReadyRef: MutableRefObject<boolean>; moonshineStreamRef: MutableRefObject<MediaStream | null>;
    pttActiveRef: MutableRefObject<boolean>; recordingChunksRef: MutableRefObject<Float32Array[]>; streamRef: MutableRefObject<MediaStream | null>;
    setAiSpeechText: Dispatch<SetStateAction<string>>; setPttHeld: Dispatch<SetStateAction<boolean>>; setRecordingState: (recording: boolean) => void;
    setSttStatus: Dispatch<SetStateAction<SttServiceStatus>>;
    setSubtitleSpeaker: Dispatch<SetStateAction<SubtitleSpeaker>>; setUserSpeechText: Dispatch<SetStateAction<string>>; setVoiceState: Dispatch<SetStateAction<VoiceState>>;
    startMoonshineRecognition: (stream: MediaStream | null | undefined) => Promise<boolean>; startWebRecognition: () => boolean; stopWebRecognition: (abort?: boolean) => void;
    sttEngine: string; sttModelLabel: string; voiceInputModeRef: MutableRefObject<boolean>; workletNodeRef: MutableRefObject<AudioWorkletNode | null>;
}) {
    useEffect(() => {
        let limitTimer: ReturnType<typeof setTimeout> | null = null;
        const clearLimitTimer = () => {
            if (limitTimer) clearTimeout(limitTimer);
            limitTimer = null;
        };

        const finishPttTurn = (reason: FinishReason) => {
            if (!pttActiveRef.current) return;
            clearLimitTimer();
            pttActiveRef.current = false;
            setRecordingState(false);
            setPttHeld(false);
            setUserSpeechText(reason === 'limit' ? 'Speech limit reached. Processing...' : 'Processing speech...');
            setSubtitleSpeaker('system');
            if (gainNodeRef.current && audioCtxRef.current) gainNodeRef.current.gain.setValueAtTime(1, audioCtxRef.current.currentTime);
            setVoiceState('idle');
            setSttStatus('transcribing');
            appendLog(sttEngine === 'whisper'
                ? `PTT: Released by ${reason}. Processing ${recordingChunksRef.current.length} audio chunks.`
                : `PTT: Released by ${reason}. Finalizing ${sttModelLabel}.`);
            if (sttEngine === 'whisper') void flushVadUtterance();
            else if (sttEngine === 'web') stopWebRecognition();
            else if (sttEngine === 'moonshine') {
                setUserSpeechText('Finalizing Moonshine transcript...');
                if (moonshineGateRef.current && audioCtxRef.current) {
                    moonshineGateRef.current.gain.cancelScheduledValues(audioCtxRef.current.currentTime);
                    moonshineGateRef.current.gain.setValueAtTime(1, audioCtxRef.current.currentTime);
                    moonshineGateRef.current.gain.setValueAtTime(0, audioCtxRef.current.currentTime + 1.2);
                }
            } else appendLog(`PTT: STT engine ${sttEngine} is not available for local transcription.`, 'ERR');
        };

        const startPttTurn = () => {
            if (!isOpenRef.current || pttActiveRef.current) return;
            if (!workletNodeRef.current || !audioCtxRef.current) {
                appendLog('PTT: microphone pipeline is not ready yet.', 'ERR');
                setUserSpeechText('Microphone is still starting.');
                setSubtitleSpeaker('system');
                return;
            }
            if (sttEngine === 'moonshine' && !moonshineReadyRef.current) {
                setSttStatus('starting');
                setSubtitleSpeaker('system');
                setUserSpeechText('Moonshine is still loading. Try again when ready.');
                appendLog('PTT: Moonshine is not ready yet; speech capture was not started.', 'ERR');
                void startMoonshineRecognition(moonshineStreamRef.current ?? streamRef.current);
                return;
            }
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
            recordingChunksRef.current = [];
            heardSpeechRef.current = true;
            pttActiveRef.current = true;
            if (sttEngine === 'whisper') setRecordingState(true);
            setSttStatus('recording');
            setPttHeld(true);
            setUserSpeechText('Recording...');
            setAiSpeechText('');
            setSubtitleSpeaker('user');
            gainNodeRef.current?.gain.cancelScheduledValues(audioCtxRef.current.currentTime);
            gainNodeRef.current?.gain.setValueAtTime(1, audioCtxRef.current.currentTime);
            setVoiceState('listening');
            appendLog('PTT: Recording started');
            if (sttEngine === 'web') startWebRecognition();
            if (sttEngine === 'moonshine') {
                moonshineGateRef.current?.gain.cancelScheduledValues(audioCtxRef.current.currentTime);
                moonshineGateRef.current?.gain.setValueAtTime(1, audioCtxRef.current.currentTime);
                void startMoonshineRecognition(moonshineStreamRef.current ?? streamRef.current);
            }
            clearLimitTimer();
            limitTimer = setTimeout(() => finishPttTurn('limit'), PTT_LIMIT_MS);
        };

        const handleKeys = (e: KeyboardEvent) => {
            if (!isOpenRef.current) return;
            if (e.key === 'Escape') {
                if (pttActiveRef.current) appendLog('Cannot close while recording. Release SPACE first.');
                else { e.preventDefault(); requestVoiceExit(); }
                return;
            }
            if (e.key !== ' ' || !voiceInputModeRef.current) return;
            consumeVoiceSpaceEvent(e);
            if (!e.repeat) startPttTurn();
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (isOpenRef.current && e.key === ' ' && voiceInputModeRef.current) {
                consumeVoiceSpaceEvent(e);
                finishPttTurn('keyup');
            }
        };
        const handleClickToggle = () => {
            if (!isOpenRef.current || !voiceInputModeRef.current) return;
            if (pttActiveRef.current) finishPttTurn('click');
            else startPttTurn();
        };

        const handleWindowBlur = () => { if (voiceInputModeRef.current) finishPttTurn('blur'); };
        const handleVisibilityChange = () => { if (document.hidden && voiceInputModeRef.current) finishPttTurn('visibility'); };
        window.addEventListener('keydown', handleKeys, { capture: true });
        window.addEventListener('keyup', handleKeyUp, { capture: true });
        window.addEventListener('blur', handleWindowBlur, { capture: true });
        window.addEventListener(VOICE_PTT_TOGGLE_EVENT, handleClickToggle);
        document.addEventListener('visibilitychange', handleVisibilityChange, { capture: true });
        return () => {
            clearLimitTimer();
            window.removeEventListener('keydown', handleKeys, { capture: true });
            window.removeEventListener('keyup', handleKeyUp, { capture: true });
            window.removeEventListener('blur', handleWindowBlur, { capture: true });
            window.removeEventListener(VOICE_PTT_TOGGLE_EVENT, handleClickToggle);
            document.removeEventListener('visibilitychange', handleVisibilityChange, { capture: true });
        };
    }, [appendLog, audioCtxRef, flushVadUtterance, gainNodeRef, heardSpeechRef, isOpenRef, moonshineGateRef, moonshineReadyRef, moonshineStreamRef, pttActiveRef, recordingChunksRef, requestVoiceExit, setAiSpeechText, setPttHeld, setRecordingState, setSttStatus, setSubtitleSpeaker, setUserSpeechText, setVoiceState, startMoonshineRecognition, startWebRecognition, stopWebRecognition, streamRef, sttEngine, sttModelLabel, voiceInputModeRef, workletNodeRef]);
}
