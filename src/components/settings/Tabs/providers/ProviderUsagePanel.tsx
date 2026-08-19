import { useCallback, useEffect, useMemo, useState } from 'react';
import { providersApi, type ProviderUsageSnapshot } from '@/api/providersApi';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import type { ModelInfo } from '@/lib/types/provider';

const EMPTY_USAGE: ProviderUsageSnapshot = {
  totalRequests: 0,
  totalTokensIn: 0,
  totalTokensOut: 0,
  models: [],
  history: [],
  daily: [],
};

const PERIODS = [
  { label: '24H', days: 1 },
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
];

function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString();
}

interface ProviderUsagePanelProps {
  models: ModelInfo[];
}

export function ProviderUsagePanel({ models }: ProviderUsagePanelProps) {
  const [snapshot, setSnapshot] = useState<ProviderUsageSnapshot>(EMPTY_USAGE);
  const [periodDays, setPeriodDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modelIds = useMemo(() => models.map((model) => model.id).filter(Boolean), [models]);

  const refresh = useCallback(async () => {
    if (modelIds.length === 0) {
      setSnapshot(EMPTY_USAGE);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setSnapshot(await providersApi.getUsage(modelIds, periodDays));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Usage history could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [modelIds, periodDays]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="border-t border-border pt-6" aria-label="Model usage">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Usage on this device</h4>
          <p className="mt-1 text-xs text-muted-foreground">Completed responses recorded locally for these model identifiers.</p>
        </div>
        <WorkbenchButton
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => { void refresh(); }}
          disabled={loading}
          title="Refresh local usage"
        >
          <WorkbenchIcon name="lucide:refresh-cw" size={14} className={loading ? 'animate-spin' : ''} />
        </WorkbenchButton>
      </div>

      <div className="mt-4 grid grid-cols-3 divide-x divide-border border-y border-border bg-background">
        <Metric label="Responses" value={formatCount(snapshot.totalRequests)} />
        <Metric label="Input Tokens" value={formatCount(snapshot.totalTokensIn)} />
        <Metric label="Output Tokens" value={formatCount(snapshot.totalTokensOut)} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Usage trend</div>
        <div className="flex rounded-lg border border-border p-0.5" aria-label="Usage time range">
          {PERIODS.map((period) => (
            <button
              key={period.days}
              type="button"
              onClick={() => setPeriodDays(period.days)}
              className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${period.days === periodDays ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              aria-pressed={period.days === periodDays}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      <UsageTrend daily={snapshot.daily} />

      {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}

      {snapshot.models.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead className="border-b border-border text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">Model</th>
                <th className="py-2 text-right font-medium">Responses</th>
                <th className="py-2 text-right font-medium">Input</th>
                <th className="py-2 text-right font-medium">Output</th>
                <th className="py-2 pl-4 text-right font-medium">Last used</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.models.map((model) => (
                <tr key={model.model} className="border-b border-border last:border-0">
                  <td className="max-w-[180px] truncate py-2.5 font-mono text-foreground" title={model.model}>{model.model}</td>
                  <td className="py-2.5 text-right text-muted-foreground">{formatCount(model.requests)}</td>
                  <td className="py-2.5 text-right text-muted-foreground">{formatCount(model.tokensIn)}</td>
                  <td className="py-2.5 text-right text-muted-foreground">{formatCount(model.tokensOut)}</td>
                  <td className="py-2.5 pl-4 text-right text-muted-foreground">{formatDate(model.lastUsedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">No completed local usage has been recorded for these models yet.</p>
      )}

      {snapshot.history.length > 0 ? (
        <div className="mt-5 border-t border-border pt-4">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Recent completed responses</div>
          <div className="space-y-1">
            {snapshot.history.slice(0, 8).map((entry) => (
              <div key={entry.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 py-1.5 text-xs">
                <span className="truncate font-mono text-muted-foreground" title={entry.model}>{entry.model}</span>
                <span className="text-muted-foreground">{formatCount(entry.tokensIn)} in</span>
                <span className="text-muted-foreground" title={formatDate(entry.createdAt)}>{formatDate(entry.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function UsageTrend({ daily }: { daily: ProviderUsageSnapshot['daily'] }) {
  const peak = Math.max(1, ...daily.map((item) => item.tokensIn + item.tokensOut));

  if (daily.length === 0) {
    return <p className="mt-3 text-xs text-muted-foreground">No completed responses in this period.</p>;
  }

  return (
    <div className="mt-3 flex h-24 items-end gap-1 border-b border-border pb-1" aria-label="Daily token usage chart">
      {daily.map((item) => {
        const tokens = item.tokensIn + item.tokensOut;
        const height = Math.max(6, Math.round((tokens / peak) * 88));
        return (
          <div key={item.day} className="group relative flex min-w-0 flex-1 items-end" title={`${item.day}: ${formatCount(tokens)} tokens across ${item.requests} responses`}>
            <div className="w-full rounded-t-sm bg-blue-400/55 transition-colors group-hover:bg-blue-300" style={{ height: `${height}px` }} />
          </div>
        );
      })}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-3 first:pl-0 last:pr-0">
      <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
