import { Panel, asRecord, num } from "./primitives";
import type { RendererContext } from "./registry";

// Output: { expression, result, data_stats? } | { count, sum, mean, median, ... } (stats mode)
const STAT_KEYS: Array<[string, string]> = [
  ["mean", "Mean"],
  ["median", "Median"],
  ["stddev", "Std dev"],
  ["min", "Min"],
  ["max", "Max"],
  ["sum", "Sum"],
];

function StatGrid({ stats }: { stats: Record<string, unknown> }) {
  const cells = STAT_KEYS.map(([key, label]) => {
    const value = num(stats[key]);
    return value === undefined ? null : { label, value };
  }).filter((cell): cell is { label: string; value: number } => cell !== null);

  if (cells.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {cells.map((cell) => (
        <div key={cell.label} className="rounded-md border border-border/50 bg-background/20 px-2 py-1">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{cell.label}</div>
          <div className="font-mono text-[12px] tabular-nums text-foreground">
            {Number.isInteger(cell.value) ? cell.value : cell.value.toFixed(4).replace(/\.?0+$/, "")}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CalculatorCard({ output }: RendererContext) {
  const record = asRecord(output);
  const expression = typeof record.expression === "string" ? record.expression : undefined;
  const result = record.result;
  // Stats mode returns the stats object at the top level; expression mode nests it under data_stats.
  const stats = asRecord(record.data_stats);
  const topLevelStats = record.mean !== undefined || record.median !== undefined ? record : {};

  if (expression === undefined && result === undefined && Object.keys(topLevelStats).length === 0) {
    return null;
  }

  return (
    <Panel label="Calculation">
      <div className="flex flex-col gap-2">
        {expression !== undefined && (
          <div className="font-mono text-[13px] leading-relaxed text-foreground">
            <span className="text-muted-foreground">{expression}</span>
            {result !== undefined && <span className="text-foreground"> = {String(result)}</span>}
          </div>
        )}
        {expression === undefined && result !== undefined && (
          <div className="font-mono text-[13px] text-foreground">{String(result)}</div>
        )}
        {Object.keys(stats).length > 0 && <StatGrid stats={stats} />}
        {Object.keys(topLevelStats).length > 0 && <StatGrid stats={topLevelStats} />}
      </div>
    </Panel>
  );
}
