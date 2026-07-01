import React, { memo } from 'react';
import { Brain, Globe, Compass, Layout, PinOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { ThinkingConfig } from './ThinkingConfig';

interface PinnedActionBarProps {
  pinnedActions: string[];
  togglePin: (id: string) => void;
  supportsReasoning: boolean;
  isThinking: boolean;
  setIsThinking: (val: boolean) => void;
  reasoningConfigType: 'none' | 'effort' | 'budget';
  thinkingEffort: "low" | "medium" | "high";
  setThinkingEffort: (val: "low" | "medium" | "high") => void;
  thinkingBudget: number;
  setThinkingBudget: (val: number) => void;
  isWebSearch: boolean;
  setIsWebSearch: (val: boolean) => void;
  isDeepResearch: boolean;
  setIsDeepResearch: (val: boolean) => void;
  generativeUI: boolean;
  setGenerativeUI: (val: boolean) => void;
  isAuto: boolean;
  isToolsDisabled: boolean;
  provider?: string;
  isCompact?: boolean;
}

import { useOverflow } from '@/atlas/hooks/useOverflow';

export const PinnedActionBar = memo(({
  pinnedActions, togglePin,
  supportsReasoning, isThinking, setIsThinking,
  reasoningConfigType, thinkingEffort, setThinkingEffort,
  thinkingBudget, setThinkingBudget,
  isWebSearch, setIsWebSearch,
  isDeepResearch, setIsDeepResearch,
  generativeUI, setGenerativeUI,
  isAuto, isToolsDisabled,
  provider,
  isCompact
}: PinnedActionBarProps) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const isOverflowing = useOverflow(containerRef);
  const isCompactMode = isCompact || isOverflowing;

  return (
    <div ref={containerRef} className={cn("flex items-center gap-1.5 px-3 py-2 bg-transparent overflow-hidden", isCompactMode && "is-compact")}>
      <div className="flex items-center gap-1">
        <AnimatePresence mode="popLayout">
          {pinnedActions.map((actionId) => {
            if (actionId === 'thinking' && supportsReasoning) {
              return (
                <motion.div key="thinking" layoutId="thinking" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button 
                        type="button"
                        aria-label="Configure thinking"
                        title="Configure thinking"
                        className={cn(
                          "flex items-center gap-1.5 px-2 py-1 rounded-md transition-all text-[13px] font-medium group relative",
                          isThinking 
                            ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-warning shadow-sm" 
                            : "text-muted-foreground hover:bg-muted dark:hover:bg-muted"
                        )}
                      >
                        <Brain className="w-3.5 h-3.5" />
                        {!isCompactMode && <span className="responsive-label">Thinking</span>}
                        <div onClick={(e) => { e.stopPropagation(); togglePin('thinking'); }} role="button" className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 p-0.5 bg-card dark:bg-muted rounded-full border border-border dark:border-border shadow-sm transition-opacity cursor-pointer">
                          <PinOff className="w-2 h-2 text-muted-foreground" />
                        </div>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-4 border-border dark:border-border shadow-2xl rounded-xl" side="top" align="center">
                      <ThinkingConfig 
                        isThinking={isThinking}
                        setIsThinking={setIsThinking}
                        reasoningConfigType={reasoningConfigType}
                        thinkingEffort={thinkingEffort}
                        setThinkingEffort={setThinkingEffort}
                        thinkingBudget={thinkingBudget}
                        setThinkingBudget={setThinkingBudget}
                        provider={provider}
                      />
                    </PopoverContent>
                  </Popover>
                </motion.div>
              );
            }
            
            if (actionId === 'search') {
              return (
                <motion.button 
                  key="search"
                  layoutId="search"
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => setIsWebSearch(!isWebSearch)}
                  type="button"
                  aria-label={isWebSearch ? "Disable web search" : "Enable web search"}
                  title={isWebSearch ? "Disable web search" : "Enable web search"}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md transition-all text-[13px] font-medium group relative",
                    isWebSearch 
                      ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-primary" 
                      : "text-muted-foreground hover:bg-muted dark:hover:bg-muted"
                  )}
                >
                  <Globe className="w-3.5 h-3.5" />
                  {!isCompactMode && <span className="responsive-label">Search</span>}
                  <div onClick={(e) => { e.stopPropagation(); togglePin('search'); }} role="button" className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 p-0.5 bg-card dark:bg-muted rounded-full border border-border dark:border-border shadow-sm transition-opacity cursor-pointer">
                    <PinOff className="w-2 h-2 text-muted-foreground" />
                  </div>
                </motion.button>
              );
            }

            if (actionId === 'research') {
              return (
                <motion.button 
                  key="research"
                  layoutId="research"
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => setIsDeepResearch(!isDeepResearch)}
                  type="button"
                  aria-label={isDeepResearch ? "Disable deep research" : "Enable deep research"}
                  title={isDeepResearch ? "Disable deep research" : "Enable deep research"}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md transition-all text-[13px] font-medium group relative",
                    isDeepResearch 
                      ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-primary" 
                      : "text-muted-foreground hover:bg-muted dark:hover:bg-muted"
                  )}
                >
                  <Compass className="w-3.5 h-3.5" />
                  {!isCompactMode && <span className="responsive-label">Research</span>}
                  <div onClick={(e) => { e.stopPropagation(); togglePin('research'); }} role="button" className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 p-0.5 bg-card dark:bg-muted rounded-full border border-border dark:border-border shadow-sm transition-opacity cursor-pointer">
                    <PinOff className="w-2 h-2 text-muted-foreground" />
                  </div>
                </motion.button>
              );
            }

            if (actionId === 'genui') {
              return (
                <motion.button 
                  key="genui"
                  layoutId="genui"
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => setGenerativeUI(!generativeUI)}
                  type="button"
                  aria-label={generativeUI ? "Disable generative UI" : "Enable generative UI"}
                  title={generativeUI ? "Disable generative UI" : "Enable generative UI"}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md transition-all text-[13px] font-medium group relative",
                    generativeUI 
                      ? "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400" 
                      : "text-muted-foreground hover:bg-muted dark:hover:bg-muted"
                  )}
                >
                  <Layout className="w-3.5 h-3.5" />
                  {!isCompactMode && <span className="responsive-label">Gen UI</span>}
                  <div onClick={(e) => { e.stopPropagation(); togglePin('genui'); }} role="button" className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 p-0.5 bg-card dark:bg-muted rounded-full border border-border dark:border-border shadow-sm transition-opacity cursor-pointer">
                    <PinOff className="w-2 h-2 text-muted-foreground" />
                  </div>
                </motion.button>
              );
            }
            
            return null;
          })}
        </AnimatePresence>
      </div>

      {!isCompactMode && (isAuto === false || isToolsDisabled === true) && (
        <div className="flex items-center gap-2 ml-1">
          <div className="h-3 w-px bg-muted dark:bg-muted mx-0.5" />
          {isAuto === false && <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Manual</span>}
          {isToolsDisabled === true && <span className="text-[10px] font-bold uppercase tracking-wider text-destructive">No Tools</span>}
        </div>
      )}
    </div>
  );
});


