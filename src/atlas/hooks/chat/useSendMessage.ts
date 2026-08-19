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
import { presentExecutionError } from "../../agentRuntime/executionError";

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
    imageGen?: boolean;
    attachments?: Attachment[];
    tools?: string[];
    systemPrompt?: string | null;
    systemPromptMode?: "append" | "replace" | null;
    /** Override target session — used by retry to route to the original session. */
    targetSessionId?: string;
    /** Automatic goal-continuation turn (useChatTurnAdvance): quiet timeline row. */
    goalContinuation?: boolean;
  }) => {
    let targetSessionId = data.targetSessionId || currentSessionId;
    // Capture fresh-session state BEFORE ensureSession potentially creates a
    // new chat — the title-maker should only auto-title when this is the very
    // first message of a brand new session (existing sessions keep their
    // user-set titles).
    const isFreshSession =
      !data.targetSessionId &&
      !currentSessionId &&
      typeof ensureSession === "function";
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

    // Resolve the selected model's real context window so the backend can
    // report context utilisation against the true model budget rather
    // than Zen's compaction cap. Prefer a provider-scoped match, then any
    // id match; null when the catalog has no window for this model.
    const modelContextWindow = (() => {
      const models = store.availableModels || [];
      const match =
        models.find(
          (m) => m.id === data.model && m.provider === activeProvider,
        ) || models.find((m) => m.id === data.model);
      const window = match?.contextWindow;
      return typeof window === "number" && window > 0 ? window : null;
    })();

    const generativeUIEnabled = data.generativeUI === true;

    const { userMessage, assistantMessage } = createOptimisticChatMessages({
      sessionId: targetSessionId,
      content: data.message,
      model: data.model,
      provider: activeProvider,
      deepResearch: data.deepResearch,
      generativeUI: generativeUIEnabled,
      tools: data.tools,
      attachments: data.attachments,
      messageKind: data.goalContinuation ? "goal_continuation" : undefined,
    });

    // Publish the optimistic turn before any abort IPC so a newly activated
    // welcome-to-chat scene mounts with visible content instead of an empty
    // timeline. A fresh session cannot have an active stream, so skip abort.
    setSessionMessages(targetSessionId, (prev: Message[]) => [
      ...supersedeStaleSendingAssistants(prev),
      userMessage,
      assistantMessage,
    ]);

    useChatStore.getState().setActiveAssistantForChat(targetSessionId, assistantMessage.id);
    useChatStore.getState().setStreamingForChat(targetSessionId, true);

    if (!isFreshSession) {
      try {
        await chatApi.abortChat(targetSessionId);
      } catch {
        // No active stream to abort — safe to continue.
      }
    }

    try {
      let systemPrompt: string | null = null;
      let systemPromptMode: "append" | "replace" | null = null;
      let genUiPrompt: string | null = null;
      if (generativeUIEnabled) {
        genUiPrompt = await preloadOpenUISystemPrompt();
        systemPrompt = genUiPrompt;
      }
      if (data.systemPrompt?.trim()) {
        systemPrompt = data.systemPrompt;
        systemPromptMode = data.systemPromptMode ?? "append";

        // A user prompt overwrites the GenUI contract in both append and
        // replace modes, silently disabling GenUI. Keep it by prepending.
        if (genUiPrompt) {
          systemPrompt = `${genUiPrompt}\n\n${systemPrompt}`;
        }

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
        seed: providerParams.seed != null ? Number(providerParams.seed) : null,
        stop: providerParams.stop,
        thinking: data.thinking,
        deepResearch: data.deepResearch,
        generativeUi: generativeUIEnabled,
        imageGen: data.imageGen,
        tools: data.tools,
        attachments: data.attachments,
        systemPrompt: systemPrompt,
        systemPromptMode,
        voiceDisplayContext: systemPromptMode === "replace" ? buildVoiceDisplayContext() : null,
        modelContextWindow,
        messageKind: data.goalContinuation ? "goal_continuation" : null,
      });

      // ── Title maker ─────────────────────────────────────────────────────
      // Fire-and-forget auto-title for fresh sessions. The runner continues
      // streaming the assistant reply regardless. The backend emits
      // `chat:title-updated` when generation finishes so the session list
      // updates without a refetch.
      if (isFreshSession && targetSessionId && data.message.trim()) {
        chatApi
          .generateSessionTitle(targetSessionId, data.message.trim())
          .catch((err) => {
            // Auto-titling is best-effort; failure must not break the send flow.
            console.warn(`[useSendMessage] title-maker failed for ${targetSessionId}:`, err);
          });
      }
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
      toast.error(presentExecutionError(errorMessage, { context: "transport" }).summary);
    }
  }, [currentSessionId, ensureSession, setSessionMessages]);

  return { handleSendMessage };
}
