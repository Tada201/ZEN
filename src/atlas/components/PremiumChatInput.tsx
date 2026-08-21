import { useState, useEffect, useMemo, memo, useCallback, useId } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/style";
import { IS_TAURI } from "@/api";

import { ActionPills } from "./chat/input/ActionPills";
import { ImagePresetStrip } from "./chat/input/ImagePresetStrip";
import { ModelSearchDropdown } from "./chat/input/ModelSearchDropdown";
import { SuggestedPromptStrip } from "./chat/input/SuggestedPromptStrip";
import { SlashCommandPopover } from "./chat/input/SlashCommandPopover";
import { useSlashCommand } from "./chat/input/useSlashCommand";
import type { ComposerLayoutMode, PremiumChatInputProps } from "./chat/input/PremiumChatInputTypes";
import { fileToAttachment } from "./chat/input/fileAttachments";
import { useComposerDrop } from "./chat/input/useComposerDrop";
import type { FileRejection } from "./chat/input/attachmentValidation";
import { useRenderLogger } from "@/hooks/useRenderLogger";

import { useAttachments } from "./AttachmentPills";
import {
  useChatInputModes,
  useReconcileThinking,
} from "./useChatInputModes";
import { useAutoResizeTextarea } from "./useAutoResizeTextarea";
import { useSendHandler } from "./useSendHandler";
import { useGenUISync } from "./useGenUISync";
import { usePinnedActions } from "./usePinnedActions";
import { useSlashApply } from "./useSlashApply";
import { useReasoningCapabilities } from "./useReasoningCapabilities";
import { usePromptStashStore } from "@/lib/stores/usePromptStashStore";
import { usePromptQueueStore, type QueuedPrompt } from "@/lib/stores/promptQueueStore";
import { GoalBanner } from "./chat/input/GoalBanner";
import { QueuedPromptsStrip } from "./chat/input/QueuedPromptsStrip";
import { ChatInputTextAreaBlock } from "./ChatInputTextAreaBlock";
import type { ChatInputTextAreaBlockProps } from "./ChatInputTextAreaBlock";
import { ChatInputFooter } from "./ChatInputFooter";
import type { ChatInputFooterProps } from "./ChatInputFooter";

/**
 * `PremiumChatInput` — the composer for the chat input surface.
 *
 * State orchestration + effect wiring for the six mode toggles
 * (web search, thinking + effort + budget, deep research, image gen,
 * generative UI), attachment state, slash command state, the
 * auto-resizing textarea, the selected-model + reasoning-capability
 * derivation, the chat-task drawer auto-open, the pinned action bar,
 * and the send / suggested-prompt dispatch.
 *
 * Each concern lives in a focused extracted module: `useChatInputModes`
 * (mode toggles), `useAttachments` (upload), `useSlashCommand` +
 * `useSlashApply` (slash popover), `useAutoResizeTextarea`, the
 * reasoning + chat-task hooks, and `useSendHandler`. The JSX is
 * composed from `ChatInputTextAreaBlock` + `ChatInputFooter` plus
 * a few already-thin sub-components. Files stay under the 350-line
 * warning limit.
 */

