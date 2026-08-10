import { useEffect } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { ProviderUsagePanel } from './providers/ProviderUsagePanel';
import { providersApi } from '@/api/providersApi';
import { useState } from 'react';
import type { ProviderCatalogEntry } from '@/lib/types/provider';

/**
 * Full-screen usage surface. Values are intentionally local and factual:
 * provider billing/quota APIs can be added later without changing this UI
 * contract or pretending that local token history is provider billing data.
 */
export function UsageStatsSettings() {
  const [providerCatalog, setProviderCatalog] = useState<ProviderCatalogEntry[]>([]);
  const models = useSettingsStore((state) => state.availableModels);
  const fetchModels = useSettingsStore((state) => state.fetchModels);
  const activeProvider = useSettingsStore((state) => state.activeProvider);

  useEffect(() => {
    if (models.length === 0) void fetchModels();
  }, [fetchModels, models.length]);

  useEffect(() => {
    let cancelled = false;
    void providersApi.getCatalog().then((catalog) => {
      if (!cancelled) setProviderCatalog(catalog);
    }).catch(() => {
      // Catalog discovery is additive; local model data remains useful in dev mode.
    });
    return () => { cancelled = true; };
  }, []);

  const providerCount = providerCatalog.length > 0
    ? providerCatalog.filter((provider) => provider.configured).length
    : new Set(models.map((model) => model.provider).filter(Boolean)).size;
  const contextCount = models.filter((model) => model.contextWindow).length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <header className="flex flex-col gap-3 border-b border-border/60 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <WorkbenchIcon name="lucide:chart-no-axes-combined" size={17} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">Data and statistics</span>
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Usage stats</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Review completed model activity recorded locally by Zen. Provider billing and quota data are never inferred from this view.
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          Active provider<br />
          <span className="font-mono text-foreground">{activeProvider || 'Not selected'}</span>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Discovered models" value={String(models.length)} icon="lucide:box" />
        <SummaryCard label="Configured providers" value={String(providerCount)} icon="lucide:server-cog" />
        <SummaryCard label="Models with limits" value={String(contextCount)} icon="lucide:scan-line" />
      </div>

      <ProviderUsagePanel models={models} />
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/40 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <WorkbenchIcon name={icon} size={14} className="text-primary" />
        {label}
      </div>
      <div className="mt-3 font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

export default UsageStatsSettings;
