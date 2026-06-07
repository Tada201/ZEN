import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { type UnlistenFn } from '@tauri-apps/api/event';
import { speakText } from '@/atlas/lib/webSpeech';
import { listenAppEvent } from '@/api/events';
import { stripMarkdown } from './voiceTextUtils';
import type { VoiceStageInput } from './voiceStageStore';

type SubtitleSpeaker = 'user' | 'agent' | 'system';
type AppendVoiceLog = (msg: string, status?: 'OK' | 'ERR') => void;
type VoiceMessage = { role?: string; content?: string };

export function useVoiceChatEvents({
    appendLog,
    applyStageBlock,
    fullAiResponseRef,
    isOpenRef,
    lastSpokenResponseRef,
    lastStageAiTextRef,
    messagesRef,
    setAiSpeaking,
    setAiSpeechText,
    setSubtitleSpeaker,
    setToolAction,
    setUserSpeechText,
    speakingBackRef,
    ttsEngine,
}: {
    appendLog: AppendVoiceLog;
    applyStageBlock: (block: VoiceStageInput) => void;
    fullAiResponseRef: MutableRefObject<string>;
    isOpenRef: MutableRefObject<boolean>;
    lastSpokenResponseRef: MutableRefObject<string>;
    lastStageAiTextRef: MutableRefObject<string>;
    messagesRef: MutableRefObject<VoiceMessage[]>;
    setAiSpeaking: (speaking: boolean) => void;
    setAiSpeechText: Dispatch<SetStateAction<string>>;
    setSubtitleSpeaker: Dispatch<SetStateAction<SubtitleSpeaker>>;
    setToolAction: Dispatch<SetStateAction<string | null>>;
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
        setAiSpeaking(true);
        setSubtitleSpeaker('agent');
        setUserSpeechText('');
        setAiSpeechText(text);
        try {
            await speakText(text);
        } catch (error) {
            appendLog(`TTS readback failed: ${error instanceof Error ? error.message : String(error)}`, 'ERR');
            setAiSpeaking(false);
        } finally {
            speakingBackRef.current = false;
            if (ttsEngine === 'web' || ttsEngine === 'system') setAiSpeaking(false);
        }
    }, [appendLog, fullAiResponseRef, isOpenRef, lastSpokenResponseRef, setAiSpeaking, setAiSpeechText, setSubtitleSpeaker, setUserSpeechText, speakingBackRef, ttsEngine]);

    useEffect(() => {
        let unlistens: UnlistenFn[] = [];
        let disposed = false;
        const setup = async () => {
            try {
                const nextUnlistens = [
                    await listenAppEvent('globe:navigate', () => {}),
                    await listenAppEvent('drawing:ops', () => {}),
                    await listenAppEvent('chat:status', (e) => {
                        const message = e.payload.message;
                        if (!message?.startsWith('Executing:')) return;
                        const action = message.replace('Executing: ', '').toUpperCase();
                        setToolAction(action);
                        applyStageBlock({
                            id: 'voice-tool-action',
                            kind: 'metric',
                            title: 'Tool action',
                            value: action,
                            detail: 'Running from the main assistant pipeline',
                        });
                    }),
                    await listenAppEvent('chat:done', (e) => {
                        setToolAction(null);
                        const currentMessages = messagesRef.current;
                        const lastMsg = currentMessages[currentMessages.length - 1];
                        let finalContent = e.payload?.content;
                        if (!finalContent && lastMsg?.role === 'assistant') finalContent = lastMsg.content;
                        if (finalContent && isOpenRef.current) {
                            const stripped = stripMarkdown(finalContent);
                            fullAiResponseRef.current = stripped;
                            setAiSpeechText(fullAiResponseRef.current);
                            setSubtitleSpeaker('agent');
                            setUserSpeechText('');
                            const compact = stripped.trim().slice(0, 900);
                            if (compact && compact !== lastStageAiTextRef.current) {
                                lastStageAiTextRef.current = compact;
                                applyStageBlock({ id: 'voice-assistant-response', kind: 'note', title: 'Assistant response', body: compact });
                            }
                        }
                        void speakAssistantResponse();
                    }),
                    await listenAppEvent('tts:start', () => {
                        setAiSpeaking(true);
                        setSubtitleSpeaker('agent');
                        setUserSpeechText('');
                    }),
                    await listenAppEvent('tts:stop', () => {
                        setAiSpeaking(false);
                    }),
                ];
                if (disposed) {
                    nextUnlistens.forEach((fn) => fn());
                    return;
                }
                unlistens = nextUnlistens;
            } catch (err) {
                console.error(err);
            }
        };
        setup();
        return () => {
            disposed = true;
            unlistens.forEach((fn) => fn());
            unlistens = [];
        };
    }, [applyStageBlock, fullAiResponseRef, isOpenRef, lastStageAiTextRef, messagesRef, setAiSpeaking, setAiSpeechText, setSubtitleSpeaker, setToolAction, setUserSpeechText, speakAssistantResponse]);
}
