import { useCallback } from "react";
import { chatApi, getIpcErrorMessage } from "@/api";
import { toast } from "sonner";
import { useChatStore } from "@/lib/stores/useChatStore";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { ttftBegin, ttftReport } from "@/lib/ttft";
import type { Message, Attachment } from "../../components/chat/types";
import { findWritableAssistantIndex, markMessageAsFailed, supersedeStaleSendingAssistants } from "../stream/messageTarget";
import { createOptimisticChatMessages } from "./optimisticChatMessages";
import { preloadOpenUISystemPrompt } from "../../components/genui/promptLoader";
import { useVoiceStageStore } from "../../components/voice/voiceStageStore";
import { buildVoiceDisplayContext } from "../../components/voice/voiceDisplayContext";

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

    try {
      await chatApi.abortChat(targetSessionId);
    } catch {
      // No active stream to abort — safe to continue.
    }

    setSessionMessages(targetSessionId, (prev: Message[]) => [
      ...supersedeStaleSendingAssistants(prev),
      userMessage,
      assistantMessage,
    ]);

    useChatStore.getState().setActiveAssistantForChat(targetSessionId, assistantMessage.id);
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
          const boardBlocks = useVoiceStageStore.getState().document.widgets;
          const boardSummary = boardBlocks.length > 0
            ? boardBlocks
                .map((b, i) => `${i + 1}. [${b.kind}] ${b.title || ""}: ${(b as any).body || (b as any).value || ""}`)
                .join("\n")
            : "Board is currently empty.";

          systemPrompt = `${systemPrompt}\n\n## Voice Display Contract\nA dedicated render-only display agent automatically receives the user's complete original request after your response and owns all visual-board updates. Do not call \`manage_board\`, do not spawn \`voice_display\`, and never output SVG, drawing code, JSON, tool arguments, or board markup. Use normal task subagents only when research, computation, or data preparation is needed. When the user requests a drawing or visualization, respond with one short speakable status sentence telling them to wait while the display agent draws it. Never send the display agent an empty-content request: ask one concise clarification when required user-specific facts are missing, or authorize sensible labeled sample content when the user permits a demo, example, random data, or self-generation. For requests to search and display YouTube or external media, perform the search in the main pipeline; recent tool results are handed to the display agent, which must use a dedicated video widget rather than HTML. The display agent can place a live camera widget when the user asks to show, open, or enable their camera. In that case, say the camera panel is ready and ask the user to click "Enable camera" to grant permission; never claim the camera was activated automatically. Do not reproduce the visual specification as code.\n\n## Current Board State\n${boardSummary}\n\nYou may briefly acknowledge whether the request is a new board or an edit, but the automatic display agent receives the original request directly.`;
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
        voiceDisplayContext: systemPromptMode === "replace" ? buildVoiceDisplayContext() : null,
      });
    } catch (e: unknown) {
      const errorMessage = getIpcErrorMessage(e, "Failed to send message");
      console.error("[useChat] 'send_message' IPC command failed:", e);
      ttftReport(targetSessionId, "send-error");
      setSessionMessages(targetSessionId, (prev: Message[]) => {
        const next = [...prev];
        const assistantIdx = findWritableAssistantIndex(next, targetSessionId);
        if (assistantIdx !== -1) {
          next[assistantIdx] = markMessageAsFailed(next[assistantIdx], errorMessage);
        }
        return next;
      });
      useChatStore.getState().setActiveAssistantForChat(targetSessionId, null);
      useChatStore.getState().setStreamingForChat(targetSessionId, false);
      toast.error(errorMessage);
    }
  }, [currentSessionId, ensureSession, setSessionMessages]);

  return { handleSendMessage };
}
