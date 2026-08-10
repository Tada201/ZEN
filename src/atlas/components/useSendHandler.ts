/**
 * `useSendHandler` — owns the two click-handlers that the chat input
 * composer wires to its send / suggested-prompt buttons. Carved out
 * of `PremiumChatInput.tsx` so the composer no longer carries ~80 lines
 * of inline handler bodies.
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
 * `selectedPrompt` lived in the composer for an unused PromptPicker
 * integration; it is retained inside this hook as a no-op state slot
 * so a future wiring can drop in without re-touching the caller.
 */

import { useCallback, useState } from "react";
import type { Attachment } from "./chat/types";
import type { PromptDefinition } from "./chat/promptRegistry";
import type { ThinkingPayload } from "./chat/input/PremiumChatInputTypes";

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
  onAbort?: () => void;
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
  /**
   * Currently unused — preserved so a future PromptPicker integration
   * can wire it without touching the caller.
   */
  selectedPrompt: PromptDefinition | null;
  setSelectedPrompt: (val: PromptDefinition | null) => void;
  /** Wired to `<button onClick>` and used after a successful send. */
  handleSend: () => Promise<void>;
  /** Wired to `<SuggestedPromptStrip onSelect>`. */
  handleSuggestedClick: (promptText: string) => void;
}

export function useSendHandler(ctx: UseSendHandlerCtx): UseSendHandlerResult {
  const [selectedPrompt, setSelectedPrompt] = useState<PromptDefinition | null>(null);

  const handleSend = useCallback(async () => {
    if (ctx.isLoading) {
      ctx.onAbort?.();
      return;
    }
    if (!ctx.message.trim() && ctx.selectedFiles.length === 0) return;

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
    setSelectedPrompt(null);
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
        generativeUI: promptText.includes("genui") || ctx.internalGenerativeUI,
        imageGen: ctx.isImageGenEnabled,
        files: [],
        attachments: [],
        thinking: ctx.buildThinkingPayload(ctx.supportsReasoning, ctx.reasoningConfigType),
        provider: providerId,
      });
    },
    [ctx],
  );

  return { selectedPrompt, setSelectedPrompt, handleSend, handleSuggestedClick };
}

export default useSendHandler;
