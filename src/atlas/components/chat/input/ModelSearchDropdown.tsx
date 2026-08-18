import { memo, useState, useEffect, useMemo, useDeferredValue, useId, useRef } from 'react';
import { ChevronDown, ChevronLeft, Search, Check, Sliders, Brain, Zap, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils/style';
import { motionDurations, motionEasings, useReducedMotion } from '@/lib/motion';
import type { Model } from '../../model-types';
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

/** Progressive-disclosure stages: each pick collapses the prior column. */
type Stage = 'provider' | 'model' | 'detail';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Smart: <Brain aria-hidden="true" className="h-3 w-3 text-primary" />,
  Fast: <Zap aria-hidden="true" className="h-3 w-3 text-warning" />,
  Balanced: <Sparkles aria-hidden="true" className="h-3 w-3 text-success" />,
};

// Column widths per stage; the detail pane is flex-1 and absorbs the remainder,
// so shrinking either rail visibly re-flows the layout.
const PROVIDER_W = { provider: 172, model: 56, detail: 56 } as const;
const MODEL_W = { provider: 208, model: 252, detail: 68 } as const;

function formatTokens(n?: number): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function SpecCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-foreground">{value}</div>
      {sub && <div className="truncate text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
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
  const [activeProvider, setActiveProvider] = useState('');
  const [focusedModelIndex, setFocusedModelIndex] = useState(0);
  const [stage, setStage] = useState<Stage>('provider');
  const deferredModelSearch = useDeferredValue(modelSearch);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);
  const listboxId = `composer-model-listbox-${useId().replace(/:/g, '')}`;

  const searching = deferredModelSearch.trim().length > 0;

  const providers = useMemo(
    () => (isOpen ? Array.from(new Set(models.map((m) => m.provider))) : []),
    [isOpen, models],
  );

  // Default the rail to the selected model's provider (or the first available).
  useEffect(() => {
    if (!isOpen) return;
    setActiveProvider((prev) => {
      if (prev && providers.includes(prev)) return prev;
      if (selectedProvider && providers.includes(selectedProvider)) return selectedProvider;
      return providers[0] ?? '';
    });
  }, [isOpen, providers, selectedProvider]);

  // Reset the disclosure to where the user's current model lives each open.
  useEffect(() => {
    if (!isOpen) return;
    setModelSearch('');
    setStage(selectedProvider && providers.includes(selectedProvider) ? 'model' : 'provider');
  }, [isOpen, selectedProvider, providers]);

  const filteredModels = useMemo(() => {
    if (!isOpen) return [];
    const query = deferredModelSearch.toLowerCase();
    return models.filter((model) => {
      if (query) {
        return (
          model.name.toLowerCase().includes(query) ||
          model.provider.toLowerCase().includes(query)
        );
      }
      return model.provider === activeProvider;
    });
  }, [isOpen, deferredModelSearch, activeProvider, models]);

  const providerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of models) counts[m.provider] = (counts[m.provider] ?? 0) + 1;
    return counts;
  }, [models]);

  const selectedModelInfo = useMemo(() => {
    const found = models.find((model) => model.id === selectedModelId && model.provider === selectedProvider);
    if (found) return found;
    const rawName = selectedModelId || 'No Model';
    const friendlyName = rawName.includes('/')
      ? rawName.split('/').pop()!.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : rawName;
    const providerLabel = selectedProvider
      ? selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1)
      : 'default';
    return { id: selectedModelId || 'default', name: friendlyName, provider: providerLabel };
  }, [models, selectedModelId, selectedProvider]);

  const optionId = (model: Model) => `${listboxId}-option-${model.provider}-${model.id}`.replace(/[^a-zA-Z0-9_-]/g, '-');
  const focusedModel = filteredModels[focusedModelIndex] ?? filteredModels[0];

  // Searching flattens the disclosure — results span every provider.
  const effectiveStage: Stage = searching ? 'model' : stage;

  useEffect(() => {
    setFocusedModelIndex(0);
  }, [deferredModelSearch, activeProvider]);

  // Keep the arrow-key-focused option visible inside the scrollable listbox.
  useEffect(() => {
    if (!focusedModel) return;
    document.getElementById(optionId(focusedModel))?.scrollIntoView({ block: 'nearest' });
  }, [focusedModelIndex, focusedModel]);

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      triggerRef.current?.focus();
    }
  }, [isOpen]);

  const pickProvider = (provider: string) => {
    setModelSearch('');
    setActiveProvider(provider);
    setStage('model');
  };

  const inspectModel = (index: number) => {
    setFocusedModelIndex(index);
    setStage('detail');
  };

  const commit = (model: Model) => {
    onSelectModel(model.id, model.provider);
    setIsOpen(false);
  };

  const transition = reducedMotion
    ? { duration: 0 }
    : { duration: motionDurations.standard, ease: motionEasings.standard };

  const handleModelKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      return;
    }
    if (filteredModels.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setFocusedModelIndex((p) => (p + 1) % filteredModels.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocusedModelIndex((p) => (p - 1 + filteredModels.length) % filteredModels.length);
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
      // While searching the disclosure is flattened, so Enter commits directly.
      // Otherwise first Enter reveals the detail pane; second commits.
      if (searching || effectiveStage === 'detail') commit(model);
      else setStage('detail');
    }
  };

  const providerCollapsed = effectiveStage !== 'provider';
  const modelCollapsed = effectiveStage === 'detail';

  return (
    <div className="relative z-[100]">
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        aria-label={`Select model: ${selectedModelInfo.name}`}
        title={`Select model: ${selectedModelInfo.name}`}
        aria-haspopup="dialog"
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
              role="dialog"
              aria-label="Select AI model"
              initial={reducedMotion ? false : { opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, y: -10 }}
              transition={reducedMotion ? { duration: 0 } : {
                duration: motionDurations.fast,
                ease: motionEasings.standard,
              }}
              className="composer-popover absolute bottom-full left-0 z-[120] mb-1 flex w-[600px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden font-sans"
            >
              {/* Search header spans full width */}
              <div className="composer-toolbar border-b px-2 py-1.5">
                <div className="relative">
                  <Search aria-hidden="true" className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Filter models..."
                    aria-label="Filter models"
                    role="combobox"
                    aria-expanded={isOpen}
                    aria-controls={listboxId}
                    aria-autocomplete="list"
                    aria-activedescendant={focusedModel ? optionId(focusedModel) : undefined}
                    value={modelSearch}
                    onChange={(event) => setModelSearch(event.target.value)}
                    onKeyDown={handleModelKeyDown}
                    className="composer-field w-full rounded border border-border bg-muted pl-8 pr-2 py-1.5 text-xs text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/30"
                  />
                </div>
              </div>

              <div className="flex h-[320px]">
                {/* LEFT: provider rail — collapses to logos once a provider is picked */}
                <motion.div
                  className="flex shrink-0 flex-col overflow-hidden border-r border-border"
                  animate={{ width: providerCollapsed ? PROVIDER_W.model : PROVIDER_W.provider }}
                  transition={transition}
                >
                  {!providerCollapsed && (
                    <div className="px-3 py-1.5 text-[10px] font-semibold lowercase tracking-wide text-muted-foreground">
                      providers
                    </div>
                  )}
                  <div
                    className={cn('flex-1 overflow-y-auto no-scrollbar pb-2', providerCollapsed ? 'px-1.5 pt-1.5' : 'px-1.5')}
                    role="group"
                    aria-label="Providers"
                  >
                    {providers.map((provider) => {
                      const active = provider === activeProvider;
                      return (
                        <button
                          key={provider}
                          type="button"
                          aria-pressed={active}
                          aria-label={`${provider}, ${providerCounts[provider]} models`}
                          title={providerCollapsed ? `${provider} (${providerCounts[provider]})` : undefined}
                          onClick={() => (providerCollapsed && active ? setStage('provider') : pickProvider(provider))}
                          className={cn(
                            'group flex w-full items-center rounded text-left transition-colors',
                            providerCollapsed ? 'justify-center px-0 py-2' : 'gap-2 px-2 py-1.5 text-xs capitalize',
                            active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted',
                          )}
                        >
                          <ProviderIcon provider={provider} className={cn('h-4 w-4 shrink-0', !active && 'opacity-70 group-hover:opacity-100')} />
                          {!providerCollapsed && (
                            <>
                              <span className="flex-1 truncate">{provider}</span>
                              <span className={cn(
                                'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                                active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                              )}>
                                {providerCounts[provider]}
                              </span>
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>

                {/* MIDDLE: model list — grows, then collapses to an icon strip on detail */}
                <motion.div
                  className={cn('flex flex-col overflow-hidden border-r border-border', searching ? 'flex-1' : 'shrink-0')}
                  animate={searching ? {} : { width: modelCollapsed ? MODEL_W.detail : MODEL_W.model }}
                  transition={transition}
                >
                  {!modelCollapsed && (
                    <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-muted-foreground">
                      {providerCollapsed && !searching && (
                        <button
                          type="button"
                          onClick={() => setStage('provider')}
                          className="composer-control composer-control--icon -my-1 h-6 w-6 min-h-0 min-w-0"
                          aria-label="Back to providers"
                        >
                          <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <span className="flex-1 truncate">
                        {filteredModels.length} {filteredModels.length === 1 ? 'model' : 'models'}
                        {!searching && activeProvider ? ` · ${activeProvider}` : ''}
                      </span>
                    </div>
                  )}
                  <div
                    id={listboxId}
                    role="listbox"
                    aria-label="Available AI models"
                    className={cn('flex-1 space-y-0.5 overflow-y-auto no-scrollbar pb-2', modelCollapsed ? 'px-1.5 pt-1.5' : 'px-1.5')}
                  >
                    {filteredModels.length === 0 ? (
                      !modelCollapsed && (
                        <div className="px-2 py-8 text-center text-[11px] italic text-muted-foreground" role="status">
                          {searching ? `No models match "${modelSearch}"` : 'No models available'}
                        </div>
                      )
                    ) : (
                      filteredModels.map((model, i) => {
                        const isFocused = i === focusedModelIndex;
                        const isSelected = selectedModelId === model.id && selectedProvider === model.provider;
                        return (
                          <button
                            key={`${model.provider}:${model.id}`}
                            type="button"
                            role="option"
                            tabIndex={-1}
                            id={optionId(model)}
                            aria-selected={isSelected}
                            title={modelCollapsed ? model.name : undefined}
                            onClick={() => (modelCollapsed && isFocused ? setStage('model') : inspectModel(i))}
                            className={cn(
                              'flex w-full items-center rounded text-left transition-colors',
                              modelCollapsed ? 'justify-center px-0 py-2' : 'gap-2 px-2 py-1.5',
                              isSelected ? 'bg-primary/10 text-primary'
                                : isFocused ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted',
                            )}
                          >
                            {modelCollapsed ? (
                              <ProviderIcon provider={model.provider} className={cn('h-4 w-4 shrink-0', !isFocused && !isSelected && 'opacity-70')} />
                            ) : (
                              <>
                                {searching && <ProviderIcon provider={model.provider} className="h-3.5 w-3.5 shrink-0 opacity-70" />}
                                <span className={cn('flex-1 truncate text-xs', isSelected && 'font-semibold')}>{model.name}</span>
                                {isSelected && <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary" />}
                              </>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </motion.div>

                {/* RIGHT: detail — absorbs remaining width, expands on the detail stage */}
                <div className="flex flex-1 flex-col overflow-hidden">
                  {focusedModel ? (
                    <>
                      <div className="flex items-start gap-2.5 px-3 py-2.5">
                        {modelCollapsed && (
                          <button
                            type="button"
                            onClick={() => setStage('model')}
                            className="composer-control composer-control--icon -my-1 h-9 w-6 min-h-0 min-w-0 shrink-0"
                            aria-label="Back to model list"
                            title="Back to model list"
                          >
                            <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
                          <ProviderIcon provider={focusedModel.provider} className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-foreground">{focusedModel.name}</div>
                          <div className="truncate text-[10px] capitalize text-muted-foreground">via {focusedModel.provider}</div>
                        </div>
                        {focusedModel.category && (
                          <span className="flex shrink-0 items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {CATEGORY_ICONS[focusedModel.category]}{focusedModel.category}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 space-y-2.5 overflow-y-auto no-scrollbar px-3 pb-2">
                        {focusedModel.description && (
                          <p className="text-[11px] leading-relaxed text-muted-foreground">{focusedModel.description}</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <SpecCard label="context" value={`${formatTokens(focusedModel.contextWindow)} tokens`} />
                          <SpecCard
                            label="input / output"
                            value={focusedModel.inputPricePerMToken != null ? `$${focusedModel.inputPricePerMToken.toFixed(2)}` : '—'}
                            sub={focusedModel.outputPricePerMToken != null ? `$${focusedModel.outputPricePerMToken.toFixed(2)} / M out` : undefined}
                          />
                        </div>
                        {(focusedModel.capabilities.length > 0 || focusedModel.maxOutputTokens != null) && (
                          <div className="flex flex-wrap gap-1">
                            {focusedModel.capabilities.map((cap) => (
                              <span key={cap} className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] capitalize text-primary">
                                {cap.replace(/-/g, ' ')}
                              </span>
                            ))}
                            {focusedModel.maxOutputTokens != null && (
                              <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                                {formatTokens(focusedModel.maxOutputTokens)} max out
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="border-t border-border p-2">
                        {selectedModelId === focusedModel.id && selectedProvider === focusedModel.provider ? (
                          <div className="flex items-center justify-center gap-1.5 rounded border border-border py-1.5 text-[11px] font-medium text-muted-foreground">
                            <Check aria-hidden="true" className="h-3.5 w-3.5" /> Active model
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => commit(focusedModel)}
                            className="composer-control w-full py-1.5 text-[11px] font-medium"
                          >
                            Set as active model
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-1 items-center justify-center px-4 text-center text-[11px] text-muted-foreground">
                      Select a model to see details.
                    </div>
                  )}
                </div>
              </div>

              {onOpenModelSelector && (
                <div className="composer-toolbar border-t px-2 py-1">
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


