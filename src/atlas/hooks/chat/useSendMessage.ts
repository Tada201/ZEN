import { useCallback } from "react";
import { chatApi, getIpcErrorMessage } from "@/api";
import { toast } from "sonner";
import { useChatStore } from "@/lib/stores/useChatStore";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { ttftBegin, ttftReport } from "@/lib/ttft";
import type { Message, Attachment } from "../../components/chat/types";
import { findWritableAssistantIndex, markMessageAsFailed } from "../stream/messageTarget";
import { createOptimisticChatMessages } from "./optimisticChatMessages";
import { preloadOpenUISystemPrompt } from "../../components/genui/promptLoader";
import { useVoiceStageStore } from "../../components/voice/voiceStageStore";

export function useSendMessage(
  currentSessionId: string | null,
  ensureSession?: () => Promise<string>,
) {
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
    systemPrompt?: string | null;
    systemPromptMode?: "append" | "replace" | null;
  }) => {
    let targetSessionId = currentSessionId;
    if (!targetSessionId && ensureSession) {
      targetSessionId = await ensureSession();
    }
    if (!targetSessionId) {
      console.warn("[useChat] Attempted to send message, but no active chat session is selected.");
      toast.error("Create or select a chat before sending.");
      return;
    }
    ttftBegin(targetSessionId);

    const store = useSettingsStore.getState();
    const activeProvider = data.provider || store.activeProvider || "ollama";

    const paramsStore = store.providerParams || {};
    const providerParams = paramsStore[activeProvider] || {};

    const temperature = Number(providerParams.temperature ?? store.temperature ?? 0.7);
    const maxTokens = Number(providerParams.maxTokens ?? store.maxTokens ?? 4096);

    const { userMessage, assistantMessage } = createOptimisticChatMessages({
      sessionId: targetSessionId,
      content: data.message,
      model: data.model,
      provider: activeProvider,
      deepResearch: data.deepResearch,
      generativeUI: data.generativeUI,
      tools: data.tools,
      attachments: data.attachments,
    });

    setSessionMessages(targetSessionId, (prev: Message[]) => [...prev, userMessage, assistantMessage]);

    useChatStore.getState().setStreamingForChat(targetSessionId, true);

    try {
      let systemPrompt: string | null = null;
      let systemPromptMode: "append" | "replace" | null = null;
      if (data.generativeUI) {
        systemPrompt = await preloadOpenUISystemPrompt();
      }
      if (data.systemPrompt?.trim()) {
        systemPrompt = data.systemPrompt;
        systemPromptMode = data.systemPromptMode ?? "append";

        if (systemPromptMode === "replace") {
          const boardBlocks = useVoiceStageStore.getState().blocks;
          const boardSummary = boardBlocks.length > 0
            ? boardBlocks
                .map((b, i) => `${i + 1}. [${b.kind}] ${b.title || ""}: ${(b as any).body || (b as any).value || ""}`)
                .join("\n")
            : "Board is currently empty.";

          systemPrompt = `${systemPrompt}\n\n## Visual Board Capabilities\nYou have access to a visual board displayed next to the user. You can update the board directly using the \`manage_board\` tool, or delegate complex/async data-gathering tasks to the \`voice_display\` subagent using \`spawn_agent\`.\n\n## Current Board State\n${boardSummary}\n\nPrefer targeted edits over full rewrites.`;
        }
      }

      await chatApi.sendMessage({
        chatId: targetSessionId,
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
        systemPromptMode,
      });
    } catch (e: unknown) {
      const errorMessage = getIpcErrorMessage(e, "Failed to send message");
      console.error("[useChat] 'send_message' IPC command failed:", e);
      ttftReport(targetSessionId, "send-error");
      setSessionMessages(targetSessionId, (prev: Message[]) => {
        const next = [...prev];
        const assistantIdx = findWritableAssistantIndex(next);
        if (assistantIdx !== -1) {
          next[assistantIdx] = markMessageAsFailed(next[assistantIdx], errorMessage);
        }
        return next;
      });
      useChatStore.getState().setStreamingForChat(targetSessionId, false);
      toast.error(errorMessage);
    }
  }, [currentSessionId, ensureSession, setSessionMessages]);

  return { handleSendMessage };
}
