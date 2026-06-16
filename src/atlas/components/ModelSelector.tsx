import { useState, useMemo, useEffect } from "react";
import {
  Search, Check, Zap, Brain, Sparkles,
  MessageSquare, Code, Eye, Clock,
  Info, Loader2, Key,
  RefreshCw, Plus, Trash2, Shield,
  ExternalLink, ImageIcon
} from "lucide-react";
import {
  Dialog, DialogContent,
  DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
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
  supportsReasoning?: boolean;
  reasoningConfigType?: "none" | "effort" | "budget";
};

export interface ApiKey {
  id: string;
  provider: string;
  name: string;
  keyPreview: string;
  baseUrl?: string;
  createdAt: number;
  validationStatus?: "pending" | "validated" | "failed";
  isDefault?: boolean;
}

interface ModelSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: Model[];
  selectedModelId: string;
  onSelect: (modelId: string, provider: string) => void;
  fetchModels: () => void;
  modelsLoading: boolean;
  apiKeys: ApiKey[];
  addApiKey: (provider: string, name: string, keyValue: string, baseUrl?: string) => Promise<void>;
  deleteApiKey: (id: string) => Promise<void>;
}

const CATEGORY_ICONS = {
  Smart: <Brain className="h-3.5 w-3.5 text-purple-500" />,
  Fast: <Zap className="h-3.5 w-3.5 text-amber-500" />,
  Balanced: <Sparkles className="h-3.5 w-3.5 text-blue-500" />,
};

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
  opencode: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  mimo: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  together: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  nvidia: "bg-emerald-600/10 text-emerald-600 border-emerald-600/20",
  kilocode: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  ollama: "bg-slate-400/10 text-slate-400 border-slate-400/20",
  lmstudio: "bg-slate-600/10 text-slate-600 border-slate-600/20",
  custom: "bg-muted text-muted-foreground border-border",
};

const CAPABILITY_ICONS: Record<string, React.ReactNode> = {
  vision: <Eye className="h-3 w-3" />,
  tools: <MessageSquare className="h-3 w-3" />,
  coding: <Code className="h-3 w-3" />,
  "long-context": <Clock className="h-3 w-3" />,
  "1M-context": <Clock className="h-3 w-3" />,
  reasoning: <Brain className="h-3 w-3" />,
  "web-search": <Search className="h-3 w-3" />,
  "image-gen": <ImageIcon className="h-3 w-3" />,
};

const PROVIDERS = [
  { id: "openai", label: "OpenAI", placeholder: "sk-proj-...", docsUrl: "https://platform.openai.com/api-keys" },
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-...", docsUrl: "https://console.anthropic.com/settings/keys" },
  { id: "google", label: "Google Gemini", placeholder: "AIza...", docsUrl: "https://aistudio.google.com/app/apikey" },
  { id: "xai", label: "xAI (Grok)", placeholder: "xai-...", docsUrl: "https://console.x.ai/" },
  { id: "mistral", label: "Mistral", placeholder: "API Key...", docsUrl: "https://console.mistral.ai/" },
  { id: "groq", label: "Groq", placeholder: "gsk-...", docsUrl: "https://console.groq.com/keys" },
  { id: "perplexity", label: "Perplexity", placeholder: "pplx-...", docsUrl: "https://www.perplexity.ai/settings/api" },
  { id: "deepseek", label: "DeepSeek", placeholder: "sk-...", docsUrl: "https://platform.deepseek.com/" },
  { id: "openrouter", label: "OpenRouter", placeholder: "sk-or-...", docsUrl: "https://openrouter.ai/keys" },
  { id: "opencode", label: "OpenCode Free", placeholder: "Not required", docsUrl: "https://opencode.ai/docs/zen", defaultBaseUrl: "https://opencode.ai/zen/v1", isLocal: true },
  { id: "mimo", label: "MiMo Code Free", placeholder: "Not required", docsUrl: "https://platform.xiaomimimo.com/", defaultBaseUrl: "https://api.xiaomimimo.com/api/free-ai/openai/chat", isLocal: true },
  { id: "together", label: "Together AI", placeholder: "API Key...", docsUrl: "https://api.together.xyz/" },
  { id: "kilocode", label: "Kilocode", placeholder: "API Key...", docsUrl: "https://kilo.ai", defaultBaseUrl: "https://api.kilo.ai/api/gateway" },
  { id: "nvidia", label: "NVIDIA", placeholder: "nvapi-...", docsUrl: "https://build.nvidia.com/", defaultBaseUrl: "https://integrate.api.nvidia.com/v1" },
  { id: "ollama", label: "Ollama (Local)", placeholder: "Not required", docsUrl: "https://ollama.com/", defaultBaseUrl: "http://localhost:11434", isLocal: true },
  { id: "lmstudio", label: "LM Studio (Local)", placeholder: "Not required", docsUrl: "https://lmstudio.ai/", defaultBaseUrl: "http://localhost:1234", isLocal: true },
  { id: "custom", label: "Custom OpenAI", placeholder: "sk-...", docsUrl: "", showBaseUrl: true },
];

