import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export function MetricCard({ data }: { data: any }) {
  const label = data.label || data.title || 'Metric';
  const value = data.value ?? data.count ?? data.total;
  const trend = data.trend || data.change;
  const trendUp = typeof trend === 'number' ? trend > 0 : String(trend || '').includes('+');
  const trendDown = typeof trend === 'number' ? trend < 0 : String(trend || '').includes('-');
  const subtitle = data.subtitle || data.description || '';

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-lg w-full max-w-[240px] text-center">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">{label}</p>
      <p className="text-3xl font-black text-primary-foreground tracking-tighter tabular-nums">
        {value != null ? value : '—'}
      </p>
      {trend != null && (
        <div className={`flex items-center justify-center gap-1 mt-2 text-xs font-medium ${
          trendUp ? 'text-emerald-400' : trendDown ? 'text-rose-400' : 'text-muted-foreground'
        }`}>
          {trendUp ? <TrendingUp size={14} /> : trendDown ? <TrendingDown size={14} /> : <Minus size={14} />}
          <span>{typeof trend === 'number' ? `${trend > 0 ? '+' : ''}${trend}%` : trend}</span>
        </div>
      )}
      {subtitle && <p className="text-[10px] text-muted-foreground mt-1.5">{subtitle}</p>}
    </div>
  );
}
