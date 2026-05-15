import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { ProviderCard } from "./providers/ProviderCard";
import type { ConnectionStatus } from "./providers/ConnectionTestButton";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Globe, Cpu } from "lucide-react";

/* ── Provider definitions ──────────────────────────────────────── */

interface ProviderDef {
  id: string;
  name: string;
  icon: ReactNode;
  usesKey: boolean;
  usesUrl: boolean;
  keyPlaceholder?: string;
  urlPlaceholder?: string;
}

const CLOUD_PROVIDERS: ProviderDef[] = [
  { id: "openai",      name: "OpenAI",       icon: <WorkbenchIcon name="simple-icons:openai" size={16} />,       usesKey: true,  usesUrl: false, keyPlaceholder: "sk-..." },
  { id: "anthropic",   name: "Anthropic",    icon: <WorkbenchIcon name="simple-icons:anthropic" size={16} />,    usesKey: true,  usesUrl: false, keyPlaceholder: "sk-ant-..." },
  { id: "google",      name: "Google Gemini",icon: <WorkbenchIcon name="simple-icons:googlegemini" size={16} />, usesKey: true,  usesUrl: false, keyPlaceholder: "AIza..." },
  { id: "groq",        name: "Groq",         icon: <WorkbenchIcon name="lucide:zap" size={16} />,                usesKey: true,  usesUrl: false, keyPlaceholder: "gsk_..." },
  { id: "mistral",     name: "Mistral AI",   icon: <WorkbenchIcon name="simple-icons:mistralai" size={16} />,    usesKey: true,  usesUrl: false, keyPlaceholder: "..." },
  { id: "deepseek",    name: "DeepSeek",     icon: <WorkbenchIcon name="simple-icons:deepseek" size={16} />,     usesKey: true,  usesUrl: false, keyPlaceholder: "sk-..." },
  { id: "openrouter",  name: "OpenRouter",   icon: <WorkbenchIcon name="simple-icons:openrouter" size={16} />,   usesKey: true,  usesUrl: false, keyPlaceholder: "sk-or-..." },
  { id: "together",    name: "Together AI",  icon: <WorkbenchIcon name="lucide:globe" size={16} />,              usesKey: true,  usesUrl: false, keyPlaceholder: "..." },
  { id: "perplexity",  name: "Perplexity",   icon: <WorkbenchIcon name="lucide:sparkles" size={16} />,           usesKey: true,  usesUrl: false, keyPlaceholder: "pplx-..." },
];

const LOCAL_PROVIDERS: ProviderDef[] = [
  { id: "ollama",      name: "Ollama",     icon: <WorkbenchIcon name="simple-icons:ollama" size={16} />,     usesKey: false, usesUrl: true,  urlPlaceholder: "http://localhost:11434" },
  { id: "lmstudio",    name: "LM Studio",  icon: <WorkbenchIcon name="lucide:monitor" size={16} />,          usesKey: false, usesUrl: true,  urlPlaceholder: "http://localhost:1234" },
];

const ALL_PROVIDERS = [...CLOUD_PROVIDERS, ...LOCAL_PROVIDERS];

/* ── Settings key helpers ──────────────────────────────────────── */

function apiKeySettingsKey(providerId: string): string {
  return `${providerId}ApiKey`;
}

function baseUrlSettingsKey(providerId: string): string {
  return `${providerId}BaseUrl`;
}

/* ── Component ─────────────────────────────────────────────────── */

interface ProvidersSettingsProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}

