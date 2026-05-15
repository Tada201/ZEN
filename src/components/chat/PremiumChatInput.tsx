import React, { useState, useRef, useEffect, useMemo, memo } from 'react';
import { 
  ArrowUp, Mic
} from 'lucide-react';
import { cn } from '@/lib/utils/style';
import type { Model, Attachment } from './types';

// Decomposed Components
import { ActionPills } from '@/components/chat/input/ActionPills';
import { PlusActionMenu } from '@/components/chat/input/PlusActionMenu';
import { ModelSelector } from '@/components/chat/ModelSelector';
import { PinnedActionBar } from '@/components/chat/input/PinnedActionBar';
import { useUIStore } from '@/lib/stores/useUIStore';

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
  input?: string;
  onInputChange?: (value: string) => void;
  generativeUI?: boolean;
  onGenerativeUIChange?: (value: boolean) => void;
  isSidebar?: boolean;
}

export const PremiumChatInput = memo(({ 
  onSend, 
  onAbort,
  isLoading,
  input: externalInput,
  onInputChange,
  generativeUI,
  onGenerativeUIChange,
  isSidebar
}: PremiumChatInputProps) => {
  const [internalMessage, setInternalMessage] = useState('');
  const { setVoiceModeOpen, activeModel: selectedModelId, activeProvider: selectedProvider } = useUIStore();
  // Mock models for local calculation if needed, or better yet, we should have a central list.
  // For now I will just use a minimal list to avoid breaking the logic below.
  const models: Model[] = [
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', capabilities: ['vision', 'tools'] },
    { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'anthropic', capabilities: ['vision', 'tools'] },
  ] as any;
  const message = externalInput !== undefined ? externalInput : internalMessage;
  const setMessage = onInputChange || setInternalMessage;

  const [isWebSearch, setIsWebSearch] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('Zen_web_search') === 'true';
    return false;
  });
  const [isThinking, setIsThinking] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('Zen_thinking') === 'true';
    return false;
  });
  const [thinkingEffort, setThinkingEffort] = useState<"low" | "medium" | "high">(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('Zen_thinking_effort');
      if (saved === 'low' || saved === 'medium' || saved === 'high') return saved;
    }
    return "medium";
  });
  const [thinkingBudget, setThinkingBudget] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('Zen_thinking_budget');
      if (saved) return parseInt(saved, 10);
    }
    return 2048;
  });
  const [isDeepResearch, setIsDeepResearch] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('Zen_deep_research') === 'true';
    return false;
  });
  const [isToolsDisabled, setIsToolsDisabled] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('Zen_tools_disabled') === 'true';
    return false;
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [isAuto, setIsAuto] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('Zen_auto_mode');
      if (saved !== null) return saved === 'true';
    }
    return true;
  });

  useEffect(() => { localStorage.setItem('Zen_web_search', String(isWebSearch)); }, [isWebSearch]);
  useEffect(() => { localStorage.setItem('Zen_thinking', String(isThinking)); }, [isThinking]);
  useEffect(() => { localStorage.setItem('Zen_thinking_effort', thinkingEffort); }, [thinkingEffort]);
  useEffect(() => { localStorage.setItem('Zen_thinking_budget', String(thinkingBudget)); }, [thinkingBudget]);
  useEffect(() => { localStorage.setItem('Zen_deep_research', String(isDeepResearch)); }, [isDeepResearch]);
  useEffect(() => { localStorage.setItem('Zen_tools_disabled', String(isToolsDisabled)); }, [isToolsDisabled]);
  useEffect(() => { localStorage.setItem('Zen_auto_mode', String(isAuto)); }, [isAuto]);
  
  const [pinnedActions, setPinnedActions] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('Zen_pinned_actions');
      return saved ? JSON.parse(saved) : ['thinking'];
    }
    return ['thinking'];
  });

  useEffect(() => {
    localStorage.setItem('Zen_pinned_actions', JSON.stringify(pinnedActions));
  }, [pinnedActions]);

  const togglePin = (id: string) => {
    setPinnedActions(prev => {
      if (prev.includes(id)) return prev.filter(a => a !== id);
      if (prev.length >= 3) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [internalGenerativeUI, setInternalGenerativeUI] = useState(generativeUI ?? false);
  
  useEffect(() => {
    if (generativeUI !== undefined) {
      setInternalGenerativeUI(generativeUI);
    }
  }, [generativeUI]);

  const setGenerativeUIInternal = (val: boolean) => {
    setInternalGenerativeUI(val);
    onGenerativeUIChange?.(val);
  };

  const selectedModelInfo = models.find(m => m.id === selectedModelId && m.provider === selectedProvider) 
    || models.find(m => m.id === selectedModelId) 
    || models[0] 
    || { id: 'default', name: selectedModelId || 'Default', provider: selectedProvider || 'default', capabilities: [] as string[] } as Model;

  const supportsReasoning = useMemo(() => {
    const provider = selectedModelInfo.provider.toLowerCase();
    const isReasoningProvider = ['openai', 'anthropic', 'google', 'deepseek', 'ollama', 'lmstudio'].includes(provider);
    const hasReasoningCapability = selectedModelInfo.capabilities?.includes('reasoning') || selectedModelInfo.id.includes('thinking');
    
    return hasReasoningCapability || isReasoningProvider;
  }, [selectedModelInfo]);

  const supportsImageGen = useMemo(() => {
    return selectedModelInfo.capabilities?.includes('image-gen') || selectedModelInfo.id?.toLowerCase().includes('imagen');
  }, [selectedModelInfo]);

  const reasoningConfigType = useMemo(() => {
    if (!supportsReasoning) return 'none';
    const provider = selectedModelInfo.provider.toLowerCase();
    const modelId = (selectedModelInfo.id || "").toLowerCase();
    
    if (provider === 'anthropic' || modelId.includes('anthropic/claude-3-7') || modelId.includes('claude-3-7')) return 'budget';
    if (provider === 'google' && modelId.includes('2.5')) return 'budget';
    if (provider === 'openai' || 
        provider === 'google' || 
        provider === 'kilocode' ||
        modelId.includes('openai/o1') || 
        modelId.includes('openai/o3') || 
        /^o[13]/.test(modelId) || 
        modelId.includes('thinking') ||
        modelId.includes('reasoning')
    ) return 'effort';
    
    return 'none';
  }, [selectedModelInfo, supportsReasoning]);

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
      model: selectedModelInfo.id,
      webSearch: isWebSearch,
      deepResearch: isDeepResearch,
      generativeUI: internalGenerativeUI,
      files: selectedFiles,
      attachments: attachments as Attachment[],
      thinking: {
        enabled: isThinking,
        effort: thinkingEffort,
        budgetTokens: thinkingBudget
      },
      tools: isToolsDisabled ? [] : undefined,
      provider: selectedModelInfo.provider,
    });

    setMessage('');
    setSelectedFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
    setIsPlusMenuOpen(false);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [message]);

  return (
    <div className={cn(
      "w-full relative bg-white dark:bg-[#141415] rounded-2xl shadow-[0_2px_14px_-4px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_14px_-4px_rgba(0,0,0,0.2)] ring-1 ring-black/5 dark:ring-white/10 overflow-visible transition-all duration-200",
      isLoading && "ring-primary/40 dark:ring-primary/50 shadow-[0_0_15px_-3px_rgba(var(--primary-rgb),0.1)]"
    )}>
      {isLoading && (
        <div className="absolute inset-x-4 -top-px h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent animate-shimmer-slide z-10" />
      )}
      <div className="flex flex-col">
        {isSidebar && (
          <div className="px-3 pt-2 flex items-center justify-between border-b border-border/10">
             <ModelSelector />
          </div>
        )}

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
            setIsAuto={setIsAuto}
            isToolsDisabled={isToolsDisabled}
            setIsToolsDisabled={setIsToolsDisabled}
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
              rows={1}
              className="w-full bg-transparent border-none focus:ring-0 focus:outline-none outline-none ring-0 resize-none text-[15px] py-1 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 shadow-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-3 py-2 bg-transparent">
          <div className="flex items-center gap-1.5 overflow-hidden">
            {!isSidebar && (
              <ModelSelector />
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
            />
          </div>

            <button 
              onClick={() => setVoiceModeOpen(true)}
              className="p-1.5 rounded-full text-zinc-400 hover:text-primary hover:bg-primary/5 transition-all"
              title="Voice Mode"
            >
              <Mic className="w-4 h-4" />
            </button>

            <button 
              onClick={handleSend}
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
  );
});

export default PremiumChatInput;

