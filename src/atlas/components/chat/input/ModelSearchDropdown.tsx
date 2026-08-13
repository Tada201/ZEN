import { memo, useState, useEffect, useMemo, useDeferredValue, useId, useRef } from 'react';
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
  isOpen,
  setIsOpen,
  models,
  selectedModelId,
  selectedProvider,
  onSelectModel,
  onOpenModelSelector,
  isCompact,
}: ModelSearchDropdownProps) => {
  const reducedMotion = useReducedMotion();
  const [modelSearch, setModelSearch] = useState('');
  const [focusedModelIndex, setFocusedModelIndex] = useState(0);
  const deferredModelSearch = useDeferredValue(modelSearch);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);
  const listboxId = `composer-model-listbox-${useId().replace(/:/g, '')}`;

  const filteredModels = useMemo(() => {
    if (!isOpen) return [];
    const query = deferredModelSearch.toLowerCase();
    return models.filter((model) =>
      model.name.toLowerCase().includes(query) ||
      model.provider.toLowerCase().includes(query),
    );
  }, [isOpen, deferredModelSearch, models]);

  const groupedVisibleModels = useMemo(() => (
    filteredModels.reduce((acc, model) => {
      if (!acc[model.provider]) acc[model.provider] = [];
      acc[model.provider].push(model);
      return acc;
    }, {} as Record<string, Model[]>)
  ), [filteredModels]);

  const providerFilters = useMemo(() => (
    isOpen ? Array.from(new Set(models.map((model) => model.provider))) : []
  ), [isOpen, models]);

  const selectedModelInfo = useMemo(() => (
    models.find((model) => model.id === selectedModelId && model.provider === selectedProvider)
      || { id: 'default', name: selectedModelId || 'No Model', provider: selectedProvider || 'default' }
  ), [models, selectedModelId, selectedProvider]);

  const optionId = (model: Model) => `${listboxId}-option-${model.provider}-${model.id}`.replace(/[^a-zA-Z0-9_-]/g, '-');
  const focusedModel = filteredModels[focusedModelIndex];

  useEffect(() => {
    setFocusedModelIndex(0);
  }, [deferredModelSearch]);

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      triggerRef.current?.focus();
    }
  }, [isOpen]);

  const handleModelKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      return;
    }

    if (filteredModels.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setFocusedModelIndex((previous) => (previous + 1) % filteredModels.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocusedModelIndex((previous) => (previous - 1 + filteredModels.length) % filteredModels.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setFocusedModelIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setFocusedModelIndex(filteredModels.length - 1);
    } else if (event.key === 'Enter') {
      const model = filteredModels[focusedModelIndex];
      if (!model) return;
      event.preventDefault();
      onSelectModel(model.id, model.provider);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative z-[100]">
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        aria-label={`Select model: ${selectedModelInfo.name}`}
        title={`Select model: ${selectedModelInfo.name}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        className={cn(
          'composer-control text-[13px] font-semibold shrink-0',
          isCompact ? 'max-w-[40px] min-w-0' : 'max-w-[160px] min-w-[100px]',
        )}
      >
        <ProviderIcon provider={selectedModelInfo.provider} className="w-3.5 h-3.5 shrink-0" />
        {!isCompact && <span className="truncate flex-1">{selectedModelInfo.name}</span>}
        <ChevronDown aria-hidden="true" className="w-3 h-3 opacity-50 shrink-0" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-[110]" onClick={() => setIsOpen(false)} aria-hidden="true" />
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, y: -10 }}
              transition={reducedMotion ? { duration: 0 } : {
                duration: motionDurations.fast,
                ease: motionEasings.standard,
              }}
              className="composer-popover composer-popover--bounded absolute bottom-full left-0 z-[120] mb-1 flex min-w-0 flex-col overflow-hidden py-0.5 font-sans"
            >
              <div className="composer-toolbar mb-1 space-y-1.5 border-b px-2 pb-1.5">
                <div className="flex items-center justify-between px-1">
                  <div className="text-[10px] font-semibold capitalize text-muted-foreground">Select AI Model</div>
                  {modelSearch && (
                    <button
                      type="button"
                      onClick={() => setModelSearch('')}
                      className="text-[10px] font-semibold capitalize text-primary hover:underline"
                    >
                      Clear Filter
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Search aria-hidden="true" className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search models..."
                    aria-label="Search models"
                    role="combobox"
                    aria-expanded={isOpen}
                    aria-controls={listboxId}
                    aria-autocomplete="list"
                    aria-activedescendant={focusedModel ? optionId(focusedModel) : undefined}
                    value={modelSearch}
                    onChange={(event) => setModelSearch(event.target.value)}
                    onKeyDown={handleModelKeyDown}
                    className="composer-field w-full rounded border border-border bg-muted pl-8 pr-2 py-1.5 text-[12px] text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/30"
                  />
                </div>

                <div className="flex gap-1 overflow-x-auto no-scrollbar pb-0.5 px-0.5" aria-label="Filter models by provider">
                  <button
                    type="button"
                    onClick={() => setModelSearch('')}
                    className={cn(
                      'composer-control h-6 min-h-0 rounded border px-2 py-0.5 text-[10px] font-medium capitalize whitespace-nowrap',
                      !modelSearch
                        ? 'composer-control--active border-transparent text-foreground shadow-sm'
                        : 'border-border text-muted-foreground',
                    )}
                  >
                    All
                  </button>
                  {providerFilters.map((provider) => {
                    const isSelected = modelSearch.toLowerCase() === provider.toLowerCase();
                    return (
                      <button
                        type="button"
                        key={provider}
                        onClick={() => setModelSearch(isSelected ? '' : provider)}
                        className={cn(
                          'composer-control h-6 min-h-0 rounded border px-2 py-0.5 text-[10px] font-medium capitalize whitespace-nowrap',
                          isSelected
                            ? 'composer-control--active border-transparent text-foreground shadow-sm'
                            : 'border-border text-muted-foreground',
                        )}
                      >
                        {provider}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                id={listboxId}
                role="listbox"
                aria-label="Available AI models"
                aria-activedescendant={focusedModel ? optionId(focusedModel) : undefined}
                className="max-h-[350px] overflow-y-auto no-scrollbar px-1"
              >
                {filteredModels.length === 0 ? (
                  <div className="py-8 text-center text-xs italic text-muted-foreground" role="status">
                    No models found matching "{modelSearch}"
                  </div>
                ) : (
                  Object.entries(groupedVisibleModels).map(([provider, providerModels]) => (
                    <div key={provider} role="group" aria-label={provider} className="mb-1 font-sans text-xs">
                      <div className="flex items-center gap-2 px-3 py-1 text-[10px] font-semibold capitalize text-muted-foreground">
                        {provider}
                        <div className="h-px flex-1 bg-border" aria-hidden="true" />
                      </div>
                      <div className="mt-0.5 space-y-0.5 px-1">
                        {providerModels.map((model) => {
                          const isFocused = focusedModel?.id === model.id && focusedModel?.provider === model.provider;
                          const isSelected = selectedModelId === model.id && selectedProvider === model.provider;
                          return (
                            <button
                              type="button"
                              role="option"
                              tabIndex={-1}
                              id={optionId(model)}
                              aria-selected={isSelected}
                              key={`${provider}:${model.id}`}
                              onClick={() => {
                                onSelectModel(model.id, model.provider);
                                setIsOpen(false);
                              }}
                              className={cn(
                                'composer-menu-item text-left group',
                                isSelected
                                  ? 'bg-primary/10 text-primary'
                                  : isFocused
                                    ? 'composer-menu-item--active'
                                    : '',
                              )}
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <ProviderIcon provider={provider} className="w-3.5 h-3.5 opacity-70" />
                                <span className={cn(
                                  'truncate text-[12px] transition-colors',
                                  isSelected ? 'font-bold text-primary' : 'text-foreground',
                                )}>
                                  {model.name}
                                </span>
                              </span>
                              {isSelected && (
                                <span className="rounded-full bg-primary p-1 shadow-sm">
                                  <Check aria-hidden="true" className="w-3 h-3 text-foreground" />
                                </span>
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
                <div className="composer-toolbar mt-1 border-t px-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setIsOpen(false); onOpenModelSelector(); }}
                    className="composer-control w-full py-1.5 text-xs font-medium"
                  >
                    <Sliders aria-hidden="true" className="w-3.5 h-3.5" />
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
