import { useCallback, useEffect, useMemo, useState } from "react";
import { dependenciesApi, type DependencyStatus } from "@/api";
import { Button } from "@/components/ui/button";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { cn } from "@/lib/utils";

type LogLevel = "info" | "ok" | "warn" | "error";

interface InstallLog {
  id: string;
  level: LogLevel;
  message: string;
}

const levelClass: Record<LogLevel, string> = {
  info: "text-zinc-300",
  ok: "text-emerald-300",
  warn: "text-amber-300",
  error: "text-red-300",
};

export function DependenciesSettings() {
  const [items, setItems] = useState<DependencyStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<InstallLog[]>([]);

  const missing = useMemo(() => items.filter((item) => !item.installed), [items]);
  const installedCount = items.length - missing.length;

  const appendLog = useCallback((level: LogLevel, message: string) => {
    setLogs((current) => [
      ...current,
      { id: `${Date.now()}-${current.length}`, level, message },
    ].slice(-80));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    appendLog("info", "Checking dependency status...");
    try {
      const result = await dependenciesApi.listStatus();
      setItems(result);
      appendLog("ok", `Dependency scan complete. ${result.filter((item) => item.installed).length}/${result.length} ready.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendLog("error", `Dependency scan failed: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [appendLog]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDownload = useCallback(async (item: DependencyStatus) => {
    appendLog("info", `Preparing ${item.name}.`);
    if (item.managed) {
      try {
        const result = await dependenciesApi.installManaged(item.id);
        appendLog("ok", `${item.name}: ${result.message}`);
        await refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendLog("error", `${item.name} installation failed: ${message}`);
      }
      return;
    }
    if (item.installCommand) {
      appendLog("warn", `Run manually: ${item.installCommand}`);
    }
    if (item.downloadUrl) {
      appendLog("info", `Opening ${item.downloadUrl}`);
      try {
        await dependenciesApi.openSource(item.downloadUrl);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendLog("error", `Could not open source: ${message}`);
      }
    }
    if (!item.installCommand && !item.downloadUrl) {
      appendLog("warn", `${item.name} has no automatic download source configured.`);
    }
  }, [appendLog, refresh]);

  const handleDownloadAll = useCallback(() => {
    if (missing.length === 0) {
      appendLog("ok", "All tracked dependencies are ready.");
      return;
    }
    appendLog("info", `Preparing ${missing.length} missing dependencies.`);
    void Promise.all(missing.map(handleDownload));
  }, [appendLog, handleDownload, missing]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-bold tracking-tight text-foreground">Dependencies</h3>
          <p className="max-w-2xl text-[13px] text-muted-foreground">
            Check optional runtimes used by RAG, local voice, OCR, embeddings, and local model providers.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            <WorkbenchIcon name={loading ? "lucide:loader-2" : "lucide:refresh-cw"} size={13} className={cn("mr-1.5", loading && "animate-spin")} />
            Rescan
          </Button>
          <Button size="sm" onClick={handleDownloadAll} disabled={loading || missing.length === 0}>
            <WorkbenchIcon name="lucide:download" size={13} className="mr-1.5" />
            Download all
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Ready" value={installedCount} tone="ok" />
        <SummaryCard label="Missing" value={missing.length} tone={missing.length ? "warn" : "ok"} />
        <SummaryCard label="Tracked" value={items.length} tone="info" />
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <DependencyRow key={item.id} item={item} onDownload={() => void handleDownload(item)} />
        ))}
      </div>

      <div className="rounded-xl border border-border/70 bg-black/40">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <WorkbenchIcon name="lucide:terminal-square" size={15} className="text-primary" />
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-foreground">Install Console</span>
          </div>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setLogs([])}>
            Clear
          </Button>
        </div>
        <div className="h-44 overflow-auto px-4 py-3 font-mono text-[11px] leading-5">
          {logs.length === 0 ? (
            <div className="text-muted-foreground">No dependency actions yet.</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className={levelClass[log.level]}>
                <span className="text-zinc-600">[{log.level.toUpperCase()}]</span> {log.message}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" | "info" }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/40 p-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className={cn("mt-2 text-2xl font-bold", tone === "ok" && "text-emerald-300", tone === "warn" && "text-amber-300", tone === "info" && "text-foreground")}>{value}</div>
    </div>
  );
}

function DependencyRow({ item, onDownload }: { item: DependencyStatus; onDownload: () => void }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/35 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{item.name}</span>
            <span className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]",
              item.installed
                ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                : "border-amber-400/25 bg-amber-400/10 text-amber-300"
            )}>
              {item.status}
            </span>
            {item.required && <span className="rounded-full border border-red-400/25 bg-red-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-red-300">Required</span>}
          </div>
          <div className="text-sm text-zinc-300">{item.feature}</div>
          <div className="text-xs text-muted-foreground">{item.notes}</div>
          {(item.version || item.detectedPath || item.installCommand) && (
            <div className="space-y-1 rounded-lg border border-white/[0.06] bg-black/25 p-2 font-mono text-[11px] text-zinc-400">
              {item.version && <div>version: {item.version}</div>}
              {item.detectedPath && <div>path: {item.detectedPath}</div>}
              {item.installCommand && <div>install: {item.installCommand}</div>}
            </div>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onDownload} disabled={item.installed && !item.downloadUrl && !item.installCommand}>
          <WorkbenchIcon name={item.installed ? "lucide:external-link" : "lucide:download"} size={13} className="mr-1.5" />
          {item.managed ? (item.installed ? "Repair" : "Install") : (item.installed ? "Source" : "Get")}
        </Button>
      </div>
    </div>
  );
}

export default DependenciesSettings;
