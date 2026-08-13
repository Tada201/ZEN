import { ArrowRight, RefreshCw, TrendingUp } from "lucide-react";

interface CurrencyData {
  from: string;
  to: string;
  amount: number;
  result: number;
  rate: number | string;
  updatedAt?: string;
}

export function CurrencyCard({ data }: { data: CurrencyData }) {
  const from = data.from || "USD";
  const to = data.to || "EUR";
  const amount = data.amount ?? 1;
  const result = data.result ?? 0;
  const rate = data.rate ?? 0;
  const updatedAt = data.updatedAt;

  return (
    <div className="genui-card-surface w-full max-w-none min-w-0 rounded-2xl border border-border bg-card p-5 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-mono tracking-wider text-muted-foreground uppercase">Currency Converter</span>
        <TrendingUp className="w-4 h-4 text-emerald-400" />
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{from}</div>
          <div className="text-xl font-bold text-primary-foreground truncate tabular-nums">
            {amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="flex items-center justify-center w-8 h-8 rounded-full border border-border bg-muted shrink-0 text-primary-foreground">
          <ArrowRight className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0 text-right">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{to}</div>
          <div className="text-xl font-bold text-primary truncate tabular-nums">
            {result.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 pt-3.5 border-t border-border text-[10px] text-muted-foreground font-mono">
        <div className="flex justify-between">
          <span>Exchange Rate</span>
          <span className="text-primary-foreground font-bold">
            1 {from} = {Number(rate).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} {to}
          </span>
        </div>
        {updatedAt && (
          <div className="flex justify-between items-center mt-1 text-[9px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <RefreshCw className="w-2.5 h-2.5" /> Rate updated
            </span>
            <span>{updatedAt}</span>
          </div>
        )}
      </div>
    </div>
  );
}