export function ModelSelector({
  open,
  onOpenChange,
  models,
  selectedModelId,
  onSelect,
  fetchModels,
  modelsLoading,
  apiKeys,
  addApiKey,
  deleteApiKey,
}: ModelSelectorProps) {
  const [activeProvider, setActiveProvider] = useState<string>("openai");
  const [search, setSearch] = useState("");
  const [addingKeyStr, setAddingKeyStr] = useState("");
  const [addingBaseUrl, setAddingBaseUrl] = useState("");
  const [isAddingKey, setIsAddingKey] = useState(false);
  const [localMode, setLocalMode] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("nexus_local_mode") === "true";
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem("nexus_local_mode", String(localMode));
  }, [localMode]);

  const currentProviderConfig = PROVIDERS.find(p => p.id === activeProvider);

  // Default to first provider with keys or models if openai is empty
  useEffect(() => {
    if (open && activeProvider === "openai") {
      const hasOpenAI = apiKeys.some(k => k.provider === "openai") || models.some(m => m.provider === "openai");
      if (!hasOpenAI) {
        const firstWithModels = PROVIDERS.find(p => models.some(m => m.provider === p.id));
        if (firstWithModels) {
          setActiveProvider(firstWithModels.id);
        } else {
          const firstWithKey = PROVIDERS.find(p => apiKeys.some(k => k.provider === p.id));
          if (firstWithKey) setActiveProvider(firstWithKey.id);
        }
      }
    }
  }, [open, models, apiKeys, activeProvider]);

  useEffect(() => {
    if (currentProviderConfig?.defaultBaseUrl) {
      setAddingBaseUrl(currentProviderConfig.defaultBaseUrl);
    } else {
      setAddingBaseUrl("");
    }
  }, [activeProvider, currentProviderConfig]);
  
  const providerModels = useMemo(() => {
    let filtered = models.filter((m) => m.provider.toLowerCase() === activeProvider.toLowerCase());
    if (search) {
      filtered = filtered.filter((m) => 
        m.name.toLowerCase().includes(search.toLowerCase()) || 
        m.description.toLowerCase().includes(search.toLowerCase())
      );
    }
    return filtered;
  }, [models, activeProvider, search]);

  const providerKeys = apiKeys.filter(k => k.provider === activeProvider);
  const activeKey = providerKeys[0];

  const handleAddKey = async () => {
    const isLocal = activeProvider === 'ollama' || activeProvider === 'lmstudio' || activeProvider === 'opencode';
    if (!addingKeyStr.trim() && !isLocal) {
      toast.error("API Key is required for this provider");
      return;
    }
    
    setIsAddingKey(true);
    try {
      const keyValue = addingKeyStr.trim() || "";
      await addApiKey(activeProvider, `${currentProviderConfig?.label || activeProvider} Key`, keyValue, addingBaseUrl);
      setAddingKeyStr("");
      fetchModels();
    } finally {
      setIsAddingKey(false);
    }
  };

  const handleSelect = (id: string) => {
    onSelect(id, activeProvider);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden bg-background border-border shadow-2xl flex flex-row h-[600px]">
        <DialogTitle className="sr-only">Model and Provider Selector</DialogTitle>
        <DialogDescription className="sr-only">Configure AI providers and select models for your chat.</DialogDescription>
        
        {/* Sidebar */}
        <div className="w-64 bg-muted/10 border-r border-border flex flex-col h-full">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" /> AI Providers
            </h2>
          </div>
          <div className="px-4 py-3 border-b border-border bg-muted/5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Local Mode</span>
                <span className="text-[10px] text-muted-foreground/60 leading-tight">Auto-discover Ollama/LM Studio</span>
              </div>
              <Switch checked={localMode} onCheckedChange={setLocalMode} className="scale-75" />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 flex flex-col gap-1">
              {PROVIDERS.map((p: any) => {
                const hasKey = apiKeys.some(k => k.provider === p.id);
                const hasModels = models.some(m => m.provider === p.id);
                const isReady = hasKey || (p.isLocal && localMode && hasModels);
                const isActive = activeProvider === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setActiveProvider(p.id);
                      setSearch("");
                    }}
                    className={cn(
                      "flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors text-left",
                      isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span>{p.label}</span>
                    {isReady && <Check className="h-4 w-4 text-emerald-500" />}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
          <div className="p-6 border-b border-border flex flex-col gap-4 shrink-0 bg-card/20">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold capitalize">{PROVIDERS.find(p => p.id === activeProvider)?.label}</h3>
                <p className="text-sm text-muted-foreground mt-1">Configure API key and select a model for your chat.</p>
              </div>
            </div>

            {activeKey ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">API Key Configured</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{activeKey.keyPreview}</p>
                    {activeKey.baseUrl && (
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate max-w-[200px]">Base URL: {activeKey.baseUrl}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => deleteApiKey(activeKey.id)} className="h-8 gap-2 text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Add API Key to unlock models</p>
                  <a href={PROVIDERS.find(p => p.id === activeProvider)?.docsUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                    Get key here <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input 
                        type="password" 
                        placeholder={currentProviderConfig?.placeholder} 
                        className="pl-9 h-9"
                        value={addingKeyStr}
                        onChange={(e) => setAddingKeyStr(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddKey()}
                      />
                    </div>
                    <Button size="sm" onClick={handleAddKey} disabled={isAddingKey || (!addingKeyStr && activeProvider !== 'ollama' && activeProvider !== 'lmstudio' && activeProvider !== 'opencode')} className="h-9 gap-2">
                      {isAddingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      Save Key
                    </Button>
                  </div>
                  
                  {(currentProviderConfig?.showBaseUrl || currentProviderConfig?.defaultBaseUrl) && (
                    <div className="relative">
                      <ExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input 
                        placeholder="Custom Base URL (e.g. http://localhost:11434/v1)" 
                        className="pl-9 h-8 text-xs"
                        value={addingBaseUrl}
                        onChange={(e) => setAddingBaseUrl(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-hidden flex flex-col p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium text-sm">Available Models</h4>
              <div className="flex items-center gap-2">
                <div className="relative w-48">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input 
                    placeholder="Search models..." 
                    value={search} 
                    onChange={e => setSearch(e.target.value)}
                    className="h-8 pl-8 text-xs bg-muted/30"
                  />
                </div>
                <Button variant="outline" size="sm" className="h-8 gap-2 px-2" onClick={fetchModels} disabled={modelsLoading}>
                  <RefreshCw className={cn("h-3.5 w-3.5", modelsLoading && "animate-spin")} />
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 -mx-2 px-2">
              {!activeKey && providerModels.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12 px-4">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Key className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">Authentication Required</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-[250px]">
                    Please configure your API key above to load models for this provider.
                  </p>
                </div>
              ) : providerModels.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12 px-4">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Info className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">No Models Found</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-[250px]">
                    Try refreshing the model list or checking your search query.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 pb-4">
                  {providerModels.map(model => (
                    <ModelCard 
                      key={model.id} 
                      model={model} 
                      selected={selectedModelId === model.id}
                      onSelect={() => handleSelect(model.id)}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModelCard({ model, selected, onSelect }: { model: Model, selected: boolean, onSelect: () => void }) {
  const formatContextWindow = (cw: number) => {
    if (cw >= 1_000_000) return `${(cw / 1_000_000).toFixed(0)}M context`;
    if (cw >= 1_000) return `${(cw / 1_000).toFixed(0)}K context`;
    return `${cw} context`;
  };

  return (
    <button
      onClick={onSelect}
      className={cn(
        "group relative flex flex-col items-start p-4 rounded-xl border transition-all text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
        selected
          ? "bg-primary/5 border-primary shadow-sm"
          : "bg-card/40 border-border/60 hover:border-primary/40 hover:bg-muted/30",
        !model.available && "opacity-75 bg-muted/20 border-border/60"
      )}
    >
      <div className="flex w-full items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{model.name}</span>
          <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5 font-medium uppercase tracking-wider", PROVIDER_COLORS[model.provider])}>
            {model.provider}
          </Badge>
        </div>
        {selected && <Check className="h-4 w-4 text-primary" />}
      </div>

      <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed w-[95%]">
        {model.description}
      </p>

      {(model.contextWindow != null || model.inputPricePerMToken != null) && (
        <div className="flex items-center gap-2 mb-3">
          {model.contextWindow != null && (
            <span className="text-[10px] text-muted-foreground/70 bg-muted/50 border border-border/40 px-1.5 py-0.5 rounded-md font-mono">
              {formatContextWindow(model.contextWindow)}
            </span>
          )}
          {model.inputPricePerMToken != null && (
            <span className="text-[10px] text-muted-foreground/70 bg-muted/50 border border-border/40 px-1.5 py-0.5 rounded-md font-mono">
              ${model.inputPricePerMToken.toFixed(2)}/M input
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between w-full mt-auto pt-1">
        <div className="flex items-center gap-2">
          {model.capabilities.map((cap) => (
            <div key={cap} className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-md">
              {CAPABILITY_ICONS[cap]} <span className="capitalize">{cap.replace("-", " ")}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-md border border-border/40">
          {CATEGORY_ICONS[model.category as keyof typeof CATEGORY_ICONS]}
          {model.category}
        </div>
      </div>
    </button>
  );
}
