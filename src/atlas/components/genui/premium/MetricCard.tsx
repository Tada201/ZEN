import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export function MetricCard({ data }: { data: any }) {
  const label = data.label || data.title || "Metric";
  const value = data.value ?? data.count ?? data.total;
  const trend = data.trend || data.change;
  const trendUp = typeof trend === "number" ? trend > 0 : String(trend || "").includes("+");
  const trendDown = typeof trend === "number" ? trend < 0 : String(trend || "").includes("-");
  const subtitle = data.subtitle || data.description || "";

  return (
    <div className="genui-card-surface flex w-full max-w-none min-w-0 flex-wrap items-center justify-between gap-5 rounded-2xl border border-border bg-card p-5 shadow-lg">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-3xl font-black tracking-tighter tabular-nums text-primary-foreground">
          {value != null ? value : "—"}
        </p>
      </div>

      {(trend != null || subtitle) && (
        <div className="min-w-[10rem] text-right">
          {trend != null && (
            <div
              className={`flex items-center justify-end gap-1 text-xs font-medium ${
                trendUp
                  ? "text-emerald-400"
                  : trendDown
                    ? "text-rose-400"
                    : "text-muted-foreground"
              }`}
            >
              {trendUp ? (
                <TrendingUp size={14} />
              ) : trendDown ? (
                <TrendingDown size={14} />
              ) : (
                <Minus size={14} />
              )}
              <span>{typeof trend === "number" ? `${trend > 0 ? "+" : ""}${trend}%` : trend}</span>
            </div>
          )}
          {subtitle && (
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
