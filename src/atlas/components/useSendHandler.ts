/**
 * `useSendHandler` — owns the two click-handlers that the chat input
 * composer wires to its send / suggested-prompt buttons. Carved out
 * of `PremiumChatInput.tsx` so the composer no longer carries ~80 lines
 * of inline handler bodies.
 *
 * Submit semantics (one meaning for the submit control, always):
 * 1. `/goal …` runs client-side immediately (set/pause/resume/clear/view).
 * 2. `/compact …` runs client-side immediately (manual context
 *    compaction); it is never enqueued and never reaches the model.
 * 3. While a turn is streaming, submitting enqueues the prompt per chat
 *    (`usePromptQueueStore`) instead of aborting the run. Stopping and
 *    pausing are dedicated footer controls.
 * 4. Otherwise the prompt dispatches through `ctx.onSend` normally.
 *
 * The hook takes a single `ctx` argument containing every value the
 * send / suggested-prompt pipelines read; both handlers close over
 * those values via the `ctx` reference. We intentionally do NOT
 * memoize the returned callbacks because neither is passed to a
 * memoised child component — both go straight to
 * `<button onClick={handleSend}>` and
 * `<SuggestedPromptStrip onSelect={handleSuggestedClick}>` — re-creating
 * the closures per render is cheap.
 *
 * `convertFiles` is supplied by the composer (it forwards the existing
 * `./chat/input/fileAttachments::fileToAttachment` helper) so this hook
 * does not need to know how a `File[]` becomes an `Attachment[]`.
 * Keeping that conversion out of the hook preserves the existing chat
 * pipeline semantics byte-for-byte.
 *
 * Prompt selection is intentionally not owned here; suggested prompts
 * dispatch through the same send context without introducing a second
 * composer state field.
 */

import { useCallback } from "react";
import { toast } from "sonner";
import type { Attachment } from "./chat/types";
import type { ThinkingPayload } from "./chat/input/PremiumChatInputTypes";
import { executeGoalCommand, parseGoalCommand } from "./chat/input/slashGoal";
import { executeCompactCommand, parseCompactCommand } from "./chat/input/slashCompact";
import { usePromptQueueStore } from "@/lib/stores/promptQueueStore";
import { useSkillsRegistryStore } from "@/lib/stores/skillsRegistryStore";

export interface UseSendHandlerCtx {
  /** Composer-driven state. */
  message: string;
  selectedFiles: File[];
  /**
   * Reflects the running model loop. Optional because the composing
   * input's `PremiumChatInputProps.isLoading` is `boolean | undefined`;
   * the hook treats `undefined` as "not loading" (no abort, no guard).
   */
  isLoading?: boolean;
  isPaused?: boolean;
  onAbort?: () => void;
  onResume?: () => void;
  /** Chat the composer is bound to; queueing and /goal are scoped to it. */
  activeChatId?: string | null;
  /** Composer-driven selectors. */
  selectedModelId?: string;
  selectedProvider?: string;
  selectedModelInfo: { id?: string; provider?: string } | null;
  /** Mode flags. */
  isWebSearch: boolean;
  isDeepResearch: boolean;
  isImageGenEnabled: boolean;
  internalGenerativeUI: boolean;
  supportsReasoning: boolean;
  reasoningConfigType: string;
  /** Reasoning payload builder from `useChatInputModes`. */
  buildThinkingPayload: (supportsReasoning: boolean, reasoningConfigType: string) => ThinkingPayload;
  /** Composer callbacks. */
  onSend: (args: {
    message: string;
    model: string;
    webSearch: boolean;
    deepResearch: boolean;
    generativeUI: boolean;
    imageGen: boolean;
    files: File[];
    attachments: Attachment[];
    thinking: ThinkingPayload;
    provider: string;
  }) => void;
  /**
   * Convert selected `File[]` → `Attachment[]`. The composer supplies
   * the existing `fileToAttachment` helper (`./chat/input/fileAttachments`)
   * so behaviour stays identical.
   */
  convertFiles: (files: File[]) => Promise<Attachment[]>;
  /** Resetters invoked after a successful `handleSend`. */
  resetMessage: () => void;
  resetFiles: () => void;
}

export interface UseSendHandlerResult {
  /** Wired to `<button onClick>` and used after a successful send. */
  handleSend: () => Promise<void>;
  /** Wired to `<SuggestedPromptStrip onSelect>`. */
  handleSuggestedClick: (promptText: string) => void;
}

