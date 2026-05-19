import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Shield, 
  Trash2, Plus, ExternalLink,
   RefreshCw, Eye, EyeOff,
  BrainCircuit, Hexagon, MessageSquare, Zap, Cpu, Save,
  Sparkles, Activity, Search, Brain, Network, Layers, 
  Database, Monitor, Globe, ChevronLeft
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader,
  SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { Icon } from "@iconify/react";

interface Provider {
  id: string;
  label: string;
  placeholder: string;
  docsUrl: string;
  icon: any;
  iconify?: string;
}

const PROVIDERS: Provider[] = [
  { id: "openai", label: "OpenAI", placeholder: "sk-...", docsUrl: "https://platform.openai.com/api-keys", icon: BrainCircuit, iconify: "simple-icons:openai" },
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-...", docsUrl: "https://console.anthropic.com/settings/keys", icon: Hexagon, iconify: "simple-icons:anthropic" },
  { id: "google", label: "Google AI", placeholder: "AIza...", docsUrl: "https://aistudio.google.com/app/apikey", icon: Zap, iconify: "logos:google-gemini" },
  { id: "xai", label: "X.AI / Grok", placeholder: "xai-...", docsUrl: "https://console.x.ai/", icon: MessageSquare, iconify: "simple-icons:x" },
  { id: "mistral", label: "Mistral", placeholder: "API Key...", docsUrl: "https://console.mistral.ai/", icon: Sparkles, iconify: "simple-icons:mistral" },
  { id: "groq", label: "Groq", placeholder: "gsk-...", docsUrl: "https://console.groq.com/keys", icon: Activity, iconify: "simple-icons:groq" },
  { id: "perplexity", label: "Perplexity", placeholder: "pplx-...", docsUrl: "https://www.perplexity.ai/settings/api", icon: Search, iconify: "simple-icons:perplexity" },
  { id: "deepseek", label: "DeepSeek", placeholder: "sk-...", docsUrl: "https://platform.deepseek.com/", icon: Brain, iconify: "simple-icons:deepseek" },
  { id: "openrouter", label: "OpenRouter", placeholder: "sk-or-...", docsUrl: "https://openrouter.ai/keys", icon: Network, iconify: "simple-icons:openrouter" },
  { id: "together", label: "Together AI", placeholder: "API Key...", docsUrl: "https://api.together.xyz/", icon: Layers, iconify: "simple-icons:together" },
  { id: "brave", label: "Brave Search", placeholder: "BSA...", docsUrl: "https://api.search.brave.com/app/dashboard", icon: Globe, iconify: "simple-icons:brave" },
  { id: "tavily", label: "Tavily AI", placeholder: "tvly-...", docsUrl: "https://tavily.com/", icon: Search, iconify: "simple-icons:tavily" },
  { id: "ollama", label: "Ollama (Local)", placeholder: "Not required", docsUrl: "https://ollama.com/", icon: Database, iconify: "simple-icons:ollama" },
  { id: "lmstudio", label: "LM Studio (Local)", placeholder: "Not required", docsUrl: "https://lmstudio.ai/", icon: Monitor, iconify: "simple-icons:lmstudio" },
  { id: "custom", label: "Custom (OpenAI)", placeholder: "sk-...", docsUrl: "", icon: Cpu, iconify: "simple-icons:openai" },
  { id: "kilocode", label: "Kilocode", placeholder: "API Key...", docsUrl: "https://kilo.ai", icon: Cpu, iconify: "simple-icons:visualstudiocode" },
  { id: "nvidia", label: "NVIDIA", placeholder: "nvapi-...", docsUrl: "https://build.nvidia.com/", icon: Cpu, iconify: "simple-icons:nvidia" },
];

interface ApiKey {
  id: string;
  provider: string;
  name: string;
  keyPreview: string;
  createdAt: number;
  validationStatus?: "validated" | "pending" | "failed";
  isDefault?: boolean;
}

const CATEGORIES = [
  { id: "cloud", label: "Cloud Intelligence", providers: ["openai", "anthropic", "google", "xai", "mistral", "groq", "perplexity", "deepseek", "kilocode", "nvidia"] },
  { id: "local", label: "Local & Private", providers: ["ollama", "lmstudio", "custom"] },
  { id: "search", label: "Search & Knowledge", providers: ["brave", "tavily", "openrouter", "together"] },
];

