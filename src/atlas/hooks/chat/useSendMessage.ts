import { useCallback } from "react";
import { chatApi, getIpcErrorMessage } from "@/api";
import { toast } from "sonner";
import { useChatStore } from "@/lib/stores/useChatStore";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { ttftBegin, ttftReport } from "@/lib/ttft";
import type { Message, Attachment } from "../../components/chat/types";
import { findWritableAssistantIndex } from "../stream/messageTarget";
import { createOptimisticChatMessages } from "./optimisticChatMessages";
import { preloadOpenUISystemPrompt } from "../../components/genui/promptLoader";

export function useSendMessage(currentSessionId: string | null) {
  const setSessionMessages = useChatStore(state => state.setSessionMessages);

  const handleSendMessage = useCallback(async (data: {
    message: string;
    model: string;
    provider?: string;
    webSearch?: boolean;
    thinking?: {
      enabled: boolean;
      effort?: "low" | "medium" | "high";
      budgetTokens?: number;
    };
    deepResearch?: boolean;
    generativeUI?: boolean;
    attachments?: Attachment[];
    tools?: string[];
  }) => {
    if (!currentSessionId) {
      console.warn("[useChat] Attempted to send message, but no active chat session is selected.");
      return;
    }
    ttftBegin(currentSessionId);

    const store = useSettingsStore.getState();
    const activeProvider = data.provider || store.activeProvider || "ollama";

    const paramsStore = store.providerParams || {};
    const providerParams = paramsStore[activeProvider] || {};

    const temperature = Number(providerParams.temperature ?? store.temperature ?? 0.7);
    const maxTokens = Number(providerParams.maxTokens ?? store.maxTokens ?? 4096);

    const { userMessage, assistantMessage } = createOptimisticChatMessages({
      sessionId: currentSessionId,
      content: data.message,
      model: data.model,
      provider: activeProvider,
      deepResearch: data.deepResearch,
      generativeUI: data.generativeUI,
      tools: data.tools,
      attachments: data.attachments,
    });

    setSessionMessages(currentSessionId, (prev: Message[]) => [...prev, userMessage, assistantMessage]);

    useChatStore.getState().setStreamingForChat(currentSessionId, true);

    try {
      let systemPrompt: string | null = null;
      if (data.generativeUI) {
        systemPrompt = await preloadOpenUISystemPrompt();
      }

      await chatApi.sendMessage({
        chatId: currentSessionId,
        content: data.message,
        model: data.model === "No Model" ? null : data.model,
        provider: data.provider,
        webSearch: data.webSearch,
        temperature,
        maxTokens,
        topP: providerParams.topP != null ? Number(providerParams.topP) : undefined,
        topK: providerParams.topK != null ? Number(providerParams.topK) : undefined,
        presencePenalty: providerParams.presencePenalty != null ? Number(providerParams.presencePenalty) : undefined,
        frequencyPenalty: providerParams.frequencyPenalty != null ? Number(providerParams.frequencyPenalty) : undefined,
        repeatPenalty: providerParams.repeatPenalty != null ? Number(providerParams.repeatPenalty) : undefined,
        seed: null,
        stop: providerParams.stop,
        thinking: data.thinking,
        deepResearch: data.deepResearch,
        generativeUi: data.generativeUI,
        tools: data.tools,
        attachments: data.attachments,
        systemPrompt: systemPrompt,
      });
    } catch (e: unknown) {
      const errorMessage = getIpcErrorMessage(e, "Failed to send message");
      console.error("[useChat] 'send_message' IPC command failed:", e);
      ttftReport(currentSessionId, "send-error");
      setSessionMessages(currentSessionId, (prev: Message[]) => {
        const next = [...prev];
        const assistantIdx = findWritableAssistantIndex(next);
        if (assistantIdx !== -1) {
          next[assistantIdx] = { ...next[assistantIdx], status: "failed", error: errorMessage };
        }
        return next;
      });
      useChatStore.getState().setStreamingForChat(currentSessionId, false);
      toast.error(errorMessage);
    }
  }, [currentSessionId, setSessionMessages]);

  return { handleSendMessage };
}
