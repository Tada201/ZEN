import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils/style';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';

interface ModelInPageSelectorProps {
  models: Array<{ id: string; name: string; displayName?: string; source?: string; provider?: string }>;
  selectedModelId: string;
  onModelSelect: (id: string) => void;
  fetching?: boolean;
  className?: string;
  status?: 'ready' | 'warning' | 'missing';
  /** Shown when models list is empty and provider requires a key */
  emptyHint?: string;
  disabled?: boolean;
}

export const ModelInPageSelector: React.FC<ModelInPageSelectorProps> = ({
  models,
  selectedModelId,
  onModelSelect,
  fetching = false,
  className,
  status = 'ready',
  emptyHint,
  disabled = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredModels = useMemo(() => {
    if (!searchQuery) return models;
    const query = searchQuery.toLowerCase();
    return models.filter(m => 
        (m.id || '').toLowerCase().includes(query) || 
        (m.name || '').toLowerCase().includes(query) || 
        (m.displayName?.toLowerCase().includes(query) || false)
    );
  }, [models, searchQuery]);

  return (
    <div className={cn("flex flex-col gap-4", className, disabled && "opacity-50 pointer-events-none")}>
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className={cn("w-1.5 h-1.5 rounded-full",
            fetching ? "animate-pulse bg-warning shadow-[0_0_8px_hsl(var(--warning)/0.5)]" :
            status === 'ready' ? "bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.5)]" :
            status === 'warning' ? "animate-pulse bg-warning shadow-[0_0_8px_hsl(var(--warning)/0.5)]" :
            "bg-destructive shadow-[0_0_8px_hsl(var(--destructive)/0.5)]"
          )} />
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
            {fetching ? 'DISCOVERING_NODE' : 'PROVIDER_MODELS'}
          </span>
        </div>
        {fetching && (
          <WorkbenchIcon name="lucide:refresh-cw" size={10} className="animate-spin text-muted-foreground/50" />
        )}
      </div>

      {/* Search Input */}
      {!fetching && models.length > 0 && (
          <div className="relative group">
              <WorkbenchIcon
                name="lucide:search"
                size={12}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary/60 transition-colors"
              />
              <input
                type="text"
                placeholder="Filter models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-4 bg-muted/50 border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40 transition-all"
              />
          </div>
      )}

      {!fetching && models.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border border-border bg-muted/20">
          <WorkbenchIcon name="lucide:inbox" size={18} className="text-muted-foreground/40" />
          <span className="text-[10px] text-muted-foreground/70 text-center leading-relaxed px-4">
            {emptyHint || 'No models found. Enter an API key and click away to refresh.'}
          </span>
        </div>
      ) : (
        <div className="max-h-[220px] overflow-y-auto custom-scrollbar border border-border rounded-xl bg-muted/20">
            {!fetching && filteredModels.length === 0 ? (
                <div className="py-8 flex flex-col items-center gap-2 opacity-50">
                    <WorkbenchIcon name="lucide:search-slash" size={20} />
                    <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">No models match criteria</span>
                </div>
            ) : (
                <div className="flex flex-col">
                    {filteredModels.map((model, index) => {
                        const fullId = model.provider ? `${model.provider}::${model.id}` : model.id;
                        const isSelected = selectedModelId === fullId || selectedModelId === model.id;

                        return (
                            <button
                              key={`${model.provider || 'prov'}-${model.id || 'mod'}-${index}`}
                              onClick={() => onModelSelect(model.id)}
                              className={cn(
                                  "flex items-center justify-between px-4 py-2.5 transition-all hover:bg-muted group text-left",
                                  isSelected ? "bg-primary/5 border-l-2 border-primary" : "border-l-2 border-transparent"
                              )}
                            >
                                <div className="flex flex-col items-start gap-0.5 min-w-0">
                                    <span className={cn(
                                        "text-[11px] font-bold uppercase tracking-wider truncate w-full",
                                        isSelected ? "text-primary" : "text-foreground/80 group-hover:text-foreground"
                                    )}>
                                        {model.displayName || model.name || model.id}
                                    </span>
                                    <span className="text-[9px] text-muted-foreground/70 font-mono truncate w-full">{model.id}</span>
                                </div>
                                {isSelected && (
                                    <WorkbenchIcon name="lucide:check" size={12} className="text-primary shrink-0" />
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
      )}

      <div className="flex flex-col gap-1.5 px-1">
        <span className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-[0.15em]">
          Active Identifier
        </span>
        <div className="flex items-center gap-2.5 font-mono text-[10px] text-muted-foreground bg-muted/50 border border-border px-3 py-2 rounded-xl">
          <WorkbenchIcon name="lucide:cpu" size={10} className="text-muted-foreground/60" />
          <span className="truncate tracking-tight">{selectedModelId || 'ID_NOT_ASSIGNED'}</span>
        </div>
      </div>
    </div>
  );
};