export const PremiumChatInput = memo(
  ({
    className,
    variant,
    onSend,
    onAbort,
    onPause,
    onResume,
    isPaused = false,
    isLoading,
    models,
    selectedModelId,
    selectedProvider,
    onSelectModel,
    onOpenModelSelector,
    onOpenSkills,
    activeChatId,
    workspaceRoot,
    readOnly = false,
    input: externalInput,
    onInputChange,
    generativeUI,
    onGenerativeUIChange,
    isSidebar,
  }: PremiumChatInputProps) => {
    useRenderLogger("PremiumChatInput", { activeChatId, isLoading });
    const isWelcome = variant === "welcome";
    const slashListboxId = `composer-slash-listbox-${useId().replace(/:/g, "")}`;

    // ── Message + mode toggles + auto-resize ──
    const [internalMessage, setInternalMessage] = useState("");
    const message = externalInput ?? internalMessage;
    const setMessage = onInputChange || setInternalMessage;
    const resetMessage = useCallback(() => setMessage(""), [setMessage]);
    const modes = useChatInputModes();
    const {
      isWebSearch, setIsWebSearch,
      isThinking, setIsThinking,
      thinkingEffort, setThinkingEffort,
      thinkingBudget, setThinkingBudget,
      isDeepResearch, setIsDeepResearch,
      isImageGenEnabled, setIsImageGenEnabled,
      buildThinkingPayload,
    } = modes;
    const { textareaRef, containerRef, isCompact } = useAutoResizeTextarea({
      message,
      isSidebar,
    });
    const layoutMode: ComposerLayoutMode = isWelcome
      ? "welcome"
      : isSidebar
        ? "sidebar"
        : isCompact
          ? "narrow"
          : "default";

    // ── Local UI state ──
    const [selectedModelOpen, setSelectedModelOpen] = useState(false);
    const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
    const setPlusMenuOpen = useCallback((open: boolean) => {
      setIsPlusMenuOpen(open);
      if (open) setSelectedModelOpen(false);
    }, []);
    const setModelMenuOpen = useCallback((open: boolean) => {
      setSelectedModelOpen(open);
      if (open) setIsPlusMenuOpen(false);
    }, []);
    const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
    const [pinnedActions, togglePin] = usePinnedActions();

    // ── Slash command popover state ──
    const slash = useSlashCommand(message, workspaceRoot);
    const slashIsPopoverOpen = slash.isActive
      && slash.suggestions.length > 0
      && !isPlusMenuOpen
      && !selectedModelOpen;
    useEffect(() => {
      setSlashSelectedIndex(0);
    }, [slash.query, slash.isActive]);

    // ── Attachment state ──
    const { selectedFiles, addFiles, removeFile, clearFiles } =
      useAttachments();

    // ── Prompt stash (save draft in any chat, restore in any other) ──
    const hasStash = usePromptStashStore((state) => state.stash !== null);
    const stashDraft = usePromptStashStore((state) => state.stashDraft);
    const restoreDraft = usePromptStashStore((state) => state.restoreDraft);
    const handleStash = useCallback(() => {
      void stashDraft(message, selectedFiles);
    }, [stashDraft, message, selectedFiles]);
    const handleRejections = useCallback((rejected: FileRejection[]) => {
      if (rejected.length === 0) return;
      // Collapse to one toast; list the first few names so the user knows which.
      const shown = rejected.slice(0, 3)
        .map((r) => `${r.name} (${r.reason})`)
        .join(", ");
      const more = rejected.length > 3 ? ` +${rejected.length - 3} more` : "";
      toast.error(
        rejected.length === 1
          ? `Couldn't attach ${shown}`
          : `Couldn't attach ${rejected.length} files: ${shown}${more}`,
      );
    }, []);
    const handleRestore = useCallback(() => {
      const restored = restoreDraft();
      if (!restored) return;
      if (restored.text) setMessage(restored.text);
      if (restored.images.length > 0) handleRejections(addFiles(restored.images));
    }, [restoreDraft, setMessage, addFiles, handleRejections]);
    const handleFileChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) handleRejections(addFiles(e.target.files));
        // Reset so re-selecting the same file re-fires onChange.
        e.target.value = "";
        setIsPlusMenuOpen(false);
      },
      [addFiles, handleRejections],
    );
    const drop = useComposerDrop(addFiles, handleRejections, readOnly);

    // ── Generative UI sync (extracted hook) ──
    const [internalGenerativeUI, setGenerativeUIInternal] = useGenUISync(
      generativeUI,
      onGenerativeUIChange,
    );

    // ── Selected model + reasoning capability + auto-disable ──
    // Model capabilities are resolved only by the exact provider/model pair;
    // the resolver intentionally never falls back to another provider's row.
    // Canonical lookup: models.find(m => m.id === selectedModelId && m.provider === selectedProvider)
    const {
      selectedModelInfo,
      capability: reasoningCapability,
      showControl: showReasoningControl,
    } = useReasoningCapabilities(models, selectedModelId, selectedProvider);
    const supportsImageGen = Boolean(
      selectedModelInfo?.available && selectedModelInfo.capabilities.includes("image-gen"),
    );
    useReconcileThinking({
      capability: reasoningCapability,
      isThinking,
      setIsThinking,
      thinkingEffort,
      setThinkingEffort,
      thinkingBudget,
      setThinkingBudget,
    });
    useEffect(() => {
      if (!supportsImageGen && isImageGenEnabled) setIsImageGenEnabled(false);
    }, [isImageGenEnabled, setIsImageGenEnabled, supportsImageGen]);

    // Persisted pins can outlive a provider/model capability change. Filter
    // them at the composer boundary so unsupported actions disappear cleanly
    // instead of leaving an empty rail or hiding the action from the add menu.
    const visiblePinnedActions = useMemo(
      () => pinnedActions.filter((actionId) =>
        actionId === "search" ||
        actionId === "research" ||
        actionId === "genui" ||
        (actionId === "thinking" && showReasoningControl),
      ),
      [pinnedActions, showReasoningControl],
    );
    // ── Slash apply (extracted hook) ──
    const applySlashSuggestion = useSlashApply(setMessage, textareaRef);

    // ── Send / suggested-prompt dispatch via useSendHandler ──
    const convertFiles = useCallback(
      (files: File[]) => Promise.all(files.map(fileToAttachment)),
      [],
    );
    const sendCtx = useMemo(
      () => ({
        message,
        selectedFiles,
        isLoading,
        isPaused,
        onAbort,
        onResume,
        activeChatId,
        selectedModelId,
        selectedProvider,
        selectedModelInfo,
        isWebSearch,
        isDeepResearch,
        isImageGenEnabled: supportsImageGen && isImageGenEnabled,
        internalGenerativeUI,
        reasoningCapability,
        buildThinkingPayload,
        onSend,
        convertFiles,
        resetMessage,
        resetFiles: clearFiles,
      }),
      [
        message, selectedFiles, isLoading, isPaused, onAbort, onResume, activeChatId,
        selectedModelId, selectedProvider, selectedModelInfo,
        isWebSearch, isDeepResearch, isImageGenEnabled, supportsImageGen,
        internalGenerativeUI, reasoningCapability,
        buildThinkingPayload, onSend,
        convertFiles, resetMessage, clearFiles,
      ],
    );
    const { handleSend, handleSuggestedClick } = useSendHandler(sendCtx);

    // ── Prompt queue display (per-chat) ──
    const EMPTY_QUEUE: QueuedPrompt[] = [];
    const queuedPrompts = usePromptQueueStore(
      (s) => (activeChatId ? s.queues[activeChatId] ?? EMPTY_QUEUE : EMPTY_QUEUE),
    );
    const removeQueuedPrompt = useCallback(
      (id: string) => {
        if (activeChatId) usePromptQueueStore.getState().remove(activeChatId, id);
      },
      [activeChatId],
    );
    const sendQueuedPromptNow = useCallback(
      (item: QueuedPrompt) => {
        if (!activeChatId) return;
        if (isLoading) {
          toast.info("Still streaming — the prompt stays queued.");
          return;
        }
        usePromptQueueStore.getState().remove(activeChatId, item.id);
        onSend({
          message: item.payload.message,
          model: item.payload.model,
          provider: item.payload.provider,
          webSearch: item.payload.webSearch ?? false,
          deepResearch: item.payload.deepResearch ?? false,
          generativeUI: item.payload.generativeUI ?? false,
          imageGen: item.payload.imageGen,
          files: [],
          attachments: item.payload.attachments ?? [],
          thinking: item.payload.thinking ?? { enabled: false },
        });
      },
      [activeChatId, isLoading, onSend],
    );

    // ── Memoized prop buckets for the extracted JSX blocks ──
    // Use `useMemo` so the prop object identity is stable per render
    // span and child re-renders stay minimal.
    const textAreaProps = useMemo<ChatInputTextAreaBlockProps>(
      () => ({
        layoutMode,
        textareaRef,
        value: message,
        onChange: setMessage,
      onSend: handleSend,
        readOnly,
      slashIsPopoverOpen,
        slashSelectedIndex,
        slashListboxId,
        setSlashSelectedIndex,
        slashSuggestions: slash.suggestions,
        applySlashSuggestion,
      }),
      [
        layoutMode, readOnly,
        textareaRef, message, setMessage,
        handleSend, slashIsPopoverOpen, slashSelectedIndex, slashListboxId,
        setSlashSelectedIndex, slash.suggestions, applySlashSuggestion,
      ],
    );

    const footerProps = useMemo<ChatInputFooterProps>(
      () => ({
        layoutMode,
        selectedModelOpen,
        setSelectedModelOpen: setModelMenuOpen,
        models,
        selectedModelId,
        selectedProvider,
        onSelectModel,
        onOpenModelSelector,
        pinnedActions: visiblePinnedActions,
        togglePin,
        reasoningCapability,
        isThinking,
        setIsThinking,
        thinkingEffort,
        setThinkingEffort,
        thinkingBudget,
        setThinkingBudget,
        isWebSearch,
        setIsWebSearch,
        isDeepResearch,
        setIsDeepResearch,
        generativeUI: internalGenerativeUI,
        setGenerativeUI: setGenerativeUIInternal,
        isPlusMenuOpen,
        setIsPlusMenuOpen: setPlusMenuOpen,
        handleFileChange,
        onOpenSkills,
        isImageGenEnabled,
        setIsImageGenEnabled,
        supportsImageGen,
        onAbort,
        onPause,
        onResume,
        isPaused,
        // `PremiumChatInputProps.activeChatId` is `string | null | undefined`;
        // `ChatInputFooterProps.activeChatId` is `string | undefined`. Coerce
        // the source null into undefined so footer's optional field stays in
        // shape.
        activeChatId: activeChatId ?? undefined,
        readOnly,
        onSend: handleSend,
        isLoading,
        hasContent: message.trim().length > 0 || selectedFiles.length > 0,
        onStash: handleStash,
        onRestore: handleRestore,
        hasStash,
      }),
      [
        layoutMode, selectedModelOpen, setModelMenuOpen,
        models, selectedModelId, selectedProvider,
        onSelectModel, onOpenModelSelector,
        visiblePinnedActions, togglePin, reasoningCapability,
        isThinking, setIsThinking,
        thinkingEffort, setThinkingEffort, thinkingBudget, setThinkingBudget,
        isWebSearch, setIsWebSearch, isDeepResearch, setIsDeepResearch,
        internalGenerativeUI, setGenerativeUIInternal,
        isPlusMenuOpen, setPlusMenuOpen, handleFileChange,
        onOpenSkills, isImageGenEnabled, setIsImageGenEnabled, supportsImageGen,
        onAbort, onPause, onResume, isPaused,
        activeChatId, readOnly, handleSend, isLoading, message, selectedFiles.length,
        handleStash, handleRestore, hasStash,
      ],
    );

    return (
      <div className="flex flex-col gap-1.5 w-full relative">
        {!IS_TAURI && !readOnly && (
          <SuggestedPromptStrip
            isLoading={isLoading}
            onSelect={handleSuggestedClick}
          />
        )}
        {/* Above the composer: the session goal banner and the prompt queue.
            The space above the input is reserved for exactly these two —
            queued prompts waiting for the running turn and the /goal state. */}
        {!isWelcome && !readOnly && activeChatId && (
          <>
            <GoalBanner chatId={activeChatId} />
            <QueuedPromptsStrip
              items={queuedPrompts}
              onRemove={removeQueuedPrompt}
              onSendNow={sendQueuedPromptNow}
            />
          </>
        )}
        {/* The composer owns live textarea and optional-row geometry. Layout
            projection is intentionally disabled: Motion's transform-based
            layout animation would visually animate every wrap/height change,
            competing with the resize observer and moving the submit target. */}
        <div
          ref={containerRef}
          data-layout-mode={layoutMode}
          onDragEnter={drop.onDragEnter}
          onDragOver={drop.onDragOver}
          onDragLeave={drop.onDragLeave}
          onDrop={drop.onDrop}
          className={cn(
            "composer-shell relative w-full overflow-visible",
            isWelcome && "composer-shell--welcome",
            className,
            isLoading && "composer-shell--loading",
            drop.isDragging && "composer-shell--dragging",
          )}
        >
          {drop.isDragging && !readOnly && (
            <div
              className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] border-2 border-dashed border-primary/60 bg-primary/10 backdrop-blur-sm"
              aria-hidden="true"
            >
              <span className="text-sm font-medium text-primary">Drop files to attach</span>
            </div>
          )}
          <SlashCommandPopover
            isOpen={!readOnly && slashIsPopoverOpen}
            suggestions={slash.suggestions}
            selectedIndex={slashSelectedIndex}
            listboxId={slashListboxId}
            onSelect={applySlashSuggestion}
            onHover={setSlashSelectedIndex}
          />
          <div className="flex flex-col">
            {layoutMode === "sidebar" && !readOnly && (
              <div className="composer-toolbar px-2 pt-1 flex items-center justify-between border-b">
                <ModelSearchDropdown
                  isOpen={selectedModelOpen}
                  setIsOpen={setModelMenuOpen}
                  models={models}
                  selectedModelId={selectedModelId}
                  selectedProvider={selectedProvider}
                  onSelectModel={onSelectModel}
                  onOpenModelSelector={onOpenModelSelector}
                  isCompact={isCompact}
                />
              </div>
            )}
            {!readOnly && <ActionPills
              selectedFiles={selectedFiles}
              removeFile={removeFile}
            />}
            {!readOnly && <div className="px-2 pt-1">
              <ImagePresetStrip
                isImageGenEnabled={isImageGenEnabled}
                onSelectPreset={(presetPrompt: string) => {
                  const trimmed = message.trim();
                  setMessage(
                    trimmed ? `${trimmed}, ${presetPrompt}` : presetPrompt,
                  );
                }}
              />
            </div>}

            <ChatInputTextAreaBlock {...textAreaProps} />
            <ChatInputFooter {...footerProps} />
          </div>
        </div>
      </div>
    );
  },
);

export default PremiumChatInput;