export function useSendHandler(ctx: UseSendHandlerCtx): UseSendHandlerResult {
  const handleSend = useCallback(async () => {
    // `/goal` is a client-side command: it resolves immediately, even while
    // a turn is streaming, and never reaches the model.
    const goalCommand = parseGoalCommand(ctx.message);
    if (goalCommand) {
      if (!ctx.activeChatId) {
        toast.error("Start or select a chat before using /goal.");
        return;
      }
      await executeGoalCommand(ctx.activeChatId, goalCommand);
      ctx.resetMessage();
      return;
    }

    // `/compact` is a client-side command: it compacts the chat context
    // immediately. It must NEVER be enqueued into the prompt queue while a
    // turn is streaming — the executor refuses and toasts instead.
    const compactCommand = parseCompactCommand(ctx.message);
    if (compactCommand) {
      void executeCompactCommand(compactCommand, {
        chatId: ctx.activeChatId,
        isLoading: ctx.isLoading,
      });
      ctx.resetMessage();
      return;
    }

    // `/skills` opens the skills registry dialog client-side; it never reaches
    // the model. (Skill *invocation* — `/name` or `$name` — travels to the
    // backend where the loop expands and injects the body.)
    if (ctx.message.trim() === "/skills") {
      useSkillsRegistryStore.getState().open();
      ctx.resetMessage();
      return;
    }

    if (!ctx.message.trim() && ctx.selectedFiles.length === 0) return;

    // While a turn is running, submit = queue (Cursor-style). Stopping is a
    // dedicated footer control; the submit button keeps one meaning.
    if (ctx.isLoading && ctx.activeChatId) {
      const attachments = await ctx.convertFiles(ctx.selectedFiles);
      const selectedModelId = ctx.selectedModelId;
      const selectedProvider = ctx.selectedProvider;
      const selectedModelInfo = ctx.selectedModelInfo;
      usePromptQueueStore.getState().enqueue(ctx.activeChatId, {
        message: ctx.message,
        model: selectedModelId || selectedModelInfo?.id || "No Model",
        provider: selectedProvider || selectedModelInfo?.provider || "ollama",
        webSearch: ctx.isWebSearch,
        thinking: ctx.buildThinkingPayload(ctx.supportsReasoning, ctx.reasoningConfigType),
        deepResearch: ctx.isDeepResearch,
        generativeUI: ctx.internalGenerativeUI,
        imageGen: ctx.isImageGenEnabled,
        attachments,
        tools: undefined,
      });
      const length = usePromptQueueStore.getState().queues[ctx.activeChatId]?.length ?? 0;
      toast.success(
        length === 1 ? "Queued — sends when this turn finishes." : `Queued (${length} waiting).`,
      );
      ctx.resetMessage();
      ctx.resetFiles();
      return;
    }

    const selectedModelId = ctx.selectedModelId;
    const selectedProvider = ctx.selectedProvider;
    const selectedModelInfo = ctx.selectedModelInfo;
    const modelId = selectedModelId || selectedModelInfo?.id || "No Model";
    const providerId = selectedProvider || selectedModelInfo?.provider || "ollama";
    const attachments = await ctx.convertFiles(ctx.selectedFiles);

    ctx.onSend({
      message: ctx.message,
      model: modelId,
      webSearch: ctx.isWebSearch,
      deepResearch: ctx.isDeepResearch,
      generativeUI: ctx.internalGenerativeUI,
      imageGen: ctx.isImageGenEnabled,
      files: ctx.selectedFiles,
      attachments,
      thinking: ctx.buildThinkingPayload(ctx.supportsReasoning, ctx.reasoningConfigType),
      provider: providerId,
    });

    ctx.resetMessage();
    ctx.resetFiles();
  }, [
    ctx,
  ]);

  const handleSuggestedClick = useCallback(
    (promptText: string) => {
      if (ctx.isLoading) return;
      const modelId = ctx.selectedModelId || ctx.selectedModelInfo?.id;
      const providerId = ctx.selectedProvider || ctx.selectedModelInfo?.provider;
      if (!modelId || !providerId) return;

      ctx.onSend({
        message: promptText,
        model: modelId,
        webSearch: ctx.isWebSearch,
        deepResearch: ctx.isDeepResearch,
        // Suggested prompts must not silently elevate a disabled capability.
        // GenUI is an explicit composer capability, never a text heuristic.
        generativeUI: ctx.internalGenerativeUI,
        imageGen: ctx.isImageGenEnabled,
        files: [],
        attachments: [],
        thinking: ctx.buildThinkingPayload(ctx.supportsReasoning, ctx.reasoningConfigType),
        provider: providerId,
      });
    },
    [ctx],
  );

  return { handleSend, handleSuggestedClick };
}

export default useSendHandler;
