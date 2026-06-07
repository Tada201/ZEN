import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { voiceApi } from '@/api';
import type { VoiceStageInput } from './voiceStageStore';
import type { VoiceState } from './VoiceModePanel';
import { convertChunksToWhisperPcm, WHISPER_AUDIO_LIMITS } from './whisperPcm';
import type { SttServiceStatus } from './voiceStatus';

type SubtitleSpeaker = 'user' | 'agent' | 'system';
type AppendVoiceLog = (msg: string, status?: 'OK' | 'ERR') => void;

export function useWhisperStt({
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
}: {
    appendLog: AppendVoiceLog;
    applyStageBlock: (block: VoiceStageInput) => void;
    audioCtxRef: MutableRefObject<AudioContext | null>;
    flushingRef: MutableRefObject<boolean>;
    isRecordingRef: MutableRefObject<boolean>;
    micVolume: number;
    onTranscript: (text: string) => void;
    recordingChunksRef: MutableRefObject<Float32Array[]>;
    setAiSpeechText: Dispatch<SetStateAction<string>>;
    setSttStatus: Dispatch<SetStateAction<SttServiceStatus>>;
    setSubtitleSpeaker: Dispatch<SetStateAction<SubtitleSpeaker>>;
    setUserSpeechText: Dispatch<SetStateAction<string>>;
    setVoiceState: Dispatch<SetStateAction<VoiceState>>;
    sttComputeDevice: string;
    sttWhisperModel: string;
    voiceInputModeRef: MutableRefObject<boolean>;
    workletNodeRef: MutableRefObject<AudioWorkletNode | null>;
}) {
    const flushVadUtterance = useCallback(async () => {
        // Concurrency guard: only one transcription at a time.
        // The check+set is synchronous so no two callers can pass simultaneously.
        if (flushingRef.current) return;
        flushingRef.current = true;
        try {
            const chunks = [...recordingChunksRef.current];
            recordingChunksRef.current = [];
            if (chunks.length === 0) {
                setSttStatus('failed');
                setUserSpeechText('No audio captured.');
                setSubtitleSpeaker('system');
                return;
            }

            setVoiceState('processing');
            setSttStatus('transcribing');
            setUserSpeechText('Processing speech...');
            setSubtitleSpeaker('system');
            const pcm = convertChunksToWhisperPcm(chunks, audioCtxRef.current?.sampleRate || 48000, micVolume);
            if (!pcm) {
                setSttStatus('failed');
                setUserSpeechText('No audio captured.');
                setSubtitleSpeaker('system');
                return;
            }
            if (voiceInputModeRef.current && pcm.bytes.length < WHISPER_AUDIO_LIMITS.minPttAudioBytes) {
                appendLog('PTT: audio was too short to transcribe.', 'ERR');
                setSttStatus('failed');
                setUserSpeechText('Audio was too short.');
                setSubtitleSpeaker('system');
                return;
            }
            if (pcm.rms < WHISPER_AUDIO_LIMITS.minRms || pcm.peak < WHISPER_AUDIO_LIMITS.minPeak) {
                appendLog(`PTT: captured silence (${pcm.durationMs}ms, rms ${pcm.rms.toFixed(4)}, peak ${pcm.peak.toFixed(4)}).`, 'ERR');
                setSttStatus('failed');
                setUserSpeechText('No speech detected.');
                setSubtitleSpeaker('system');
                return;
            }

            appendLog(`Whisper: transcribing ${Math.round(pcm.bytes.length / 1024)} KB, ${pcm.durationMs}ms, rms ${pcm.rms.toFixed(4)}, peak ${pcm.peak.toFixed(4)} with ${sttWhisperModel}`);
            const modelStatus = await voiceApi.getWhisperModelStatus(sttWhisperModel);
            appendLog(`Whisper model: ${modelStatus.valid ? 'ready' : 'not ready'} (${modelStatus.source}, ${Math.round(modelStatus.size_bytes / 1024 / 1024)} MB)`, modelStatus.valid ? 'OK' : 'ERR');
            if (!modelStatus.valid) {
                appendLog(`Whisper model error: ${modelStatus.error || 'model file is missing or invalid'}`, 'ERR');
                setSttStatus('failed');
                setUserSpeechText('Whisper model is not ready.');
                setSubtitleSpeaker('system');
                return;
            }
            appendLog('Whisper: request sent to local transcription service.');
            const whisperStartedAt = performance.now();
            const gpuDevice = sttComputeDevice === 'auto' ? null : Number.parseInt(sttComputeDevice, 10);
            const result = await voiceApi.transcribeAudio(pcm.bytes, sttWhisperModel, voiceInputModeRef.current, Number.isFinite(gpuDevice) ? gpuDevice : null);
            appendLog(`Whisper: local transcription returned in ${Math.round(performance.now() - whisperStartedAt)}ms.`);
            if (result.status === 'Transcript' && result.text?.trim()) {
                const transcriptText = result.text.trim();
                appendLog(`Whisper: transcript ready (${transcriptText.length} chars): "${transcriptText.slice(0, 120)}"`);
                setUserSpeechText(transcriptText);
                setAiSpeechText('');
                setSubtitleSpeaker('user');
                applyStageBlock({ id: 'voice-user-turn', kind: 'note', title: 'User turn', body: transcriptText });
                appendLog('Chat: sending transcript to active session.');
                setSttStatus('ready');
                onTranscript(transcriptText);
            } else {
                appendLog(`Whisper: no transcript returned. Status=${result.status || 'unknown'}`, 'ERR');
                setSttStatus('failed');
                setUserSpeechText('No transcript returned.');
                setSubtitleSpeaker('system');
            }
        } catch (err) {
            appendLog(`Whisper ERR: ${err instanceof Error ? err.message : String(err)}`, 'ERR');
            setSttStatus('failed');
            setUserSpeechText('Whisper transcription failed.');
            setSubtitleSpeaker('system');
        } finally {
            setVoiceState('listening');
            flushingRef.current = false;
        }
    }, [appendLog, applyStageBlock, audioCtxRef, flushingRef, micVolume, onTranscript, recordingChunksRef, setAiSpeechText, setSttStatus, setSubtitleSpeaker, setUserSpeechText, setVoiceState, sttComputeDevice, sttWhisperModel, voiceInputModeRef]);

    const setRecordingState = useCallback((recording: boolean) => {
        isRecordingRef.current = recording;
        workletNodeRef.current?.port.postMessage({ type: 'SET_RECORDING', value: recording });
    }, [isRecordingRef, workletNodeRef]);

    return { flushVadUtterance, setRecordingState };
}