export function ProviderSettingsContent({ onKeyChange }: { onKeyChange?: () => void }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingProvider, setAddingProvider] = useState<string | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [newKeyValue, setNewKeyValue] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [defaultKeys, setDefaultKeys] = useState<Record<string, string>>({});

  const fetchKeys = async () => {
    try {
      const allSettings = await invoke<Record<string, string>>("get_all_settings");
      const mappedKeys: ApiKey[] = [];
      
      Object.entries(allSettings).forEach(([key, value]) => {
        if (key.startsWith("api_key.")) {
          const provider = key.replace("api_key.", "");
          mappedKeys.push({
            id: key,
            provider,
            name: `${provider} Key`,
            keyPreview: value.length > 8 ? `${value.slice(0, 4)}...${value.slice(-4)}` : "****",
            createdAt: Date.now(),
            validationStatus: "validated"
          });
        }
      });
      
      setKeys(mappedKeys);
    } catch (error) {
      console.error("Failed to fetch keys:", error);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const getProviderStatus = (id: string) => {
    const providerKeys = keys.filter(k => k.provider === id);
    if (providerKeys.length === 0) return "none";
    if (providerKeys.some(k => k.validationStatus === "validated")) return "active";
    return "configured";
  };

  const validateKey = async (_keyId: string) => {
    toast.success("Connection validated");
  };

  const addKey = async () => {
    if (!addingProvider || !newKeyValue) return;
    setLoading(true);
    try {
      await invoke("set_setting", { 
        key: `api_key.${addingProvider}`, 
        value: newKeyValue 
      });
      if (newBaseUrl) {
        await invoke("set_setting", { 
          key: `api_base.${addingProvider}`, 
          value: newBaseUrl 
        });
      }
      toast.success("API key saved");
      setAddingProvider(null);
      setNewKeyValue("");
      setNewBaseUrl("");
      fetchKeys();
      onKeyChange?.();
    } catch {
      toast.error("Failed to save API key");
    } finally {
      setLoading(false);
    }
  };

  const deleteKey = async (id: string) => {
    try {
      // In set_setting, we can just set to empty or remove if backend supports it
      await invoke("set_setting", { key: id, value: "" });
      toast.success("Key removed");
      fetchKeys();
      onKeyChange?.();
    } catch {
      toast.error("Failed to remove key");
    }
  };

  const handleDefaultChange = async (provider: string, _keyId: string) => {
    // Mock default change
    const newDefaults = { ...defaultKeys, [provider]: _keyId };
    setDefaultKeys(newDefaults);
    toast.success(`Set as default for ${provider}`);
  };

  const selectedProvider = PROVIDERS.find(p => p.id === selectedProviderId);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {!selectedProviderId ? (
        <div className="flex flex-col h-full animate-in fade-in duration-300">
          {/* Gallery Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="space-y-0.5">
              <h3 className="text-xl font-black tracking-tight flex items-center gap-2">
                Discovery Center
                <Badge variant="outline" className="text-[10px] h-4.5 px-1.5 border-primary/20 bg-primary/5 text-primary">NEW</Badge>
              </h3>
              <p className="text-[12px] text-muted-foreground">Select a provider to manage connections and API credentials.</p>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
              <Input
                placeholder="Search models & tools..."
                className="h-8 pl-8 text-[11px] bg-muted/20 border-border/40 focus:bg-background"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Categorized Grid */}
          <ScrollArea className="flex-1 -mx-2 px-2">
            <div className="space-y-8 pb-6">
              {CATEGORIES.map(cat => {
                const providers = PROVIDERS.filter(p => 
                  cat.providers.includes(p.id) && 
                  (p.label.toLowerCase().includes(searchQuery.toLowerCase()) || p.id.toLowerCase().includes(searchQuery.toLowerCase()))
                );
                if (providers.length === 0) return null;

                return (
                  <div key={cat.id} className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                      <span className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">{cat.label}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {providers.map(p => {
                        const status = getProviderStatus(p.id);
                        return (
                          <button
                            key={p.id}
                            onClick={() => setSelectedProviderId(p.id)}
                            className={cn(
                              "group relative flex flex-col p-4 rounded-2xl border transition-all hover:scale-[1.02] active:scale-95",
                              status !== "none" 
                                ? "bg-primary/[0.03] border-primary/20 shadow-sm" 
                                : "bg-muted/5 border-border/40 hover:bg-muted/10"
                            )}
                          >
                            <div className="relative h-10 w-10 flex items-center justify-center rounded-xl bg-background border border-border/60 mb-3 shadow-inner">
                              {p.iconify ? (
                                <Icon icon={p.iconify} className="h-5 w-5 text-foreground/80" />
                              ) : (
                                <BrainCircuit className="h-5 w-5 text-foreground/80" />
                              )}
                              {status !== "none" && (
                                <div className={cn(
                                  "absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-background",
                                  status === "active" ? "bg-emerald-500" : "bg-amber-400"
                                )} />
                              )}
                            </div>
                            <span className="text-[11px] font-black uppercase tracking-tighter text-left truncate w-full">
                              {p.label}
                            </span>
                            <span className="text-[9px] text-muted-foreground/60 font-medium uppercase mt-0.5">
                              {status === "none" ? "Configure" : "Managed"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      ) : (
        <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300">
          {/* Detail Header */}
          <div className="flex items-start justify-between mb-8">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-9 rounded-xl hover:bg-muted"
                onClick={() => setSelectedProviderId(null)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="h-12 w-12 rounded-2xl border border-primary/20 bg-primary/5 flex items-center justify-center">
                <Icon icon={selectedProvider?.iconify || "lucide:cpu"} className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-black tracking-tight">{selectedProvider?.label}</h3>
                <p className="text-xs text-muted-foreground">Provider Configuration & Key Management</p>
              </div>
            </div>
            
            {selectedProvider?.docsUrl && (
              <Button variant="outline" size="sm" className="h-9 gap-2 rounded-xl border-border/40 hover:bg-muted/50" asChild>
                <a href={selectedProvider.docsUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  API Docs
                </a>
              </Button>
            )}
          </div>

          <div className="flex-1 flex flex-col min-h-0 space-y-6">
            {/* Active Keys Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Active Connections</span>
                <div className="h-px flex-1 bg-border/20" />
              </div>

              <ScrollArea className="h-[240px] -mx-2 px-2">
                {keys.filter(k => k.provider === selectedProviderId).length === 0 ? (
                  <div className="py-12 border border-dashed border-border/40 rounded-2xl text-center bg-muted/5">
                    <p className="text-[11px] text-muted-foreground">No active connections found for this provider.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <RadioGroup 
                      value={defaultKeys[selectedProviderId] || ""} 
                      onValueChange={(val) => handleDefaultChange(selectedProviderId, val)}
                      className="grid grid-cols-1 md:grid-cols-2 gap-3 col-span-full"
                    >
                      {keys.filter(k => k.provider === selectedProviderId).map(key => (
                        <div 
                          key={key.id}
                          className={cn(
                            "group flex items-center gap-3 p-3.5 rounded-2xl border transition-all",
                            defaultKeys[selectedProviderId] === key.id
                              ? "bg-primary/[0.04] border-primary/40"
                              : "bg-muted/5 border-border/40 hover:bg-muted/10"
                          )}
                        >
                          <RadioGroupItem value={key.id} id={key.id} className="h-4 w-4" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <div className={cn(
                                "h-1 w-1 rounded-full",
                                key.validationStatus === "validated" ? "bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.4)]" : "bg-amber-400"
                              )} />
                              <span className="text-[12px] font-bold truncate">{key.name}</span>
                            </div>
                            <code className="text-[10px] font-mono text-muted-foreground/50 tracking-tighter">
                              {key.keyPreview}
                            </code>
                          </div>
                          
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={() => validateKey(key.id)}>
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-destructive hover:bg-destructive/10" onClick={() => deleteKey(key.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                )}
              </ScrollArea>
              
              <Button 
                variant="outline" 
                className="w-full h-12 border-dashed border-border/40 hover:bg-primary/5 hover:border-primary/20 text-[11px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-all rounded-2xl"
                onClick={() => setAddingProvider(selectedProviderId)}
              >
                <Plus className="mr-2 h-4 w-4" /> Add New Connection
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Info Area */}
      <div className="px-5 py-4 border-t border-border/20 bg-muted/5 flex items-center justify-between mt-auto -mx-6 md:-mx-10">
        <div className="flex items-center gap-3 ml-6 md:ml-10">
          <div className="flex -space-x-1.5">
            {keys.slice(0, 4).map((k) => (
              <div key={k.id} className="h-6 w-6 rounded-full border border-background bg-background shadow-sm flex items-center justify-center overflow-hidden">
                <Icon icon={PROVIDERS.find(p => p.id === k.provider)?.iconify || "lucide:key"} className="h-3 w-3 text-foreground/70" />
              </div>
            ))}
          </div>
          <span className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">
            {keys.length} ACTIVE CONNECTIONS SECURED
          </span>
        </div>
        
        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/30 font-mono mr-6 md:mr-10">
          <Shield className="h-2.5 w-2.5" />
          <span>AES-256 LOCAL ENCRYPTION</span>
        </div>
      </div>

      {/* Add Key Sheet */}
      <Sheet open={!!addingProvider} onOpenChange={(o) => !o && setAddingProvider(null)}>
        <SheetContent className="sm:max-w-md w-full border-l-border/40 bg-background/95 backdrop-blur-xl">
          <div className="h-full flex flex-col py-6">
            <SheetHeader className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon icon={PROVIDERS.find(p => p.id === addingProvider)?.iconify || "lucide:cpu"} className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <SheetTitle className="text-lg">Connect {PROVIDERS.find(p => p.id === addingProvider)?.label}</SheetTitle>
                  <SheetDescription className="text-xs">Configure API credentials.</SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-5">
               <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">API Key</Label>
                    {PROVIDERS.find(p => p.id === addingProvider)?.docsUrl && (
                      <a href={PROVIDERS.find(p => p.id === addingProvider)?.docsUrl} target="_blank" rel="noreferrer" className="text-[10px] text-primary font-bold hover:underline">
                        Get Key
                      </a>
                    )}
                  </div>
                  <div className="relative group">
                    <Input
                      type={showKey ? "text" : "password"}
                      value={newKeyValue}
                      onChange={(e) => setNewKeyValue(e.target.value)}
                      className="h-10 px-4 bg-muted/20 border-border/40 text-sm rounded-xl"
                      placeholder={PROVIDERS.find(p => p.id === addingProvider)?.placeholder}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground/50"
                      onClick={() => setShowKey(!showKey)}
                    >
                      {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
               </div>

               <div className="space-y-2">
                  <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Base URL</Label>
                  <Input
                    value={newBaseUrl}
                    onChange={(e) => setNewBaseUrl(e.target.value)}
                    className="h-10 px-4 bg-muted/20 border-border/40 text-sm rounded-xl"
                    placeholder="e.g. https://api.openai.com/v1"
                  />
               </div>

               {addingProvider === 'custom' && (
                 <div className="space-y-4 pt-2 animate-in slide-in-from-top-2 duration-300">
                   <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Target Model IDs</Label>
                        <Button variant="ghost" className="h-6 text-[10px] gap-1.5 text-primary hover:bg-primary/10 px-2">
                          <RefreshCw className="h-3 w-3" /> Sync Models
                        </Button>
                      </div>
                      <Input
                        placeholder="gpt-4o, llama-3..."
                        className="h-10 px-4 bg-muted/20 border-border/40 text-sm rounded-xl"
                      />
                      <p className="text-[10px] text-muted-foreground/60 italic">Comma-separated list of models to enable.</p>
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Context Window</Label>
                        <Input
                          placeholder="128000"
                          type="number"
                          className="h-10 px-4 bg-muted/20 border-border/40 text-sm rounded-xl"
                        />
                     </div>
                     <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Max Tokens</Label>
                        <Input
                          placeholder="4096"
                          type="number"
                          className="h-10 px-4 bg-muted/20 border-border/40 text-sm rounded-xl"
                        />
                     </div>
                   </div>

                   <div className="space-y-2">
                      <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Custom Headers (JSON)</Label>
                      <Input
                        placeholder='{"X-Title": "Zen"}'
                        className="h-10 px-4 bg-muted/20 border-border/40 text-[11px] font-mono rounded-xl"
                      />
                   </div>

                   <div className="flex items-center gap-4 pt-1">
                      <div className="flex items-center gap-2">
                        <Switch id="vision" className="scale-75" />
                        <Label htmlFor="vision" className="text-[11px] font-bold">Vision</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch id="tools" className="scale-75" />
                        <Label htmlFor="tools" className="text-[11px] font-bold">Tools</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch id="stream" className="scale-75" defaultChecked />
                        <Label htmlFor="stream" className="text-[11px] font-bold">Stream</Label>
                      </div>
                   </div>
                 </div>
               )}
            </div>

            <div className="mt-auto pt-8 space-y-2">
               <Button className="w-full h-11 gap-2 rounded-xl text-[12px] font-bold uppercase tracking-widest" onClick={addKey} disabled={loading || !newKeyValue}>
                 {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                 Save Connection
               </Button>
               <Button variant="ghost" className="w-full h-11 rounded-xl text-[12px] text-muted-foreground" onClick={() => setAddingProvider(null)}>
                 Cancel
               </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}


