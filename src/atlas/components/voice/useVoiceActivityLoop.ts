import { useEffect, type MutableRefObject } from "react";
import type { VoiceState } from "./VoiceModePanel";

const SILENCE_DURATION_MS = 2000;

export function useVoiceActivityLoop({
  aiSpeakingRef, amplitudeRef, appendLog, flushVadUtterance, flushingRef,
  heardSpeechRef, isOpenRef, lastBargeInRef, onAbort, pttActiveRef, rafRef,
  setRecordingState, setVoiceState, silenceStartRef, stopVoiceAudio, sttEngine,
  vadThresholdRef, voiceInputMode, voiceInputModeRef, voiceModeOpen,
}: {
  aiSpeakingRef: MutableRefObject<boolean>;
  amplitudeRef: MutableRefObject<number>;
  appendLog: (message: string) => void;
  flushVadUtterance: () => void;
  flushingRef: MutableRefObject<boolean>;
  heardSpeechRef: MutableRefObject<boolean>;
  isOpenRef: MutableRefObject<boolean>;
  lastBargeInRef: MutableRefObject<number>;
  onAbort?: () => void;
  pttActiveRef: MutableRefObject<boolean>;
  rafRef: MutableRefObject<number | null>;
  setRecordingState: (recording: boolean) => void;
  setVoiceState: (state: VoiceState) => void;
  silenceStartRef: MutableRefObject<number | null>;
  stopVoiceAudio: () => void;
  sttEngine: string;
  vadThresholdRef: MutableRefObject<number>;
  voiceInputMode: boolean;
  voiceInputModeRef: MutableRefObject<boolean>;
  voiceModeOpen: boolean;
}) {
  useEffect(() => {
    if (!voiceModeOpen) return;
    const animate = (time: number) => {
      if (document.hidden || !isOpenRef.current) {
        rafRef.current = null;
        return;
      }
      const amplitude = amplitudeRef.current;
      const aiSpeaking = aiSpeakingRef.current;
      if (aiSpeaking && amplitude > vadThresholdRef.current && !pttActiveRef.current) {
        const now = performance.now();
        if (now - lastBargeInRef.current > 400) {
          stopVoiceAudio();
          onAbort?.();
          appendLog("Transmission break detected.");
          lastBargeInRef.current = now;
        }
      }
      if (!aiSpeaking && !pttActiveRef.current) {
        if (amplitude > vadThresholdRef.current) {
          if (!heardSpeechRef.current) {
            heardSpeechRef.current = true;
            setVoiceState("speaking");
          }
          silenceStartRef.current = time;
        } else if (heardSpeechRef.current && time - (silenceStartRef.current || 0) > SILENCE_DURATION_MS) {
          heardSpeechRef.current = false;
          setVoiceState("listening");
          if (!voiceInputMode && sttEngine === "whisper") flushVadUtterance();
        }
      } else if (aiSpeaking) setVoiceState("speaking");
      rafRef.current = requestAnimationFrame(animate);
    };
    const start = () => {
      if (rafRef.current === null && !document.hidden) rafRef.current = requestAnimationFrame(animate);
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        if (sttEngine === "whisper") setRecordingState(false);
      } else {
        start();
        if (isOpenRef.current && sttEngine === "whisper" && !voiceInputModeRef.current && !flushingRef.current && !aiSpeakingRef.current) setRecordingState(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    start();
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [aiSpeakingRef, amplitudeRef, appendLog, flushVadUtterance, flushingRef, heardSpeechRef, isOpenRef, lastBargeInRef, onAbort, pttActiveRef, rafRef, setRecordingState, setVoiceState, silenceStartRef, stopVoiceAudio, sttEngine, vadThresholdRef, voiceInputMode, voiceInputModeRef, voiceModeOpen]);
}
