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
  setUserSpeechText, speakingBackRef, ttsEngine,
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
  ttsEngine: string;
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
      if (ttsEngine === "web" || ttsEngine === "system") setAiSpeaking(false);
    }
  }, [appendLog, fullAiResponseRef, isOpenRef, lastSpokenResponseRef, setAiSpeaking, setAiSpeechText, setSubtitleSpeaker, setTtsStatus, setUserSpeechText, speakingBackRef, ttsEngine]);

  useEffect(() => {
    let unlistens: UnlistenFn[] = [];
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
              setAiSpeechText(stripped);
              setSubtitleSpeaker("agent");
              setUserSpeechText("");
            }
            void speakAssistantResponse();
          }),
          await listenAppEvent("tts:start", (event) => {
            setTtsStatus("speaking");
            setAiSpeaking(true);
            setSubtitleSpeaker("agent");
            setUserSpeechText("");
            if (!fullAiResponseRef.current && event.payload?.text) setAiSpeechText(event.payload.text);
          }),
          await listenAppEvent("tts:stop", () => {
            setTtsStatus("ready");
            setAiSpeaking(false);
          }),
          await listenAppEvent("tts:error", (event) => {
            setTtsStatus("failed");
            setAiSpeaking(false);
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
  }, [appendLog, fullAiResponseRef, isOpenRef, messagesRef, setAiSpeaking, setAiSpeechText, setSubtitleSpeaker, setToolAction, setTtsStatus, setUserSpeechText, speakAssistantResponse, speakingBackRef]);
}
