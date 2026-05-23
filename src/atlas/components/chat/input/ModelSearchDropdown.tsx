import { useState, useEffect } from 'react';
import { ChevronDown, Search, Check, Sliders } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils/style';
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

export const ModelSearchDropdown = ({
  isOpen, setIsOpen,
  models,
  selectedModelId,
  selectedProvider,
  onSelectModel,
  onOpenModelSelector,
  isCompact
}: ModelSearchDropdownProps) => {
  const [modelSearch, setModelSearch] = useState('');
  const [focusedModelIndex, setFocusedModelIndex] = useState(0);

  const filteredModels = models.filter(m => 
    m.name.toLowerCase().includes(modelSearch.toLowerCase()) || 
    m.provider.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const handleModelKeyDown = (e: React.KeyboardEvent) => {
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

  const selectedModelInfo = models.find(m => m.id === selectedModelId && m.provider === selectedProvider) 
    || models.find(m => m.id === selectedModelId) 
    || models[0] 
    || { id: 'default', name: selectedModelId || 'No Model', provider: selectedProvider || 'default' };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-[13px] font-semibold text-zinc-600 dark:text-zinc-400 shrink-0",
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
            <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
            <motion.div 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: -10 }} 
              className="absolute bottom-full left-0 mb-2 min-w-[280px] max-w-[320px] bg-white dark:bg-[#1e1e1e] border border-zinc-200 dark:border-zinc-800 rounded-md shadow-2xl z-20 py-1 flex flex-col overflow-hidden font-sans"
            >
              <div className="px-2 pb-2 mb-1 border-b border-zinc-100 dark:border-zinc-800/50 space-y-2">
                <div className="flex items-center justify-between px-1">
                  <div className="text-[10px] font-semibold text-zinc-400 capitalize">Select AI Model</div>
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
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                  <input 
                    type="text"
                    placeholder="Search models..."
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    onKeyDown={handleModelKeyDown}
                    autoFocus
                    className="w-full bg-zinc-50 dark:bg-zinc-900/50 text-zinc-900 dark:text-zinc-100 rounded border border-zinc-200 dark:border-zinc-800 pl-8 pr-2 py-1.5 text-[12px] focus:ring-1 focus:ring-primary/20 outline-none transition-all focus:border-primary/20"
                  />
                </div>
                
                <div className="flex gap-1 overflow-x-auto no-scrollbar pb-0.5 px-0.5">
                  <button
                    onClick={() => setModelSearch('')}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-medium capitalize whitespace-nowrap transition-all border",
                      !modelSearch
                        ? "bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 border-transparent shadow-sm"
                        : "bg-zinc-50 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300"
                    )}
                  >
                    All
                  </button>
                  {Array.from(new Set(models.map(m => m.provider))).map(p => {
                    const isSelected = modelSearch.toLowerCase() === p.toLowerCase();
                    return (
                      <button
                        key={p}
                        onClick={() => setModelSearch(isSelected ? '' : p)}
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-medium capitalize whitespace-nowrap transition-all border",
                          isSelected
                            ? "bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 border-transparent shadow-sm"
                            : "bg-zinc-50 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
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
                  <div className="py-12 text-center text-zinc-400 text-xs italic">
                    No models found matching "{modelSearch}"
                  </div>
                ) : (
                  Object.entries(
                    filteredModels.reduce((acc, m) => {
                      if (!acc[m.provider]) acc[m.provider] = [];
                      acc[m.provider].push(m);
                      return acc;
                    }, {} as Record<string, Model[]>)
                  ).map(([provider, providerModels]) => (
                    <div key={provider} className="mb-2 font-sans text-xs">
                      <div className="px-3 py-1 text-[10px] font-semibold capitalize text-zinc-500 flex items-center gap-2">
                        {provider}
                        <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800/30" />
                      </div>
                      <div className="px-1 space-y-0.5 mt-0.5">
                        {providerModels.map((model) => {
                          const isFocused = filteredModels[focusedModelIndex]?.id === model.id;
                          const isSelected = selectedModelId === model.id && selectedProvider === model.provider;
                          return (
                            <button
                              key={model.id}
                              onClick={() => { 
                                onSelectModel(model.id, model.provider); 
                                setIsOpen(false); 
                              }}
                              className={cn(
                                "w-full flex items-center justify-between px-2 py-1 rounded transition-colors text-left group",
                                isSelected 
                                  ? "bg-primary/10 dark:bg-primary/20 text-primary" 
                                  : isFocused 
                                    ? "bg-zinc-100 dark:bg-zinc-800"
                                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <ProviderIcon provider={provider} className="w-3.5 h-3.5 opacity-70" />
                                <div className="flex flex-col min-w-0">
                                  <span className={cn(
                                    "text-[12px] truncate transition-colors",
                                    isSelected 
                                      ? "font-bold text-primary" 
                                      : "text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white"
                                  )}>
                                    {model.name}
                                  </span>
                                </div>
                              </div>
                              {isSelected && (
                                <motion.div layoutId="active-check" className="bg-blue-600 dark:bg-blue-500 rounded-full p-1 shadow-sm">
                                  <Check className="w-3 h-3 text-white" />
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
                 <div className="mt-1 pt-1 border-t border-zinc-100 dark:border-zinc-800/50 px-2">
                   <button 
                     onClick={() => { setIsOpen(false); onOpenModelSelector(); }}
                     className="w-full flex items-center justify-center gap-2 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 py-2.5 font-medium transition-colors"
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
};
