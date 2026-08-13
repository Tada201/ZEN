import { Package, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PackageCard({ data }: { data: any }) {
  const steps = ['Ordered', 'Shipped', 'In Transit', 'Out for Delivery', 'Delivered'];
  const activeIndex = steps.findIndex(s => s.toLowerCase() === (data.status || '').toLowerCase()) !== -1
    ? steps.findIndex(s => s.toLowerCase() === (data.status || '').toLowerCase())
    : 2;

  return (
    <div className="genui-card-surface w-full max-w-none min-w-0 rounded-2xl border border-border bg-card p-5 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Package className="text-primary h-4 w-4" />
          <span className="text-xs font-bold text-primary-foreground tracking-wider font-mono uppercase">{data.carrier || 'Carrier'}</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">{data.trackingNumber || 'TRK000000'}</span>
      </div>

      <div className="mb-4">
        <span className="text-[10px] text-muted-foreground block uppercase tracking-wider">Estimated Delivery</span>
        <span className="text-lg font-bold text-primary-foreground">{data.estimatedDelivery || 'Soon'}</span>
      </div>

      {/* Horizontal Timeline Steps */}
      <div className="flex items-center justify-between my-5 relative">
        <div className="absolute left-1 right-1 h-[2px] bg-muted top-2 -z-10" />
        <div className="absolute left-1 h-[2px] bg-primary top-2 -z-10 transition-all duration-500" style={{ width: `${(activeIndex / (steps.length - 1)) * 100}%` }} />
        
        {steps.map((step, idx) => {
          const isCompleted = idx <= activeIndex;
          const isCurrent = idx === activeIndex;
          return (
            <div key={step} className="flex flex-col items-center relative group">
              <div className={cn(
                "w-5 h-5 rounded-full border flex items-center justify-center transition-all duration-300",
                isCompleted 
                  ? "bg-primary border-primary text-foreground" 
                  : "bg-card border-border text-muted-foreground"
              )}>
                {isCompleted && <CheckCircle2 size={10} className="stroke-[3]" />}
              </div>
              <span className={cn(
                "text-[8px] mt-2 whitespace-nowrap uppercase tracking-wider font-bold",
                isCurrent ? "text-primary font-black" : (isCompleted ? "text-primary-foreground" : "text-muted-foreground")
              )}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
