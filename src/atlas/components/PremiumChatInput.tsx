import { useState, useRef, useEffect, useMemo, memo, useCallback } from 'react';
import {
  ArrowUp,
  Mic
} from 'lucide-react';
import { cn } from '@/lib/utils/style';
import type { Model } from './ModelSelector';
import { Attachment } from './chat/types';
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

interface PremiumChatInputProps {
  onSend: (data: {
    message: string;
    model: string;
    webSearch: boolean;
    thinking: {
      enabled: boolean;
      effort?: "low" | "medium" | "high";
      budgetTokens?: number;
    };
    deepResearch: boolean;
    generativeUI: boolean;
    files: File[];
    attachments?: Attachment[];
    tools?: string[];
    provider?: string;
  }) => void;
  onAbort?: () => void;
  isLoading?: boolean;
  models: Model[];
  selectedModelId: string;
  selectedProvider: string;
  onSelectModel: (id: string, provider: string) => void;
  onOpenModelSelector?: () => void;
  onOpenSkills?: () => void;
  onOpenSettings?: () => void;
  activeChatId?: string | null;
  input?: string;
  onInputChange?: (value: string) => void;
  generativeUI?: boolean;
  onGenerativeUIChange?: (value: boolean) => void;
  isSidebar?: boolean;
}

type ThinkingPayload = PremiumChatInputProps['onSend'] extends (data: infer Data) => void
  ? Data extends { thinking: infer Thinking }
    ? Thinking
    : never
  : never;

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
      || models.find(m => m.id === selectedModelId)
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
    const modelId = selectedModelInfo?.id || selectedModelId || "No Model";
    const providerId = selectedModelInfo?.provider || selectedProvider || "ollama";

    const attachments = await Promise.all(selectedFiles.map(async (file) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve({
            name: file.name,
            type: file.type.startsWith('image/') ? 'image' : 'file',
            data: reader.result as string,
            mimeType: file.type
          });
        };
        reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
        reader.readAsDataURL(file);
      });
    }));

    onSend({
      message,
      model: modelId,
      webSearch: isWebSearch,
      deepResearch: isDeepResearch,
      generativeUI: internalGenerativeUI,
      files: selectedFiles,
      attachments: attachments as Attachment[],
      thinking: buildThinkingPayload(),
      tools: isToolsDisabled ? [] : undefined,
      provider: providerId,
    });

    setMessage('');
    setSelectedFiles([]);
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

  const suggestedPrompts = [
    { label: "Test Markdown", prompt: "test markdown", description: "Rich formatting check", icon: "📝" },
    { label: "Test GenUI", prompt: "test genui", description: "Interactive widget check", icon: "✨" },
    { label: "Test ToolCall", prompt: "test toolcall", description: "Mock tool call execution", icon: "🔧" }
  ];

  const handleSuggestedClick = (promptText: string) => {
    if (isLoading) return;
    if (!selectedModelInfo) return;
    if (promptText.includes("genui") || internalGenerativeUI) {
      void preloadOpenUISystemPrompt();
    }
    onSend({
      message: promptText,
      model: selectedModelInfo.id,
      webSearch: isWebSearch,
      deepResearch: isDeepResearch,
      generativeUI: promptText.includes("genui") || internalGenerativeUI,
      files: [],
      attachments: [],
      thinking: buildThinkingPayload(),
      tools: isToolsDisabled ? [] : undefined,
      provider: selectedModelInfo.provider,
    });
  };

  return (
    <div className="flex flex-col gap-2.5 w-full relative">
      {/* Premade Suggested Test Prompts (Only outside Tauri for easy dummy mode validation) */}
      {!IS_TAURI && (
        <div className="flex flex-wrap gap-2 px-1 pb-1 animate-fade-in">
          {suggestedPrompts.map((item) => (
            <button
              key={item.prompt}
              onClick={() => handleSuggestedClick(item.prompt)}
              disabled={isLoading}
              aria-label={item.label}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-50/80 dark:bg-zinc-900/60 border border-zinc-200/40 dark:border-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-indigo-950/20 hover:border-zinc-300 dark:hover:border-indigo-500/30 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-95 shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
            >
              <span className="text-sm leading-none">{item.icon}</span>
              <div className="flex flex-col items-start leading-tight">
                <span className="font-semibold">{item.label}</span>
                <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-normal">{item.description}</span>
              </div>
            </button>
          ))}
        </div>
      )}

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

          <div className="flex items-center justify-between px-3 py-2 bg-transparent">
            <div className="flex items-center gap-1.5 overflow-visible">
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
                onClick={() => useUIStore.getState().toggleVoiceMode()}
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
                  "p-1.5 rounded-full transition-all duration-300",
                  (message.trim() || selectedFiles.length > 0 || isLoading)
                    ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm hover:scale-105 active:scale-95"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-300 dark:text-zinc-600 cursor-not-allowed"
                )}
              >
                {isLoading ? (
                  <div className="w-4 h-4 bg-current rounded-[2px]" />
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