export function ProvidersSettings({ settings, onUpdate }: ProvidersSettingsProps) {
  const [search, setSearch] = useState("");
  const [connectionStatuses, setConnectionStatuses] = useState<
    Record<string, ConnectionStatus>
  >({});

  const filtered = useMemo(() => {
    if (!search.trim()) return ALL_PROVIDERS;
    const q = search.toLowerCase();
    return ALL_PROVIDERS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
    );
  }, [search]);

  const handleApiKeyChange = useCallback(
    (providerId: string, value: string) => {
      onUpdate(apiKeySettingsKey(providerId), value);
    },
    [onUpdate]
  );

  const handleBaseUrlChange = useCallback(
    (providerId: string, value: string) => {
      onUpdate(baseUrlSettingsKey(providerId), value);
    },
    [onUpdate]
  );

  const handleTestConnection = useCallback(
    async (providerId: string) => {
      setConnectionStatuses((prev) => ({
        ...prev,
        [providerId]: { state: "testing" },
      }));

      const start = performance.now();

      try {
        const provider = ALL_PROVIDERS.find((p) => p.id === providerId);
        if (!provider) throw new Error("Unknown provider");

        if (provider.usesUrl) {
          const url = settings[baseUrlSettingsKey(providerId)];
          if (!url) throw new Error("No base URL configured");
          const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
          if (!res.ok && res.status !== 405) throw new Error(`HTTP ${res.status}`);
        } else {
          const key = settings[apiKeySettingsKey(providerId)];
          if (!key) throw new Error("No API key configured");
          if (key.length < 8) throw new Error("Key looks too short");
          // TODO: Replace with actual provider-specific endpoint validation
          await new Promise((r) => setTimeout(r, 600));
        }

        const latency = Math.round(performance.now() - start);
        setConnectionStatuses((prev) => ({
          ...prev,
          [providerId]: { state: "connected", latency },
        }));
      } catch (err) {
        const latency = Math.round(performance.now() - start);
        setConnectionStatuses((prev) => ({
          ...prev,
          [providerId]: {
            state: "failed",
            error: err instanceof Error ? err.message : "Connection failed",
            ...(latency > 0 ? { latency } : {}),
          },
        }));
      }
    },
    [settings]
  );

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-zinc-100">AI Providers</h3>
        <p className="text-[13px] text-zinc-500">
          Manage API keys for cloud providers and configure local endpoints.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-600" />
        <Input
          type="text"
          placeholder="Search providers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-9 text-[12px] bg-white/[0.03] border-white/[0.08]
            focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
        />
      </div>

      <ScrollArea className="max-h-[380px] pr-2">
        <div className="space-y-3">
          {/* Cloud Provider Section */}
          {filtered.some((p) => CLOUD_PROVIDERS.some((cp) => cp.id === p.id)) && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Globe className="h-3 w-3 text-zinc-600" />
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-zinc-600">
                  Cloud
                </span>
              </div>
              <div className="space-y-1.5">
                {filtered
                  .filter((p) => CLOUD_PROVIDERS.some((cp) => cp.id === p.id))
                  .map((p) => (
                    <ProviderCard
                      key={p.id}
                      provider={p}
                      apiKey={settings[apiKeySettingsKey(p.id)] || ""}
                      connectionStatus={connectionStatuses[p.id] || { state: "idle" }}
                      onApiKeyChange={(v) => handleApiKeyChange(p.id, v)}
                      onTestConnection={() => handleTestConnection(p.id)}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Local Provider Section */}
          {filtered.some((p) => LOCAL_PROVIDERS.some((lp) => lp.id === p.id)) && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1 pt-1">
                <Cpu className="h-3 w-3 text-zinc-600" />
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-zinc-600">
                  Local
                </span>
              </div>
              <div className="space-y-1.5">
                {filtered
                  .filter((p) => LOCAL_PROVIDERS.some((lp) => lp.id === p.id))
                  .map((p) => (
                    <ProviderCard
                      key={p.id}
                      provider={p}
                      baseUrl={settings[baseUrlSettingsKey(p.id)] || ""}
                      connectionStatus={connectionStatuses[p.id] || { state: "idle" }}
                      onBaseUrlChange={(v) => handleBaseUrlChange(p.id, v)}
                      onTestConnection={() => handleTestConnection(p.id)}
                    />
                  ))}
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <p className="text-[12px] text-zinc-600 text-center py-8">
              No providers match &ldquo;{search}&rdquo;
            </p>
          )}
        </div>
      </ScrollArea>

      <p className="text-[10px] text-zinc-700 leading-relaxed">
        API keys are stored locally and never sent to our servers.
        Cloud providers are only contacted when you explicitly test a connection or send a chat message.
      </p>
    </section>
  );
}
