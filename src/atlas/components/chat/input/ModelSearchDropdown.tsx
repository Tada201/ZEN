import { memo, useState, useEffect, useMemo, useDeferredValue } from 'react';
import { ChevronDown, Search, Check, Sliders } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils/style';
import { motionDurations, motionEasings, useReducedMotion } from '@/lib/motion';
import type { Model } from '../../ModelSelector';
import { ProviderIcon } from './ProviderIcon';

interface ModelSearchDropdownProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  models: Model[];
  selectedModelId: string;
  selectedProvider: string;
  onSelectModel: (id: string, provider: string) => void;
  onOpenModelSelector?: () => void;
  isCompact?: boolean;
}

export const ModelSearchDropdown = memo(({
  isOpen, setIsOpen,
  models,
  selectedModelId,
  selectedProvider,
  onSelectModel,
  onOpenModelSelector,
  isCompact
}: ModelSearchDropdownProps) => {
  const reducedMotion = useReducedMotion();
  const [modelSearch, setModelSearch] = useState('');
  const [focusedModelIndex, setFocusedModelIndex] = useState(0);
  const deferredModelSearch = useDeferredValue(modelSearch);

  const filteredModels = useMemo(() => {
    if (!isOpen) return [];
    const query = deferredModelSearch.toLowerCase();
    return models.filter(m =>
      m.name.toLowerCase().includes(query) ||
      m.provider.toLowerCase().includes(query)
    );
  }, [isOpen, deferredModelSearch, models]);

  const groupedVisibleModels = useMemo(() => {
    return filteredModels.reduce((acc, m) => {
      if (!acc[m.provider]) acc[m.provider] = [];
      acc[m.provider].push(m);
      return acc;
    }, {} as Record<string, Model[]>);
  }, [filteredModels]);

  const providerFilters = useMemo(() => {
    if (!isOpen) return [];
    return Array.from(new Set(models.map(m => m.provider)));
  }, [isOpen, models]);

  const selectedModelInfo = useMemo(() => (
    models.find(m => m.id === selectedModelId && m.provider === selectedProvider)
      || models.find(m => m.id === selectedModelId)
      || models[0]
      || { id: 'default', name: selectedModelId || 'No Model', provider: selectedProvider || 'default' }
  ), [models, selectedModelId, selectedProvider]);

  const handleModelKeyDown = (e: React.KeyboardEvent) => {
    if (filteredModels.length === 0) {
      if (e.key === 'Escape') setIsOpen(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedModelIndex(prev => (prev + 1) % filteredModels.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedModelIndex(prev => (prev - 1 + filteredModels.length) % filteredModels.length);
    } else if (e.key === 'Enter' && filteredModels[focusedModelIndex]) {
      e.preventDefault();
      const model = filteredModels[focusedModelIndex];
      onSelectModel(model.id, model.provider);
      setIsOpen(false);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    setFocusedModelIndex(0);
  }, [modelSearch]);

  return (
    <div className="relative z-[100]">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        aria-label={`Select model: ${selectedModelInfo.name}`}
        title={`Select model: ${selectedModelInfo.name}`}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted dark:hover:bg-muted transition-colors text-[13px] font-semibold text-muted-foreground/70 dark:text-muted-foreground shrink-0",
          isCompact ? "max-w-[40px] min-w-0" : "max-w-[160px] min-w-[100px]"
        )}
      >
        <ProviderIcon provider={selectedModelInfo.provider} className="w-3.5 h-3.5 shrink-0" />
        {!isCompact && <span className="truncate flex-1">{selectedModelInfo.name}</span>}
        <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-[110]" onClick={() => setIsOpen(false)} />
            <motion.div 
              initial={reducedMotion ? false : { opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }} 
              exit={reducedMotion ? undefined : { opacity: 0, y: -10 }}
              transition={reducedMotion ? { duration: 0 } : {
                duration: motionDurations.fast,
                ease: motionEasings.standard,
              }}
              className="absolute bottom-full left-0 z-[120] mb-2 min-w-[280px] max-w-[320px] bg-card dark:bg-card border border-border dark:border-border rounded-md shadow-2xl py-1 flex flex-col overflow-hidden font-sans"
            >
              <div className="px-2 pb-2 mb-1 border-b border-border dark:border-border/50 space-y-2">
                <div className="flex items-center justify-between px-1">
                  <div className="text-[10px] font-semibold text-muted-foreground capitalize">Select AI Model</div>
                  {modelSearch && (
                    <button 
                      onClick={() => setModelSearch('')}
                      className="text-[10px] text-primary hover:underline font-semibold capitalize"
                    >
                      Clear Filter
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input 
                    type="text"
                    placeholder="Search models..."
                    aria-label="Search models"
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    onKeyDown={handleModelKeyDown}
                    autoFocus
                    className="w-full bg-muted dark:bg-muted/60 text-foreground dark:text-foreground rounded border border-border dark:border-border pl-8 pr-2 py-1.5 text-[12px] focus:ring-1 focus:ring-primary/20 outline-none transition-all focus:border-primary/20"
                  />
                </div>
                
                <div className="flex gap-1 overflow-x-auto no-scrollbar pb-0.5 px-0.5">
                  <button
                    onClick={() => setModelSearch('')}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-medium capitalize whitespace-nowrap transition-all border",
                      !modelSearch
                        ? "bg-muted dark:bg-muted text-foreground dark:text-foreground border-transparent shadow-sm"
                        : "bg-muted dark:bg-muted text-muted-foreground border-border dark:border-border hover:border-border"
                    )}
                  >
                    All
                  </button>
                  {providerFilters.map(p => {
                    const isSelected = modelSearch.toLowerCase() === p.toLowerCase();
                    return (
                      <button
                        key={p}
                        onClick={() => setModelSearch(isSelected ? '' : p)}
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-medium capitalize whitespace-nowrap transition-all border",
                          isSelected
                            ? "bg-muted dark:bg-muted text-foreground dark:text-foreground border-transparent shadow-sm"
                            : "bg-muted dark:bg-muted text-muted-foreground border-border dark:border-border hover:border-border hover:bg-muted dark:hover:bg-muted"
                        )}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="max-h-[350px] overflow-y-auto no-scrollbar px-1">
                {filteredModels.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-xs italic">
                    No models found matching "{modelSearch}"
                  </div>
                ) : (
                  Object.entries(groupedVisibleModels).map(([provider, providerModels]) => (
                    <div key={provider} className="mb-2 font-sans text-xs">
                      <div className="px-3 py-1 text-[10px] font-semibold capitalize text-muted-foreground flex items-center gap-2">
                        {provider}
                        <div className="h-px flex-1 bg-muted dark:bg-muted/30" />
                      </div>
                      <div className="px-1 space-y-0.5 mt-0.5">
                        {providerModels.map((model) => {
                          const isFocused = filteredModels[focusedModelIndex]?.id === model.id;
                          const isSelected = selectedModelId === model.id && selectedProvider === model.provider;
                          return (
                            <button
                              key={`${provider}:${model.id}`}
                              onClick={() => { 
                                onSelectModel(model.id, model.provider); 
                                setIsOpen(false); 
                              }}
                              className={cn(
                                "w-full flex items-center justify-between px-2 py-1 rounded transition-colors text-left group",
                                isSelected 
                                  ? "bg-primary/10 dark:bg-primary/20 text-primary" 
                                  : isFocused 
                                    ? "bg-muted dark:bg-muted"
                                    : "hover:bg-muted dark:hover:bg-muted/30"
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <ProviderIcon provider={provider} className="w-3.5 h-3.5 opacity-70" />
                                <div className="flex flex-col min-w-0">
                                  <span className={cn(
                                    "text-[12px] truncate transition-colors",
                                    isSelected 
                                      ? "font-bold text-primary" 
                                      : "text-foreground/80 dark:text-foreground group-hover:text-foreground dark:group-hover:text-foreground"
                                  )}>
                                    {model.name}
                                  </span>
                                </div>
                              </div>
                              {isSelected && (
                                <motion.div layoutId="active-check" className="bg-primary dark:bg-primary rounded-full p-1 shadow-sm">
                                  <Check className="w-3 h-3 text-foreground" />
                                </motion.div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {onOpenModelSelector && (
                 <div className="mt-1 pt-1 border-t border-border dark:border-border/50 px-2">
                   <button 
                     onClick={() => { setIsOpen(false); onOpenModelSelector(); }}
                     className="w-full flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground dark:hover:text-foreground py-2.5 font-medium transition-colors"
                   >
                     <Sliders className="w-3.5 h-3.5" />
                     Manage AI Providers...
                   </button>
                 </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
});
