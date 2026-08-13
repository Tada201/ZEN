import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StockCard({ data }: { data: any }) {
  const priceVal = typeof data.price === 'number' ? data.price : parseFloat(data.price);
  const changeVal = typeof data.change === 'number' ? data.change : parseFloat(data.change);
  const changePercentVal = typeof data.changePercent === 'number' ? data.changePercent : parseFloat(data.changePercent);

  const isUp = (!isNaN(changeVal) ? changeVal : 0) >= 0;

  return (
    <div className="genui-card-surface w-full max-w-none min-w-0 rounded-2xl border border-border bg-card p-5 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-lg font-bold tracking-tight text-primary-foreground">{data.ticker || 'TICKER'}</h4>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{data.companyName || 'Company Inc.'}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tracking-tighter text-primary-foreground">${!isNaN(priceVal) ? priceVal.toFixed(2) : '0.00'}</div>
          <div className={cn(
            "flex items-center justify-end gap-1 text-xs font-semibold mt-0.5",
            isUp ? "text-emerald-400" : "text-rose-400"
          )}>
            {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            <span>{isUp ? '+' : ''}{!isNaN(changeVal) ? changeVal.toFixed(2) : '0.00'} ({!isNaN(changePercentVal) ? changePercentVal.toFixed(2) : '0.00'}%)</span>
          </div>
        </div>
      </div>

      {/* Mini Sparkline Chart */}
      <div className="h-10 w-full my-4 flex items-end gap-[3px]">
        {([30, 45, 35, 50, 40, 60, 55, 70, 65, 80, 75, 90] as number[]).map((val, i) => {
          const heightPct = `${(val / 90) * 100}%`;
          return (
            <div 
              key={i} 
              className={cn(
                "flex-1 rounded-t-[1px] transition-all duration-300", 
                isUp ? "bg-emerald-500/10 hover:bg-emerald-400" : "bg-rose-500/10 hover:bg-rose-400"
              )}
              style={{ height: heightPct }}
            />
          );
        })}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 border-t border-border pt-3 text-[11px] font-mono">
        <div>
          <span className="text-muted-foreground block uppercase tracking-wider">Market Cap</span>
          <span className="text-primary-foreground font-bold">{data.marketCap || 'N/A'}</span>
        </div>
        <div>
          <span className="text-muted-foreground block uppercase tracking-wider">Volume</span>
          <span className="text-primary-foreground font-bold">{data.volume || 'N/A'}</span>
        </div>
      </div>

      {/* 52-Week Range Bar */}
      <div className="mt-3.5 border-t border-border pt-3 text-[10px]">
        <div className="flex justify-between text-muted-foreground font-mono mb-1">
          <span>52W Low: ${data.low52 || '0.00'}</span>
          <span>52W High: ${data.high52 || '0.00'}</span>
        </div>
        <div className="w-full h-1 bg-muted rounded-full relative overflow-hidden">
          <div className="absolute top-0 bottom-0 left-[20%] right-[30%] bg-gradient-to-r from-emerald-500 to-primary rounded-full" />
        </div>
      </div>
    </div>
  );
}
