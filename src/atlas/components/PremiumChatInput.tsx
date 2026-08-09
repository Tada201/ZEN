import { useState, useEffect, useMemo, memo, useCallback } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils/style";
import { IS_TAURI } from "@/api";

import { ActionPills } from "./chat/input/ActionPills";
import { ImagePresetStrip } from "./chat/input/ImagePresetStrip";
import { ModelSearchDropdown } from "./chat/input/ModelSearchDropdown";
import { TaskDrawer } from "./chat/input/TaskDrawer";
import { SuggestedPromptStrip } from "./chat/input/SuggestedPromptStrip";
import { SlashCommandPopover } from "./chat/input/SlashCommandPopover";
import { useSlashCommand } from "./chat/input/useSlashCommand";
import type { PremiumChatInputProps } from "./chat/input/PremiumChatInputTypes";
import { fileToAttachment } from "./chat/input/fileAttachments";
import { useRenderLogger } from "@/hooks/useRenderLogger";

import { useAttachments } from "./AttachmentPills";
import {
  useChatInputModes,
  useAutoDisableThinking,
} from "./useChatInputModes";
import { useAutoResizeTextarea } from "./useAutoResizeTextarea";
import { useSendHandler } from "./useSendHandler";
import { useGenUISync } from "./useGenUISync";
import { usePinnedActions } from "./usePinnedActions";
import { useSlashApply } from "./useSlashApply";
import { useReasoningCapabilities } from "./useReasoningCapabilities";
import { useChatTaskDrawer } from "./useChatTaskDrawer";
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
    isLoading,
    models,
    selectedModelId,
    selectedProvider,
    onSelectModel,
    onOpenModelSelector,
    onOpenSkills,
    activeChatId,
    readOnly = false,
    input: externalInput,
    onInputChange,
    generativeUI,
    onGenerativeUIChange,
    isSidebar,
  }: PremiumChatInputProps) => {
    useRenderLogger("PremiumChatInput", { activeChatId, isLoading });
    const isWelcome = variant === "welcome";

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

    // ── Local UI state ──
    const [selectedModelOpen, setSelectedModelOpen] = useState(false);
    const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
    const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
    const [pinnedActions, togglePin] = usePinnedActions();
    const {
      visibleTasks,
      isOpen: isTaskDrawerOpen,
      setIsOpen: setIsTaskDrawerOpen,
    } = useChatTaskDrawer(activeChatId);

    // ── Slash command popover state ──
    const slash = useSlashCommand(message);
    const slashIsPopoverOpen = slash.isActive && slash.suggestions.length > 0;
    useEffect(() => {
      setSlashSelectedIndex(0);
    }, [slash.query, slash.isActive]);

    // ── Attachment state ──
    const { selectedFiles, addFiles, removeFile, clearFiles } =
      useAttachments();
    const handleFileChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) addFiles(e.target.files);
        setIsPlusMenuOpen(false);
      },
      [addFiles],
    );

    // ── Generative UI sync (extracted hook) ──
    const [internalGenerativeUI, setGenerativeUIInternal] = useGenUISync(
      generativeUI,
      onGenerativeUIChange,
    );

    // ── Selected model + reasoning capability + auto-disable ──
    const {
      selectedModelInfo,
      supportsReasoning,
      reasoningConfigType,
    } = useReasoningCapabilities(models, selectedModelId, selectedProvider);
    useAutoDisableThinking(supportsReasoning, isThinking, setIsThinking);
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
        onAbort,
        selectedModelId,
        selectedProvider,
        selectedModelInfo,
        isWebSearch,
        isDeepResearch,
        isImageGenEnabled,
        internalGenerativeUI,
        supportsReasoning,
        reasoningConfigType,
        buildThinkingPayload,
        onSend,
        convertFiles,
        resetMessage,
        resetFiles: clearFiles,
      }),
      [
        message, selectedFiles, isLoading, onAbort,
        selectedModelId, selectedProvider, selectedModelInfo,
        isWebSearch, isDeepResearch, isImageGenEnabled,
        internalGenerativeUI, supportsReasoning, reasoningConfigType,
        buildThinkingPayload, onSend,
        convertFiles, resetMessage, clearFiles,
      ],
    );
    const { handleSend, handleSuggestedClick } = useSendHandler(sendCtx);

    // ── Memoized prop buckets for the extracted JSX blocks ──
    // Use `useMemo` so the prop object identity is stable per render
    // span and child re-renders stay minimal.
    const textAreaProps = useMemo<ChatInputTextAreaBlockProps>(
      () => ({
        isPlusMenuOpen,
        setIsPlusMenuOpen,
        handleFileChange,
        pinnedActions,
        togglePin,
        supportsReasoning,
        isThinking,
        setIsThinking,
        isDeepResearch,
        setIsDeepResearch,
        isWebSearch,
        setIsWebSearch,
        generativeUI: internalGenerativeUI,
        setGenerativeUI: setGenerativeUIInternal,
        onOpenSkills,
        isImageGenEnabled,
        setIsImageGenEnabled,
        variant,
        textareaRef,
        value: message,
        onChange: setMessage,
      onSend: handleSend,
        readOnly,
      slashIsPopoverOpen,
        slashSelectedIndex,
        setSlashSelectedIndex,
        slashSuggestions: slash.suggestions,
        applySlashSuggestion,
      }),
      [
        isPlusMenuOpen, setIsPlusMenuOpen, handleFileChange,
        pinnedActions, togglePin, supportsReasoning,
        isThinking, setIsThinking, isDeepResearch, setIsDeepResearch,
        isWebSearch, setIsWebSearch,
        internalGenerativeUI, setGenerativeUIInternal,
        onOpenSkills, isImageGenEnabled, setIsImageGenEnabled,
        variant, readOnly,
        textareaRef, message, setMessage,
        handleSend, slashIsPopoverOpen, slashSelectedIndex,
        setSlashSelectedIndex, slash.suggestions, applySlashSuggestion,
      ],
    );

    const footerProps = useMemo<ChatInputFooterProps>(
      () => ({
        isCompact,
        isSidebar,
        selectedModelOpen,
        setSelectedModelOpen,
        models,
        selectedModelId,
        selectedProvider,
        onSelectModel,
        onOpenModelSelector,
        pinnedActions,
        togglePin,
        supportsReasoning,
        isThinking,
        setIsThinking,
        reasoningConfigType,
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
        variant,
        isPlusMenuOpen,
        setIsPlusMenuOpen,
        handleFileChange,
        onOpenSkills,
        isImageGenEnabled,
        setIsImageGenEnabled,
        // `PremiumChatInputProps.activeChatId` is `string | null | undefined`;
        // `ChatInputFooterProps.activeChatId` is `string | undefined`. Coerce
        // the source null into undefined so footer's optional field stays in
        // shape.
        activeChatId: activeChatId ?? undefined,
        readOnly,
        onSend: handleSend,
        isLoading,
        hasContent: message.trim().length > 0 || selectedFiles.length > 0,
      }),
      [
        isCompact, isSidebar, selectedModelOpen, setSelectedModelOpen,
        models, selectedModelId, selectedProvider,
        onSelectModel, onOpenModelSelector,
        pinnedActions, togglePin, supportsReasoning,
        isThinking, setIsThinking, reasoningConfigType,
        thinkingEffort, setThinkingEffort, thinkingBudget, setThinkingBudget,
        isWebSearch, setIsWebSearch, isDeepResearch, setIsDeepResearch,
        internalGenerativeUI, setGenerativeUIInternal,
        variant, isPlusMenuOpen, setIsPlusMenuOpen, handleFileChange,
        onOpenSkills, isImageGenEnabled, setIsImageGenEnabled,
        activeChatId, readOnly, handleSend, isLoading, message, selectedFiles.length,
      ],
    );

    return (
      <div className="flex flex-col gap-2.5 w-full relative">
        {!IS_TAURI && !readOnly && (
          <SuggestedPromptStrip
            isLoading={isLoading}
            onSelect={handleSuggestedClick}
          />
        )}
        <motion.div
          ref={containerRef}
          layout
          transition={{
            layout: { duration: 0.72, ease: [0.22, 1, 0.36, 1] },
            default: { duration: 0.42, ease: [0.22, 1, 0.36, 1] },
          }}
          className={cn(
            "w-full relative overflow-visible transition-all duration-200",
            isWelcome
              ? "rounded-b-xl border border-border bg-card shadow-sm"
              : "rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl",
            className,
            isLoading &&
              "ring-1 ring-primary/40 shadow-[0_0_15px_-3px_rgba(var(--primary-rgb),0.1)]",
          )}
        >
          <SlashCommandPopover
            isOpen={!readOnly && slashIsPopoverOpen}
            suggestions={slash.suggestions}
            selectedIndex={slashSelectedIndex}
            onSelect={applySlashSuggestion}
            onHover={setSlashSelectedIndex}
          />
          {!readOnly && visibleTasks.length > 0 && (
            <TaskDrawer
              tasks={visibleTasks}
              isOpen={isTaskDrawerOpen}
              onToggle={() => setIsTaskDrawerOpen(!isTaskDrawerOpen)}
            />
          )}
          {isLoading && !isWelcome && (
            <div className="absolute inset-x-4 -top-px h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent animate-shimmer-slide z-10" />
          )}
          <div className="flex flex-col">
            {isSidebar && !readOnly && (
              <div className="px-3 pt-2 flex items-center justify-between border-b border-border/10">
                <ModelSearchDropdown
                  isOpen={selectedModelOpen}
                  setIsOpen={setSelectedModelOpen}
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
              generativeUI={internalGenerativeUI}
              setGenerativeUI={setGenerativeUIInternal}
              isThinking={isThinking}
              setIsThinking={setIsThinking}
              isDeepResearch={isDeepResearch}
              setIsDeepResearch={setIsDeepResearch}
              isWebSearch={isWebSearch}
              setIsWebSearch={setIsWebSearch}
              selectedFiles={selectedFiles}
              removeFile={removeFile}
            />}
            {!readOnly && <div className="px-3 pt-2">
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
        </motion.div>
      </div>
    );
  },
);

export default PremiumChatInput;
