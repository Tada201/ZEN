import React, { memo } from 'react';
import { Brain, Globe, Compass, Layout, PinOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { ThinkingConfig } from './ThinkingConfig';
import { useOverflow } from '@/atlas/hooks/useOverflow';

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
  provider?: string;
  isCompact?: boolean;
}

const unpinButtonClass = "absolute -top-1 -right-1 rounded-full border border-border bg-popover p-0.5 text-muted-foreground opacity-70 shadow-sm transition-opacity md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100";

export const PinnedActionBar = memo(({
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
  generativeUI,
  setGenerativeUI,
  provider,
  isCompact,
}: PinnedActionBarProps) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const isOverflowing = useOverflow(containerRef);
  const isCompactMode = isCompact || isOverflowing;
  if (pinnedActions.length === 0) return null;

  return (
    <div ref={containerRef} className={cn("composer-pinned-rail min-w-0 flex-1 overflow-hidden bg-transparent px-0 py-0", isCompactMode && "is-compact")}>
      <div className="composer-scroll-rail flex min-w-max items-center gap-1 overflow-x-auto no-scrollbar">
        <AnimatePresence mode="sync">
          {pinnedActions.map((actionId) => {
            if (actionId === 'thinking' && supportsReasoning) {
              return (
                <motion.div key="thinking" initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }}>
                  <Popover>
                    <div className="group relative">
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label="Configure thinking"
                          title="Configure thinking"
                          className={cn(
                            "composer-control text-[13px] font-medium",
                            isThinking ? "composer-control--active text-warning shadow-sm" : "text-muted-foreground",
                          )}
                        >
                          <Brain aria-hidden="true" className="w-3.5 h-3.5" />                            {!isCompactMode && <span className="composer-responsive-label">Thinking</span>}
                        </button>
                      </PopoverTrigger>
                      <button
                        type="button"
                        aria-label="Unpin Thinking"
                        title="Unpin Thinking"
                        onClick={() => togglePin('thinking')}
                        className={unpinButtonClass}
                      >
                        <PinOff aria-hidden="true" className="w-2 h-2" />
                      </button>
                    </div>
                    <PopoverContent className="composer-popover composer-popover--bounded w-80 p-3" side="top" align="center">
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
                <motion.div key="search" initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }}>
                  <div className="group relative">
                    <button
                      type="button"
                      onClick={() => setIsWebSearch(!isWebSearch)}
                      aria-label={isWebSearch ? "Disable web search" : "Enable web search"}
                      title={isWebSearch ? "Disable web search" : "Enable web search"}
                      className={cn("composer-control text-[13px] font-medium", isWebSearch ? "composer-control--active text-primary" : "text-muted-foreground")}
                    >
                      <Globe aria-hidden="true" className="w-3.5 h-3.5" />
                      {!isCompactMode && <span className="composer-responsive-label">Search</span>}
                    </button>
                    <button type="button" aria-label="Unpin Search" title="Unpin Search" onClick={() => togglePin('search')} className={unpinButtonClass}>
                      <PinOff aria-hidden="true" className="w-2 h-2" />
                    </button>
                  </div>
                </motion.div>
              );
            }

            if (actionId === 'research') {
              return (
                <motion.div key="research" initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }}>
                  <div className="group relative">
                    <button
                      type="button"
                      onClick={() => setIsDeepResearch(!isDeepResearch)}
                      aria-label={isDeepResearch ? "Disable deep research" : "Enable deep research"}
                      title={isDeepResearch ? "Disable deep research" : "Enable deep research"}
                      className={cn("composer-control text-[13px] font-medium", isDeepResearch ? "composer-control--active text-primary" : "text-muted-foreground")}
                    >
                      <Compass aria-hidden="true" className="w-3.5 h-3.5" />
                      {!isCompactMode && <span className="composer-responsive-label">Research</span>}
                    </button>
                    <button type="button" aria-label="Unpin Research" title="Unpin Research" onClick={() => togglePin('research')} className={unpinButtonClass}>
                      <PinOff aria-hidden="true" className="w-2 h-2" />
                    </button>
                  </div>
                </motion.div>
              );
            }

            if (actionId === 'genui') {
              return (
                <motion.div key="genui" initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }}>
                  <div className="group relative">
                    <button
                      type="button"
                      onClick={() => setGenerativeUI(!generativeUI)}
                      aria-label={generativeUI ? "Disable generative UI" : "Enable generative UI"}
                      title={generativeUI ? "Disable generative UI" : "Enable generative UI"}
                      className={cn("composer-control text-[13px] font-medium", generativeUI ? "composer-control--active text-primary" : "text-muted-foreground")}
                    >
                      <Layout aria-hidden="true" className="w-3.5 h-3.5" />
                      {!isCompactMode && <span className="composer-responsive-label">Gen UI</span>}
                    </button>
                    <button type="button" aria-label="Unpin Gen UI" title="Unpin Gen UI" onClick={() => togglePin('genui')} className={unpinButtonClass}>
                      <PinOff aria-hidden="true" className="w-2 h-2" />
                    </button>
                  </div>
                </motion.div>
              );
            }

            return null;
          })}
        </AnimatePresence>
      </div>
    </div>
  );
});
