import { useState, useMemo, useEffect } from "react";
import {
  Search, Check, Zap, Brain, Sparkles,
  MessageSquare, Code, Eye, Clock,
  ChevronRight, Info, Loader2, Key,
  Copy, RefreshCw, AlertCircle, Plus, Trash2, Shield,
  ExternalLink, Globe
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { toast } from "sonner";

export type Model = {
  id: string;
  name: string;
  provider: string;
  description: string;
  category: "Smart" | "Fast" | "Balanced";
  capabilities: string[];
  available: boolean;
  contextWindow?: number;
  inputPricePerMToken?: number;
};

interface ModelSettingsContentProps {
  models: Model[];
  selectedModelId: string;
  selectedProvider: string;
  onSelect: (modelId: string, provider: string) => void;
  fetchModels: () => void;
  modelsLoading: boolean;
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  anthropic: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  google: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  xai: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  mistral: "bg-orange-600/10 text-orange-600 border-orange-600/20",
  groq: "bg-orange-400/10 text-orange-400 border-orange-400/20",
  perplexity: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  deepseek: "bg-blue-600/10 text-blue-600 border-blue-600/20",
  openrouter: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  together: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  nvidia: "bg-emerald-600/10 text-emerald-600 border-emerald-600/20",
  kilocode: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  ollama: "bg-slate-400/10 text-slate-400 border-slate-400/20",
  lmstudio: "bg-slate-600/10 text-slate-600 border-slate-600/20",
};

export function ModelSettingsContent({
  models,
  selectedModelId,
  selectedProvider,
  onSelect,
  fetchModels,
  modelsLoading
}: ModelSettingsContentProps) {
  const [search, setSearch] = useState("");
  const [activeProviderFilter, setActiveProviderFilter] = useState<string>("all");

  const providers = useMemo(() => {
    const p = new Set(models.map(m => m.provider));
    return ["all", ...Array.from(p)];
  }, [models]);

  const filteredModels = useMemo(() => {
    return models.filter(m => {
      const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase()) || 
                           m.provider.toLowerCase().includes(search.toLowerCase());
      const matchesProvider = activeProviderFilter === "all" || m.provider === activeProviderFilter;
      return matchesSearch && matchesProvider;
    });
  }, [models, search, activeProviderFilter]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h3 className="text-lg font-bold tracking-tight">AI Models</h3>
          <p className="text-[12px] text-muted-foreground">Select active model for chat sessions.</p>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 text-[11px] gap-2 text-muted-foreground hover:text-foreground" 
          onClick={fetchModels} 
          disabled={modelsLoading}
        >
          <RefreshCw className={cn("h-3 w-3", modelsLoading && "animate-spin")} />
          Sync
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <Input 
              placeholder="Search models..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-[13px] bg-muted/20 border-border/40 focus:bg-background"
            />
          </div>
          <Select 
            value={activeProviderFilter} 
            onValueChange={setActiveProviderFilter}
          >
            <SelectTrigger className="w-[140px] h-8 text-[12px] bg-muted/20">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              {providers.map(p => (
                <SelectItem key={p} value={p} className="capitalize text-[12px]">
                  {p === "all" ? "All Providers" : p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="h-[280px] -mx-1 px-1">
          <div className="grid grid-cols-1 gap-2 pb-2">
            {filteredModels.length === 0 ? (
              <div className="py-12 text-center border border-dashed rounded-xl bg-muted/5">
                <p className="text-[12px] text-muted-foreground">No models found</p>
              </div>
            ) : (
              filteredModels.map(model => (
                <button
                  key={`${model.provider}-${model.id}`}
                  onClick={() => onSelect(model.id, model.provider)}
                  className={cn(
                    "group relative flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left w-full",
                    selectedModelId === model.id && selectedProvider === model.provider
                      ? "bg-primary/5 border-primary/40"
                      : "bg-card/40 border-border/40 hover:bg-muted/40",
                    !model.available && "opacity-50"
                  )}
                >
                  <div className={cn(
                    "shrink-0 h-8 w-8 rounded-lg flex items-center justify-center border border-border/40 bg-muted/30",
                    selectedModelId === model.id && selectedProvider === model.provider && "bg-primary/10 border-primary/20 text-primary"
                  )}>
                    <Brain className="h-4 w-4" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[13px] truncate">{model.name}</span>
                      <span className={cn("text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-tighter font-black", PROVIDER_COLORS[model.provider] || "bg-muted text-muted-foreground")}>
                        {model.provider}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {model.contextWindow && (
                        <span className="text-[10px] text-muted-foreground/60">
                          {model.contextWindow >= 1000000 ? `${model.contextWindow/1000000}M` : `${model.contextWindow/1000}K`} context
                        </span>
                      )}
                      <div className="h-1 w-1 rounded-full bg-muted-foreground/20" />
                      <span className="text-[10px] text-muted-foreground/60 truncate">
                        {model.capabilities?.slice(0, 2).join(", ") || "General Purpose"}
                      </span>
                    </div>
                  </div>
 
                  {selectedModelId === model.id && selectedProvider === model.provider && (
                    <Check className="h-3.5 w-3.5 text-primary mr-1" />
                  )}
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// Support components (Select)
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
