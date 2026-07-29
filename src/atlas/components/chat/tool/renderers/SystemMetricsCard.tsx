import { Panel, asRecord, num } from "./primitives";
import type { RendererContext } from "./registry";

// Output: { cpu_load, mem_used, mem_total, net_up, net_down }
function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function Bar({ label, percent, detail }: { label: string; percent: number; detail: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const hot = clamped >= 85;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className="text-[11px] tabular-nums text-foreground">{detail}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted/40">
        <div
          className={hot ? "h-full rounded-full bg-destructive/70" : "h-full rounded-full bg-primary/70"}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export function SystemMetricsCard({ output }: RendererContext) {
  const record = asRecord(output);
  const cpu = num(record.cpu_load);
  const memUsed = num(record.mem_used);
  const memTotal = num(record.mem_total);
  const netUp = num(record.net_up);
  const netDown = num(record.net_down);
  if (cpu === undefined && memUsed === undefined && netUp === undefined) return null;

  const memPercent = memUsed !== undefined && memTotal ? (memUsed / memTotal) * 100 : undefined;

  return (
    <Panel label="System metrics">
      <div className="flex flex-col gap-2.5">
        {cpu !== undefined && <Bar label="CPU" percent={cpu} detail={`${cpu.toFixed(0)}%`} />}
        {memPercent !== undefined && (
          <Bar
            label="Memory"
            percent={memPercent}
            detail={`${formatBytes(memUsed!)} / ${formatBytes(memTotal!)}`}
          />
        )}
        {(netUp !== undefined || netDown !== undefined) && (
          <div className="flex items-center gap-4 text-[11px] tabular-nums text-muted-foreground">
            {netUp !== undefined && <span>↑ {formatBytes(netUp)}/s</span>}
            {netDown !== undefined && <span>↓ {formatBytes(netDown)}/s</span>}
          </div>
        )}
      </div>
    </Panel>
  );
}
