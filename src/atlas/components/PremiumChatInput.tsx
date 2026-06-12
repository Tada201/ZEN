import { useState, useRef, useEffect, useMemo, memo, useCallback } from 'react';
import {
  ArrowUp,
  Mic
} from 'lucide-react';
import { cn } from '@/lib/utils/style';
import type { Attachment } from './chat/types';
import { useUIStore } from '@/lib/stores/useUIStore';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { useTaskStore } from '@/lib/stores/taskStore';
import { toolsApi, IS_TAURI } from '@/api';
import { preloadOpenUISystemPrompt } from './genui/promptLoader';

// Decomposed Components
import { ActionPills } from './chat/input/ActionPills';
import { PlusActionMenu } from './chat/input/PlusActionMenu';
import { ModelSearchDropdown } from './chat/input/ModelSearchDropdown';
import { PinnedActionBar } from './chat/input/PinnedActionBar';
import { TaskChecklistPanel } from './chat/input/TaskChecklistPanel';
import { SuggestedPromptStrip } from './chat/input/SuggestedPromptStrip';
import { PromptPicker } from "./chat/PromptPicker";
import type { PromptDefinition } from "./chat/promptRegistry";
import type { PremiumChatInputProps, ThinkingPayload } from './chat/input/PremiumChatInputTypes';
import { fileToAttachment } from './chat/input/fileAttachments';

