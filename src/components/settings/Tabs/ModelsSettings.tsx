import { useState, useMemo, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { WorkbenchInput } from "../ui/WorkbenchInput";
import { WorkbenchButton } from "@/components/ui/WorkbenchButton";
import { WorkbenchSelect } from "../ui/WorkbenchSelect";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";

/* ── Types ─────────────────────────────────────────────────────── */

interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
}

const PROVIDER_COLORS: Record<string, string> = {
  openai:     "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  anthropic:  "bg-orange-500/10 text-orange-500 border-orange-500/20",
  google:     "bg-blue-500/10 text-blue-500 border-blue-500/20",
  groq:       "bg-orange-400/10 text-orange-400 border-orange-400/20",
  mistral:    "bg-orange-600/10 text-orange-600 border-orange-600/20",
  deepseek:   "bg-blue-600/10 text-blue-600 border-blue-600/20",
  openrouter: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  together:   "bg-blue-400/10 text-blue-400 border-blue-400/20",
  perplexity: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  ollama:     "bg-slate-400/10 text-slate-400 border-slate-400/20",
  lmstudio:   "bg-slate-600/10 text-slate-600 border-slate-600/20",
};

/* ── Provider Icon ─────────────────────────────────────────────── */

function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
  if (["ollama", "lmstudio"].includes(provider)) {
    return <WorkbenchIcon name="lucide:cpu" className={className} size={16} />;
  }
  return <WorkbenchIcon name="lucide:globe" className={className} size={16} />;
}

/* ── Props ─────────────────────────────────────────────────────── */

interface ModelsSettingsProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}

/* ── Component ─────────────────────────────────────────────────── */

