import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { listenAppEvent } from "@/api/events";
import { speakText } from "@/atlas/lib/webSpeech";
import type { TtsServiceStatus } from "./voiceStatus";
import { stripMarkdown } from "./voiceTextUtils";

type SubtitleSpeaker = "user" | "agent" | "system";
type AppendVoiceLog = (msg: string, status?: "OK" | "ERR") => void;
type VoiceMessage = { role?: string; content?: string };

export function useVoiceChatEvents({
  appendLog, fullAiResponseRef, isOpenRef, lastSpokenResponseRef, messagesRef,
  setAiSpeaking, setAiSpeechText, setSubtitleSpeaker, setToolAction, setTtsStatus,
  setUserSpeechText, speakingBackRef, setPlaybackEnergy,
}: {
  appendLog: AppendVoiceLog;
  fullAiResponseRef: MutableRefObject<string>;
  isOpenRef: MutableRefObject<boolean>;
  lastSpokenResponseRef: MutableRefObject<string>;
  messagesRef: MutableRefObject<VoiceMessage[]>;
  setAiSpeaking: (speaking: boolean) => void;
  setAiSpeechText: Dispatch<SetStateAction<string>>;
  setSubtitleSpeaker: Dispatch<SetStateAction<SubtitleSpeaker>>;
  setToolAction: Dispatch<SetStateAction<string | null>>;
  setTtsStatus: Dispatch<SetStateAction<TtsServiceStatus>>;
  setUserSpeechText: Dispatch<SetStateAction<string>>;
  speakingBackRef: MutableRefObject<boolean>;
  setPlaybackEnergy: Dispatch<SetStateAction<number>>;
}) {
  const speakAssistantResponse = useCallback(async () => {
    if (!isOpenRef.current || speakingBackRef.current) return;
    const text = fullAiResponseRef.current.trim();
    if (!text || text === lastSpokenResponseRef.current) return;
    lastSpokenResponseRef.current = text;
    speakingBackRef.current = true;
    setTtsStatus("starting");
    setSubtitleSpeaker("agent");
    setUserSpeechText("");
    setAiSpeechText(text);
    try {
      await speakText(text);
    } catch (error) {
      setTtsStatus("failed");
      setAiSpeaking(false);
      appendLog(`TTS readback failed: ${error instanceof Error ? error.message : String(error)}`, "ERR");
    } finally {
      speakingBackRef.current = false;
    }
  }, [appendLog, fullAiResponseRef, isOpenRef, lastSpokenResponseRef, setAiSpeaking, setAiSpeechText, setSubtitleSpeaker, setTtsStatus, setUserSpeechText, speakingBackRef]);

  useEffect(() => {
    let unlistens: UnlistenFn[] = [];
    let subtitleFrameId: number | null = null;
    let disposed = false;
    const setup = async () => {
      try {
        const nextUnlistens = [
          await listenAppEvent("chat:status", (event) => {
            const message = event.payload.message;
            if (message?.startsWith("Executing:")) setToolAction(message.replace("Executing: ", "").toUpperCase());
          }),
          await listenAppEvent("chat:done", (event) => {
            setToolAction(null);
            const lastMessage = messagesRef.current.at(-1);
            const content = event.payload?.content || (lastMessage?.role === "assistant" ? lastMessage.content : "");
            if (content && isOpenRef.current) {
              const stripped = stripMarkdown(content);
              fullAiResponseRef.current = stripped;
              // We do not set aiSpeechText here to avoid flashing the entire response and truncating it.
              // It will stay as "Preparing response..." until tts:start provides the timed sentence cues.
              setSubtitleSpeaker("agent");
              setUserSpeechText("");
            }
            void speakAssistantResponse();
          }),
          await listenAppEvent("tts:start", (event) => {
            setTtsStatus("speaking");
            setAiSpeaking(true);
            setPlaybackEnergy(0.45);
            setSubtitleSpeaker("agent");
            setUserSpeechText("");

            if (subtitleFrameId !== null) cancelAnimationFrame(subtitleFrameId);
            const payload = event.payload;

            if (payload?.sentences && Array.isArray(payload.sentences) && payload.sentences.length > 0) {
              const cues = payload.sentences as {text: string, start_ms: number, end_ms: number}[];
              const startTime = performance.now();
              let lastText = "";

              const checkSubtitles = () => {
                const elapsed = performance.now() - startTime;
                const activeCue = cues.find(c => elapsed >= c.start_ms && elapsed <= c.end_ms);
                const textToSet = activeCue ? activeCue.text : (elapsed > cues[cues.length - 1].end_ms ? cues[cues.length - 1].text : "");
                
                if (textToSet && textToSet !== lastText) {
                  lastText = textToSet;
                  setAiSpeechText(textToSet);
                }
                
                if (!disposed) {
                  subtitleFrameId = requestAnimationFrame(checkSubtitles);
                }
              };
              subtitleFrameId = requestAnimationFrame(checkSubtitles);
            } else if (payload?.text || fullAiResponseRef.current) {
              setAiSpeechText(payload?.text || fullAiResponseRef.current);
            }
          }),
          await listenAppEvent("tts:level", (event) => {
            if (event.payload && typeof event.payload.level === 'number') {
              setPlaybackEnergy(event.payload.level);
            }
          }),
          await listenAppEvent("tts:caption", (event) => {
            if (event.payload?.text) {
              setAiSpeechText(event.payload.text);
            }
          }),
          await listenAppEvent("tts:stop", () => {
            if (subtitleFrameId !== null) cancelAnimationFrame(subtitleFrameId);
            setTtsStatus("ready");
            setAiSpeaking(false);
            setPlaybackEnergy(0);
            speakingBackRef.current = false;
          }),
          await listenAppEvent("tts:error", (event) => {
            if (subtitleFrameId !== null) cancelAnimationFrame(subtitleFrameId);
            setTtsStatus("failed");
            setAiSpeaking(false);
            setPlaybackEnergy(0);
            speakingBackRef.current = false;
            appendLog(`TTS error: ${event.payload?.error ?? "TTS playback failed"}`, "ERR");
          }),
        ];
        if (disposed) nextUnlistens.forEach((unlisten) => unlisten());
        else unlistens = nextUnlistens;
      } catch (error) {
        appendLog(`Voice event setup failed: ${error instanceof Error ? error.message : String(error)}`, "ERR");
      }
    };
    void setup();
    return () => {
      disposed = true;
      unlistens.forEach((unlisten) => unlisten());
      unlistens = [];
    };
  }, [appendLog, fullAiResponseRef, isOpenRef, messagesRef, setAiSpeaking, setAiSpeechText, setPlaybackEnergy, setSubtitleSpeaker, setToolAction, setTtsStatus, setUserSpeechText, speakAssistantResponse, speakingBackRef]);
}
