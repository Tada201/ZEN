import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { DemoCard } from "../Section";

const SPARK_RANGES = ["7D", "30D", "90D"] as const;
type SparkRange = (typeof SPARK_RANGES)[number];

const SPARK_DATA: Record<string, Record<SparkRange, number[]>> = {
  Revenue: {
    "7D": [30, 45, 35, 50, 48, 60, 55],
    "30D": [20, 30, 28, 35, 40, 38, 50, 45, 55, 60, 58, 65, 62, 70, 68, 72, 75, 73, 80, 78, 82, 85, 83, 88, 87, 90, 88, 92, 95, 98],
    "90D": Array.from({ length: 90 }, (_, i) => Math.round(20 + i * 0.8 + Math.sin(i / 5) * 5)),
  },
  Users: {
    "7D": [20, 25, 40, 35, 45, 42, 50],
    "30D": Array.from({ length: 30 }, (_, i) => Math.round(15 + i * 0.7 + Math.cos(i / 4) * 4)),
    "90D": Array.from({ length: 90 }, (_, i) => Math.round(10 + i * 0.5 + Math.sin(i / 7) * 6)),
  },
  Churn: {
    "7D": [5, 8, 6, 4, 3, 5, 4],
    "30D": Array.from({ length: 30 }, (_, i) => Math.round(8 - i * 0.1 + Math.sin(i / 3) * 1.5)),
    "90D": Array.from({ length: 90 }, (_, i) => Math.round(9 - i * 0.04 + Math.cos(i / 8) * 1)),
  },
};

const STAT_META = [
  { label: "Revenue", color: "hsl(var(--primary))", format: (v: number) => `$${v}` },
  { label: "Users", color: "hsl(var(--success))", format: (v: number) => `${v}` },
  { label: "Churn", color: "hsl(var(--destructive))", format: (v: number) => `${v}%` },
];

function SparkCard({ label, color, format, range }: { label: string; color: string; format: (v: number) => string; range: SparkRange }) {
  const [jitter, setJitter] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setJitter(prev => prev + (Math.random() - 0.5) * 2);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const baseData = SPARK_DATA[label][range];
  const data = useMemo(() => {
    return baseData.map((v, i) => i === baseData.length - 1 ? v + jitter : v);
  }, [baseData, jitter]);

  const latest = data[data.length - 1];
  const prev = data[data.length - 2];
  const delta = latest - prev;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 120},${30 - (v / Math.max(...data)) * 28}`).join(" ");

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm hover:shadow-md transition-shadow duration-300">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`flex items-center gap-0.5 text-[10px] font-semibold transition-colors duration-500 ${delta >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
          {delta >= 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
          {Math.abs(delta).toFixed(1)}
        </div>
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums tracking-tight">{format(Math.round(latest))}</div>
      <svg viewBox="0 0 120 30" className="mt-2 h-8 w-full overflow-visible">
        <defs>
          <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={pts}
          className="transition-all duration-1000 ease-in-out"
        />
      </svg>
    </div>
  );
}

export function DataDisplaySparklines() {
  const [sparkRange, setSparkRange] = useState<SparkRange>("7D");

  return (
    <DemoCard
      label="Stat + sparkline"
      selection={{
        id: "dd-spark", name: "Stat with Sparkline", category: "Data Display",
        variants: ["7D", "30D", "90D"],
        jsx: `<SparkCard label="Revenue" range={range} />`,
      }}
      className="md:col-span-2 xl:col-span-1"
    >
      <div onClick={(e) => e.stopPropagation()} className="space-y-3">
        <div className="flex items-center justify-end gap-1">
          {SPARK_RANGES.map((range) => (
            <button
              key={range}
              onClick={() => setSparkRange(range)}
              className={`press rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${sparkRange === range ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              {range}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {STAT_META.map((meta) => (
            <SparkCard key={meta.label} label={meta.label} color={meta.color} format={meta.format} range={sparkRange} />
          ))}
        </div>
      </div>
    </DemoCard>
  );
}
