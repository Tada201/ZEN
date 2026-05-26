import { useCallback } from "react";
import { chatApi, getIpcErrorMessage } from "@/api";
import { toast } from "sonner";
import { useChatStore } from "@/lib/stores/useChatStore";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { Message, Attachment } from "../../components/chat/types";
import { extendedLibrary } from "../../components/genui";
import { openuiLibrary, openuiPromptOptions } from "@openuidev/react-ui/genui-lib";

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

    const store = useSettingsStore.getState();
    const activeProvider = data.provider || store.activeProvider || "ollama";

    const paramsStore = store.providerParams || {};
    const providerParams = paramsStore[activeProvider] || {};

    const temperature = Number(providerParams.temperature ?? store.temperature ?? 0.7);
    const maxTokens = Number(providerParams.maxTokens ?? store.maxTokens ?? 4096);

    console.group(`[useChat] Sending Message to Session: ${currentSessionId}`);
    console.log("Payload:", {
      message: data.message,
      model: data.model,
      provider: activeProvider,
      webSearch: data.webSearch,
      deepResearch: data.deepResearch,
      temperature,
      maxTokens,
      providerParams,
    });
    console.groupEnd();

    const userMsg: Message = {
      id: `temp-user-${Date.now()}`,
      sessionId: currentSessionId,
      role: "user",
      content: data.message,
      createdAt: Date.now(),
      status: "sent",
      model: data.model,
      provider: activeProvider,
      steps: [],
      toolCalls: [],
      attachments: [],
      artifact: null,
    };

    const assistantMsg: Message = {
      id: `temp-assistant-${Date.now()}`,
      sessionId: currentSessionId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      status: "sending",
      model: data.model,
      provider: activeProvider,
      kind: data.deepResearch ? "deep_research" : undefined,
      steps: [],
      toolCalls: [],
      attachments: [],
      artifact: null,
    };

    console.log("[useChat] Optimistically adding user/assistant messages to per-session buffer.");
    setSessionMessages(currentSessionId, (prev: Message[]) => [...prev, userMsg, assistantMsg]);

    useChatStore.getState().setStreamingForChat(currentSessionId, true);

    try {
      const promptOptions = { ...openuiPromptOptions, editMode: true, inlineMode: true };
      const systemPrompt = data.generativeUI
        ? ((extendedLibrary as any).prompt
            ? (extendedLibrary as any).prompt(promptOptions)
            : openuiLibrary.prompt(promptOptions))
        : null;

      console.log("[useChat] Invoking 'send_message' backend IPC command with Gen UI prompt status:", !!systemPrompt);
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
      console.log("[useChat] 'send_message' IPC command succeeded.");
    } catch (e: unknown) {
      const errorMessage = getIpcErrorMessage(e, "Failed to send message");
      console.error("[useChat] 'send_message' IPC command failed:", e);
      useChatStore.getState().setStreamingForChat(currentSessionId, false);
      setSessionMessages(currentSessionId, (prev: Message[]) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") {
          next[next.length - 1] = { ...last, status: "failed", error: errorMessage };
        }
        return next;
      });
      toast.error(errorMessage);
    }
  }, [currentSessionId, setSessionMessages]);

  return { handleSendMessage };
}
