import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { listenAppEvent } from "@/api/events";
import { speakText, stopSpeech } from "@/atlas/lib/webSpeech";
import type { TtsServiceStatus } from "./voiceStatus";
import { stripMarkdown } from "./voiceTextUtils";

type SubtitleSpeaker = "user" | "agent" | "system";
type AppendVoiceLog = (msg: string, status?: "OK" | "ERR") => void;
type VoiceMessage = { role?: string; content?: string; steps?: Array<{ type: string; content?: string }> };

function extractNewSentences(fullText: string, spokenLength: number): { sentences: string[]; newLength: number } {
  const unspoken = fullText.slice(spokenLength);
  if (!unspoken.trim()) return { sentences: [], newLength: spokenLength };

  const sentences: string[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  // Use sticky matching to find sentence boundaries
  const regex = /[^.!?]+[.!?]+/g;
  while ((match = regex.exec(unspoken)) !== null) {
    sentences.push(match[0].trim());
    cursor = match.index + match[0].length;
  }

  // If we found sentences, advance past them
  const newLength = sentences.length > 0 ? spokenLength + cursor : spokenLength;
  return { sentences, newLength };
}

export function useVoiceChatEvents({
  appendLog, chatId, fullAiResponseRef, isOpenRef, lastSpokenResponseRef, messagesRef,
  setAiSpeaking, setAiSpeechText, setSubtitleSpeaker, setToolAction, setTtsStatus,
  setUserSpeechText, speakingBackRef, setPlaybackEnergy,
}: {
  appendLog: AppendVoiceLog;
  chatId: string;
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
  const spokenLengthRef = useRef(0);
  const speakingQueueRef = useRef(false);
  const sentenceQueueRef = useRef<string[]>([]);
  const rawResponseRef = useRef("");

  const speakSentences = useCallback(async (sentences: string[]) => {
    sentenceQueueRef.current.push(...sentences.filter(Boolean));
    if (speakingQueueRef.current) return;
    speakingQueueRef.current = true;
    setTtsStatus("starting");
    setSubtitleSpeaker("agent");
    setUserSpeechText("");

    try {
      while (sentenceQueueRef.current.length > 0) {
        if (!isOpenRef.current) break;
        const sentence = sentenceQueueRef.current.shift();
        if (!sentence) continue;
        setAiSpeechText(sentence);
        await speakText(sentence);
      }
    } catch (error) {
      setTtsStatus("failed");
      setAiSpeaking(false);
      appendLog(`TTS readback failed: ${error instanceof Error ? error.message : String(error)}`, "ERR");
    } finally {
      if (!isOpenRef.current) sentenceQueueRef.current = [];
      speakingQueueRef.current = false;
    }
  }, [appendLog, isOpenRef, setAiSpeaking, setAiSpeechText, setSubtitleSpeaker, setTtsStatus, setUserSpeechText]);

  const speakAssistantResponse = useCallback(async () => {
    if (!isOpenRef.current || speakingBackRef.current) return;
    const text = fullAiResponseRef.current.trim();
    if (!text) return;

    const { sentences, newLength } = extractNewSentences(text, spokenLengthRef.current);
    if (sentences.length === 0) return;

    spokenLengthRef.current = newLength;
    lastSpokenResponseRef.current = text;
    speakingBackRef.current = true;

    await speakSentences(sentences);

    speakingBackRef.current = false;
  }, [fullAiResponseRef, isOpenRef, lastSpokenResponseRef, setAiSpeaking, setAiSpeechText, setSubtitleSpeaker, setTtsStatus, setUserSpeechText, speakSentences, speakingBackRef]);

  useEffect(() => {
    let unlistens: UnlistenFn[] = [];
    let subtitleFrameId: number | null = null;
    let disposed = false;
    const setup = async () => {
      try {
        const nextUnlistens = [
          // Reset spoken tracking when a new user message is sent
          await listenAppEvent("chat:status", (event) => {
            if (event.payload.chat_id && event.payload.chat_id !== chatId) return;
            const message = event.payload.message;
            if (message?.startsWith("Executing:")) {
              setToolAction(message.replace("Executing: ", "").toUpperCase());
              // Pause TTS during tool execution
              stopSpeech();
              speakingBackRef.current = false;
            }
          }),
          // Stream text chunks: speak sentences as they arrive
          await listenAppEvent("chat:chunk", (event) => {
            const eventChatId = event.payload?.chat_id;
            const delta = event.payload?.delta;
            const chunkType = event.payload?.type;
            if (eventChatId !== chatId || !delta || chunkType !== "text" || !isOpenRef.current) return;

            rawResponseRef.current += delta;
            const stripped = stripMarkdown(rawResponseRef.current);
            if (!stripped) return;

            fullAiResponseRef.current = stripped;

            // Check if we have a complete sentence to speak
            const extracted = extractNewSentences(fullAiResponseRef.current, spokenLengthRef.current);
            if (extracted.sentences.length > 0) {
              spokenLengthRef.current = extracted.newLength;
              setSubtitleSpeaker("agent");
              setUserSpeechText("");
              speakingBackRef.current = true;
              speakSentences(extracted.sentences).finally(() => {
                speakingBackRef.current = false;
              });
            }
          }),
          // On done: speak any remaining unspoken text
          await listenAppEvent("chat:done", (event) => {
            if (event.payload?.chat_id && event.payload.chat_id !== chatId) return;
            setToolAction(null);
            const lastMessage = messagesRef.current.at(-1);
            let content = "";

            if (event.payload?.content) {
              content = event.payload.content;
            } else if (lastMessage?.role === "assistant") {
              const steps = lastMessage.steps;
              if (steps && steps.length > 0) {
                content = steps
                  .filter((step: any) => step.type === "text" && step.content)
                  .map((step: any) => step.content)
                  .join(" ");
              }
              if (!content) {
                content = lastMessage.content || "";
              }
            }

            if (content && isOpenRef.current) {
              rawResponseRef.current = content;
              const stripped = stripMarkdown(rawResponseRef.current);
              fullAiResponseRef.current = stripped;
              setSubtitleSpeaker("agent");
              setUserSpeechText("");
              // Speak any remaining unspoken sentences
              void speakAssistantResponse();
            }
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
  }, [appendLog, chatId, fullAiResponseRef, isOpenRef, messagesRef, setAiSpeaking, setAiSpeechText, setPlaybackEnergy, setSubtitleSpeaker, setToolAction, setTtsStatus, setUserSpeechText, speakAssistantResponse, speakingBackRef, speakSentences]);

  const resetSpokenTracking = useCallback(() => {
    spokenLengthRef.current = 0;
    sentenceQueueRef.current = [];
    rawResponseRef.current = "";
  }, []);

  return { resetSpokenTracking };
}