export function ModelsSettings({ settings, onUpdate }: ModelsSettingsProps) {
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [syncing, setSyncing] = useState(false);

  // Access zustand store for model discovery
  const storeAvailableModels = useSettingsStore((s) => s.availableModels);
  const storeFetchModels = useSettingsStore((s) => s.fetchModels);

  const activeProvider = settings["activeProvider"] || "";
  const activeModel = settings["activeModel"] || "";

  /* ── Model sync ───────────────────────────────────────────── */
  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await storeFetchModels();
    } catch (err) {
      console.error("Failed to sync models:", err);
    } finally {
      setSyncing(false);
    }
  }, [storeFetchModels]);

  const modelsLoading = useSettingsStore((s) => s.fetchingModels);

  // Auto-sync on first mount
  useEffect(() => {
    if (storeAvailableModels.length === 0 && !modelsLoading && !syncing) {
      handleSync();
    }
  }, [storeAvailableModels.length, modelsLoading, syncing, handleSync]);

  /* ── Derived data ─────────────────────────────────────────── */
  const providers = useMemo(() => {
    const p = new Set(storeAvailableModels.map((m) => m.provider).filter(Boolean));
    return ["all", ...Array.from(p).sort()] as string[];
  }, [storeAvailableModels]);

  const providerOptions = useMemo(() => {
    return providers.map((p) => ({
      value: p,
      label: p === "all" ? "All Providers" : p.charAt(0).toUpperCase() + p.slice(1),
    }));
  }, [providers]);

  const filteredModels = useMemo(() => {
    return storeAvailableModels.filter((m) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        (m.provider || "").toLowerCase().includes(q);
      const matchesProvider = providerFilter === "all" || (m.provider || "unknown") === providerFilter;
      return matchesSearch && matchesProvider;
    });
  }, [storeAvailableModels, search, providerFilter]);

  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelEntry[]> = {};
    for (const m of filteredModels) {
      const p = m.provider || "unknown";
      if (!groups[p]) groups[p] = [];
      groups[p].push({
        id: m.id,
        name: m.name,
        provider: p,
        contextWindow: m.contextWindow
      });
    }
    return groups;
  }, [filteredModels]);

  /* ── Selection ────────────────────────────────────────────── */
  const handleSelect = useCallback(
    (modelId: string, provider: string) => {
      onUpdate("activeProvider", provider);
      onUpdate("activeModel", modelId);
    },
    [onUpdate]
  );

  const isSelected = useCallback(
    (modelId: string, provider?: string) =>
      activeModel === modelId && activeProvider === (provider || ""),
    [activeModel, activeProvider]
  );

  /* ── Render ───────────────────────────────────────────────── */
  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="space-y-0.5">
        <h3 className="text-base font-bold tracking-tight text-foreground">AI Models</h3>
        <p className="text-[11px] text-muted-foreground/60 font-medium">
          Select the active intelligence for chat sessions.
        </p>
      </div>

      {/* Toolbar: Search + Filter + Sync */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <WorkbenchInput
            placeholder="Search models..."
            value={search}
            onChangeText={setSearch}
            icon="lucide:search"
            className="h-8 text-[12px] bg-white/[0.03] border-white/[0.08]"
          />
        </div>
        <WorkbenchSelect
          value={providerFilter}
          onValueChange={setProviderFilter}
          width={140}
          options={providerOptions}
          className="h-8 text-[11px] bg-white/[0.03] border-white/[0.08]"
        />
        <WorkbenchButton
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06]"
          onClick={handleSync}
          disabled={syncing}
          title="Sync models from providers"
        >
          <WorkbenchIcon name="lucide:refresh-cw" className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
        </WorkbenchButton>
      </div>

      {/* Model list */}
      <ScrollArea className="max-h-[300px] -mx-1 px-1">
        {Object.keys(groupedModels).length === 0 ? (
          <div className="py-10 text-center border border-dashed border-border/40 rounded-lg bg-muted/20">
            <WorkbenchIcon name="lucide:brain" className="h-5 w-5 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-[11px] text-muted-foreground/50">
              {syncing
                ? "Synchronizing handshake..."
                : storeAvailableModels.length === 0
                ? "No models found. Add API keys then sync."
                : "No matching models."}
            </p>
            {storeAvailableModels.length === 0 && !syncing && (
              <WorkbenchButton
                variant="ghost"
                size="sm"
                className="mt-2 h-7 text-[10px] text-primary hover:text-primary/80"
                onClick={handleSync}
              >
                <WorkbenchIcon name="lucide:refresh-cw" className="h-3 w-3 mr-1" />
                Sync Catalog
              </WorkbenchButton>
            )}
          </div>
        ) : (
          <div className="space-y-3 pb-2">
            {Object.entries(groupedModels).map(([provider, models]) => (
              <div key={provider}>
                <div className="flex items-center gap-2 px-1 mb-1.5">
                  <ProviderIcon provider={provider} className="text-zinc-600" />
                  <span className="text-[9px] font-black uppercase tracking-[0.15em] text-zinc-600">
                    {provider}
                  </span>
                  <Badge
                    variant="outline"
                    className="h-4 px-1.5 text-[8px] font-bold text-zinc-600 border-white/[0.06]"
                  >
                    {models.length}
                  </Badge>
                </div>
                <div className="space-y-1">
                  {models.map((model) => (
                    <button
                      key={`${model.provider || "unknown"}-${model.id}`}
                      onClick={() => handleSelect(model.id, model.provider || "unknown")}
                      className={cn(
                        "group relative flex items-center gap-2.5 p-2 rounded-lg border transition-all text-left w-full",
                        isSelected(model.id, model.provider)
                           ? "bg-primary/[0.03] border-primary/30"
                          : "border-border/40 bg-muted/10 hover:bg-muted/30"
                      )}
                    >
                      <div
                        className={cn(
                          "shrink-0 h-7 w-7 rounded-md flex items-center justify-center border",
                          isSelected(model.id, model.provider)
                            ? "bg-primary/10 border-primary/20 text-primary"
                            : "border-border/40 bg-muted/20 text-muted-foreground/60"
                        )}
                      >
                        <WorkbenchIcon name="lucide:brain" className="h-3.5 w-3.5" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[12.5px] text-foreground truncate">
                            {model.name}
                          </span>
                          <span
                            className={cn(
                              "text-[8px] px-1.5 py-0.5 rounded border uppercase tracking-widest font-black",
                              PROVIDER_COLORS[model.provider || "unknown"] ||
                                "bg-muted text-muted-foreground border-border"
                            )}
                          >
                            {model.provider}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {model.contextWindow && (
                            <span className="text-[10px] text-zinc-600">
                              {model.contextWindow >= 1_000_000
                                ? `${(model.contextWindow / 1_000_000).toFixed(1)}M`
                                : `${Math.round(model.contextWindow / 1000)}K`}{" "}
                              context
                            </span>
                          )}
                          <span className="text-[10px] text-zinc-600">
                            {model.id}
                          </span>
                        </div>
                      </div>

                      {isSelected(model.id, model.provider) && (
                        <WorkbenchIcon name="lucide:check" className="h-3.5 w-3.5 text-primary mr-1 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <p className="text-[10px] text-zinc-700 leading-relaxed">
        Models are discovered from configured providers. Add API keys in the{" "}
        <span className="text-zinc-500 font-medium">Providers</span> tab, then sync
        to populate this list.
      </p>
    </section>
  );
}