export const PremiumChatInput = memo(({
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
  input: externalInput,
  onInputChange,
  generativeUI,
  onGenerativeUIChange,
  isSidebar
}: PremiumChatInputProps) => {
  const [internalMessage, setInternalMessage] = useState('');
  const message = externalInput !== undefined ? externalInput : internalMessage;
  const setMessage = onInputChange || setInternalMessage;

  const [isWebSearch, setIsWebSearch] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('zen_web_search') === 'true';
    return false;
  });
  const [isThinking, setIsThinking] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('zen_thinking') === 'true';
    return false;
  });
  const [thinkingEffort, setThinkingEffort] = useState<"low" | "medium" | "high">(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('zen_thinking_effort');
      if (saved === 'low' || saved === 'medium' || saved === 'high') return saved;
    }
    return "medium";
  });
  const [thinkingBudget, setThinkingBudget] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('zen_thinking_budget');
      if (saved) return parseInt(saved, 10);
    }
    return 2048;
  });
  const [isDeepResearch, setIsDeepResearch] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('zen_deep_research') === 'true';
    return false;
  });
  const [isToolsDisabled, setIsToolsDisabled] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('zen_tools_disabled') === 'true';
    return false;
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptDefinition | null>(null);

  const [isModelOpen, setIsModelOpen] = useState(false);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [isTaskPanelOpen, setIsTaskPanelOpen] = useState(true);
  const toolYoloMode = useSettingsStore(state => state.toolYoloMode);
  const [isAuto, setIsAuto] = useState(toolYoloMode);
  const taskMap = useTaskStore(state => state.tasks);

  const visibleTasks = useMemo(() => {
    if (!activeChatId) return [];
    return Array.from(taskMap.values())
      .filter(task => task.chatId === activeChatId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }, [taskMap, activeChatId]);

  const hasVisibleTasks = visibleTasks.length > 0;

  useEffect(() => {
    setIsAuto(toolYoloMode);
  }, [toolYoloMode]);

  const handleSetIsAuto = useCallback(async (val: boolean) => {
    if (val) {
      const confirmed = window.confirm(
        "Enable YOLO mode? This auto-approves tool calls except hardcoded security blocks. Use only in a trusted workspace."
      );
      if (!confirmed) return;
    }
    try {
      await toolsApi.setYoloMode(val);
      useSettingsStore.setState({ toolYoloMode: val });
      setIsAuto(val);
      localStorage.setItem('zen_auto_mode', String(val));
    } catch (error) {
      console.warn("[PremiumChatInput] Failed to update Auto mode:", error);
    }
  }, []);

  useEffect(() => { localStorage.setItem('zen_web_search', String(isWebSearch)); }, [isWebSearch]);
  useEffect(() => { localStorage.setItem('zen_thinking', String(isThinking)); }, [isThinking]);
  useEffect(() => { localStorage.setItem('zen_thinking_effort', thinkingEffort); }, [thinkingEffort]);
  useEffect(() => { localStorage.setItem('zen_thinking_budget', String(thinkingBudget)); }, [thinkingBudget]);
  useEffect(() => { localStorage.setItem('zen_deep_research', String(isDeepResearch)); }, [isDeepResearch]);
  useEffect(() => { localStorage.setItem('zen_tools_disabled', String(isToolsDisabled)); }, [isToolsDisabled]);

  const [pinnedActions, setPinnedActions] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('zen_pinned_actions');
      return saved ? JSON.parse(saved) : ['thinking'];
    }
    return ['thinking'];
  });

  useEffect(() => {
    localStorage.setItem('zen_pinned_actions', JSON.stringify(pinnedActions));
  }, [pinnedActions]);

  const togglePin = useCallback((id: string) => {
    setPinnedActions(prev => {
      if (prev.includes(id)) return prev.filter(a => a !== id);
      if (prev.length >= 3) return [...prev.slice(1), id];
      return [...prev, id];
    });
  }, []);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isCompact = (containerWidth > 0 && containerWidth < 480) || isSidebar;

  const [internalGenerativeUI, setInternalGenerativeUI] = useState(generativeUI ?? false);

  useEffect(() => {
    if (generativeUI !== undefined) {
      setInternalGenerativeUI(generativeUI);
    }
  }, [generativeUI]);

  const setGenerativeUIInternal = useCallback((val: boolean) => {
    if (val) void preloadOpenUISystemPrompt();
    setInternalGenerativeUI(val);
    onGenerativeUIChange?.(val);
  }, [onGenerativeUIChange]);

  useEffect(() => {
    if (internalGenerativeUI) void preloadOpenUISystemPrompt();
  }, [internalGenerativeUI]);

  const selectedModelInfo = useMemo(() => (
    models.find(m => m.id === selectedModelId && m.provider === selectedProvider)
      || null
  ), [models, selectedModelId, selectedProvider]);

  const supportsReasoning = useMemo(() => {
    if (!selectedModelInfo) return false;
    return selectedModelInfo.supportsReasoning === true || selectedModelInfo.capabilities?.includes('reasoning') === true;
  }, [selectedModelInfo]);

  const supportsImageGen = useMemo(() => {
    if (!selectedModelInfo) return false;
    return selectedModelInfo.capabilities?.includes('image-gen') || selectedModelInfo.id?.toLowerCase().includes('imagen');
  }, [selectedModelInfo]);

  const reasoningConfigType = useMemo(() => {
    if (!supportsReasoning || !selectedModelInfo) return 'none';
    return selectedModelInfo.reasoningConfigType ?? 'none';
  }, [selectedModelInfo, supportsReasoning]);

  const buildThinkingPayload = useCallback((): ThinkingPayload => {
    if (!supportsReasoning || !isThinking) {
      return { enabled: false };
    }

    if (reasoningConfigType === 'effort') {
      return {
        enabled: true,
        effort: thinkingEffort,
      };
    }

    if (reasoningConfigType === 'budget') {
      return {
        enabled: true,
        budgetTokens: thinkingBudget,
      };
    }

    return { enabled: true };
  }, [isThinking, reasoningConfigType, supportsReasoning, thinkingBudget, thinkingEffort]);

  useEffect(() => {
    if (!supportsReasoning && isThinking) {
      setIsThinking(false);
    }
  }, [supportsReasoning, isThinking]);

  const handleSend = async () => {
    if (isLoading) {
      onAbort?.();
      return;
    }
    if (!message.trim() && selectedFiles.length === 0) return;
    const modelId = selectedModelId || selectedModelInfo?.id || "No Model";
    const providerId = selectedProvider || selectedModelInfo?.provider || "ollama";

    const attachments = await Promise.all(selectedFiles.map(fileToAttachment));

    // Inject selected prompt
    const prompt = selectedPrompt;
    const finalMessage = prompt?.mode === "prepend"
      ? `${prompt.content}\n\n---\n\n${message}`
      : message;

    onSend({
      message: finalMessage,
      model: modelId,
      webSearch: isWebSearch,
      deepResearch: isDeepResearch,
      generativeUI: internalGenerativeUI,
      files: selectedFiles,
      attachments: attachments as Attachment[],
      thinking: buildThinkingPayload(),
      tools: isToolsDisabled ? [] : undefined,
      provider: providerId,
      ...(prompt?.mode === "system" ? {
        systemPrompt: prompt.content,
        systemPromptMode: "replace" as const,
      } : {}),
    });

    setMessage('');
    setSelectedFiles([]);
    setSelectedPrompt(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
    setIsPlusMenuOpen(false);
  }, []);

  const removeFile = useCallback((index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  useEffect(() => {
    if (resizeFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeFrameRef.current);
    }

    resizeFrameRef.current = window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      textarea.style.height = 'auto';
      const nextHeight = !message ? 32 : Math.min(textarea.scrollHeight, 200);
      const nextHeightPx = `${nextHeight}px`;
      if (textarea.style.height !== nextHeightPx) {
        textarea.style.height = nextHeightPx;
      }
    });

    return () => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [message]);

  const handleSuggestedClick = (promptText: string) => {
    if (isLoading) return;
    const modelId = selectedModelId || selectedModelInfo?.id;
    const providerId = selectedProvider || selectedModelInfo?.provider;
    if (!modelId || !providerId) return;
    if (promptText.includes("genui") || internalGenerativeUI) {
      void preloadOpenUISystemPrompt();
    }
    onSend({
      message: promptText,
      model: modelId,
      webSearch: isWebSearch,
      deepResearch: isDeepResearch,
      generativeUI: promptText.includes("genui") || internalGenerativeUI,
      files: [],
      attachments: [],
      thinking: buildThinkingPayload(),
      tools: isToolsDisabled ? [] : undefined,
      provider: providerId,
    });
  };

  return (
    <div className="flex flex-col gap-2.5 w-full relative">
      {/* Premade Suggested Test Prompts (Only outside Tauri for easy dummy mode validation) */}
      {!IS_TAURI && (
        <SuggestedPromptStrip isLoading={isLoading} onSelect={handleSuggestedClick} />
      )}

      {/* Dynamic Prompt Picker */}
      <PromptPicker
        selectedId={selectedPrompt?.id ?? null}
        onSelect={setSelectedPrompt}
        compact
      />

      <div
        ref={containerRef}
        className={cn(
          "w-full relative bg-white dark:bg-[#141415] rounded-2xl shadow-[0_2px_14px_-4px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_14px_-4px_rgba(0,0,0,0.2)] ring-1 ring-black/5 dark:ring-white/10 overflow-visible transition-all duration-200",
          isLoading && "ring-primary/40 dark:ring-primary/50 shadow-[0_0_15px_-3px_rgba(var(--primary-rgb),0.1)]"
        )}
      >
        {isLoading && (
          <div className="absolute inset-x-4 -top-px h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent animate-shimmer-slide z-10" />
        )}
        {hasVisibleTasks && (
          <TaskChecklistPanel
            tasks={visibleTasks}
            isOpen={isTaskPanelOpen}
            onToggle={() => setIsTaskPanelOpen(prev => !prev)}
          />
        )}
        <div className="flex flex-col">
          {isSidebar && (
            <div className="px-3 pt-2 flex items-center justify-between border-b border-border/10">
               <ModelSearchDropdown
                isOpen={isModelOpen}
                setIsOpen={setIsModelOpen}
                models={models}
                selectedModelId={selectedModelId}
                selectedProvider={selectedProvider}
                onSelectModel={onSelectModel}
                onOpenModelSelector={onOpenModelSelector}
                isCompact={isCompact}
              />
            </div>
          )}

          {/* Context Area (Pills) */}
          <ActionPills
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
          />

          <div className="flex items-start p-3 gap-2">
            <PlusActionMenu
              isOpen={isPlusMenuOpen}
              setIsOpen={setIsPlusMenuOpen}
              onFileSelect={handleFileChange}
              pinnedActions={pinnedActions}
              togglePin={togglePin}
              supportsReasoning={supportsReasoning}
              isThinking={isThinking}
              setIsThinking={setIsThinking}
              isDeepResearch={isDeepResearch}
              setIsDeepResearch={setIsDeepResearch}
              isWebSearch={isWebSearch}
              setIsWebSearch={setIsWebSearch}
              generativeUI={internalGenerativeUI}
              setGenerativeUI={setGenerativeUIInternal}
              isAuto={isAuto}
              setIsAuto={handleSetIsAuto}
              isToolsDisabled={isToolsDisabled}
              setIsToolsDisabled={setIsToolsDisabled}
              onOpenSkills={onOpenSkills}
              supportsImageGen={supportsImageGen}
            />

            <div className="flex-1 min-h-[38px] flex items-center">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask anything..."
                aria-label="Message"
                rows={1}
                className="w-full bg-transparent border-none focus:ring-0 focus:outline-none outline-none ring-0 resize-none text-[15px] py-1 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 shadow-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between px-3 py-2 bg-transparent gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 overflow-visible flex-wrap">
              {!isSidebar && (
                <ModelSearchDropdown
                  isOpen={isModelOpen}
                  setIsOpen={setIsModelOpen}
                  models={models}
                  selectedModelId={selectedModelId}
                  selectedProvider={selectedProvider}
                  onSelectModel={onSelectModel}
                  onOpenModelSelector={onOpenModelSelector}
                  isCompact={isCompact}
                />
              )}
              {isAuto && (
                <span
                  className="shrink-0 rounded border border-rose-400/25 bg-rose-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none text-rose-300"
                  title="YOLO mode is enabled: tool confirmations are auto-approved except hardcoded security blocks."
                >
                  YOLO
                </span>
              )}

              <PinnedActionBar
                pinnedActions={pinnedActions}
                togglePin={togglePin}
                supportsReasoning={supportsReasoning}
                isThinking={isThinking}
                setIsThinking={setIsThinking}
                reasoningConfigType={reasoningConfigType}
                thinkingEffort={thinkingEffort}
                setThinkingEffort={setThinkingEffort}
                thinkingBudget={thinkingBudget}
                setThinkingBudget={setThinkingBudget}
                isWebSearch={isWebSearch}
                setIsWebSearch={setIsWebSearch}
                isDeepResearch={isDeepResearch}
                setIsDeepResearch={setIsDeepResearch}
                generativeUI={internalGenerativeUI}
                setGenerativeUI={setGenerativeUIInternal}
                isAuto={isAuto}
                isToolsDisabled={isToolsDisabled}
                provider={selectedProvider}
                isCompact={isCompact}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const state = useUIStore.getState();
                  if (state.voiceModeOpen) {
                    window.dispatchEvent(new Event('request-voice-close'));
                  } else {
                    state.toggleVoiceMode();
                  }
                }}
                type="button"
                className="p-1.5 rounded-full text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all duration-200 flex items-center justify-center"
                aria-label="Open Voice Mode"
                title="Open Voice Mode"
              >
                <Mic className="w-4 h-4" />
              </button>
              <button
                onClick={handleSend}
                type="button"
                disabled={!message.trim() && selectedFiles.length === 0 && !isLoading}
                aria-label={isLoading ? "Stop response" : "Send message"}
                className={cn(
                  "relative p-1.5 rounded-full transition-all duration-300",
                  isLoading
                    ? "bg-rose-500/90 text-white shadow-lg shadow-rose-500/20 hover:bg-rose-500"
                    : (message.trim() || selectedFiles.length > 0)
                      ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm hover:scale-105 active:scale-95"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-300 dark:text-zinc-600 cursor-not-allowed"
                )}
              >
                {isLoading && (
                  <span className="absolute inset-0 rounded-full animate-ping bg-rose-400/30" />
                )}
                {isLoading ? (
                  <div className="relative w-4 h-4 bg-current rounded-[2px]" />
                ) : (
                  <ArrowUp className="w-4 h-4 stroke-[3px]" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default PremiumChatInput;
