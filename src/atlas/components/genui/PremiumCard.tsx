import { 
  TrendingUp, TrendingDown, Plane, Calendar, MapPin, 
  Clock, Star, User, BookOpen, DollarSign,
  CheckCircle2, Package, ShoppingCart
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CardProps {
  type: string;
  data: any;
}

export function PremiumCard({ type, data }: CardProps) {
  const t = type.toLowerCase();

  // 1. Stock / Financial Card
  if (t === 'stock' || t === 'financial') {
    const isUp = (data.change ?? 0) >= 0;
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md p-5 shadow-lg max-w-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-lg font-bold tracking-tight text-white">{data.ticker || 'TICKER'}</h4>
            <p className="text-[10px] text-white/40 uppercase tracking-wider">{data.companyName || 'Company Inc.'}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tracking-tighter text-white">${data.price?.toFixed(2) || '0.00'}</div>
            <div className={cn(
              "flex items-center justify-end gap-1 text-xs font-semibold mt-0.5",
              isUp ? "text-emerald-400" : "text-rose-400"
            )}>
              {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              <span>{isUp ? '+' : ''}{data.change?.toFixed(2) || '0.00'} ({data.changePercent?.toFixed(2) || '0.00'}%)</span>
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
                  isUp ? "bg-emerald-500/20 hover:bg-emerald-400" : "bg-rose-500/20 hover:bg-rose-400"
                )}
                style={{ height: heightPct }}
              />
            );
          })}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-3 text-[11px] font-mono">
          <div>
            <span className="text-white/30 block uppercase tracking-wider">Market Cap</span>
            <span className="text-white/80 font-bold">{data.marketCap || 'N/A'}</span>
          </div>
          <div>
            <span className="text-white/30 block uppercase tracking-wider">Volume</span>
            <span className="text-white/80 font-bold">{data.volume || 'N/A'}</span>
          </div>
        </div>

        {/* 52-Week Range Bar */}
        <div className="mt-3.5 border-t border-white/[0.06] pt-3 text-[10px]">
          <div className="flex justify-between text-white/40 font-mono mb-1">
            <span>52W Low: ${data.low52 || '0.00'}</span>
            <span>52W High: ${data.high52 || '0.00'}</span>
          </div>
          <div className="w-full h-1 bg-white/10 rounded-full relative overflow-hidden">
            <div className="absolute top-0 bottom-0 left-[20%] right-[30%] bg-gradient-to-r from-emerald-500 to-primary rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  // 2. Flight Card
  if (t === 'flight') {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md p-5 shadow-lg max-w-md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Plane className="text-primary h-4 w-4 rotate-45" />
            <span className="text-xs font-bold text-white/80 tracking-wider font-mono">{data.airline || 'Airline'} {data.flightNumber || 'FL000'}</span>
          </div>
          <span className={cn(
            "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border",
            data.status === 'on time' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"
          )}>
            {data.status || 'On Time'}
          </span>
        </div>

        <div className="flex items-center justify-between my-4">
          <div className="flex-1">
            <h3 className="text-3xl font-black tracking-tighter text-white">{data.departureCode || 'DEP'}</h3>
            <p className="text-[10px] text-white/40 uppercase truncate">{data.departureCity || 'Departure City'}</p>
            <p className="text-xs font-mono font-bold text-white/80 mt-1">{data.departureTime || '00:00 AM'}</p>
          </div>
          <div className="flex flex-col items-center px-4 flex-none gap-1">
            <span className="text-[10px] text-white/30 font-mono">{data.duration || '0h 0m'}</span>
            <div className="w-20 h-px bg-white/20 relative">
              <div className="w-1.5 h-1.5 rounded-full bg-primary absolute -top-[3px] left-[50%] -translate-x-1/2" />
            </div>
            <span className="text-[9px] text-primary/60 font-bold uppercase tracking-widest">Non-Stop</span>
          </div>
          <div className="flex-grow text-right">
            <h3 className="text-3xl font-black tracking-tighter text-white">{data.arrivalCode || 'ARR'}</h3>
            <p className="text-[10px] text-white/40 uppercase truncate">{data.arrivalCity || 'Arrival City'}</p>
            <p className="text-xs font-mono font-bold text-white/80 mt-1">{data.arrivalTime || '00:00 PM'}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3 text-[11px] font-mono text-center">
          <div>
            <span className="text-white/30 block uppercase tracking-wider">Gate</span>
            <span className="text-white font-bold text-xs">{data.gate || '--'}</span>
          </div>
          <div>
            <span className="text-white/30 block uppercase tracking-wider">Seat</span>
            <span className="text-white font-bold text-xs">{data.seat || '--'}</span>
          </div>
          <div>
            <span className="text-white/30 block uppercase tracking-wider">Terminal</span>
            <span className="text-white font-bold text-xs">{data.terminal || '--'}</span>
          </div>
        </div>
      </div>
    );
  }

  // 3. Package Tracking Card
  if (t === 'package' || t === 'tracking') {
    const steps = ['Ordered', 'Shipped', 'In Transit', 'Out for Delivery', 'Delivered'];
    const activeIndex = steps.findIndex(s => s.toLowerCase() === (data.status || '').toLowerCase()) !== -1
      ? steps.findIndex(s => s.toLowerCase() === (data.status || '').toLowerCase())
      : 2;

    return (
      <div className="rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md p-5 shadow-lg max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Package className="text-primary h-4 w-4" />
            <span className="text-xs font-bold text-white/80 tracking-wider font-mono uppercase">{data.carrier || 'Carrier'}</span>
          </div>
          <span className="text-[10px] text-white/40 font-mono">{data.trackingNumber || 'TRK000000'}</span>
        </div>

        <div className="mb-4">
          <span className="text-[10px] text-white/30 block uppercase tracking-wider">Estimated Delivery</span>
          <span className="text-lg font-bold text-white">{data.estimatedDelivery || 'Soon'}</span>
        </div>

        {/* Horizontal Timeline Steps */}
        <div className="flex items-center justify-between my-5 relative">
          <div className="absolute left-1 right-1 h-[2px] bg-white/10 top-2 -z-10" />
          <div className="absolute left-1 h-[2px] bg-primary top-2 -z-10 transition-all duration-500" style={{ width: `${(activeIndex / (steps.length - 1)) * 100}%` }} />
          
          {steps.map((step, idx) => {
            const isCompleted = idx <= activeIndex;
            const isCurrent = idx === activeIndex;
            return (
              <div key={step} className="flex flex-col items-center relative group">
                <div className={cn(
                  "w-4.5 h-4.5 rounded-full border flex items-center justify-center transition-all duration-300",
                  isCompleted 
                    ? "bg-primary border-primary text-black" 
                    : "bg-black/60 border-white/20 text-white/30"
                )}>
                  {isCompleted && <CheckCircle2 size={10} className="stroke-[3]" />}
                </div>
                <span className={cn(
                  "text-[8px] mt-2 whitespace-nowrap uppercase tracking-wider font-bold",
                  isCurrent ? "text-primary font-black" : (isCompleted ? "text-white/60" : "text-white/20")
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

  // 4. Product Card
  if (t === 'product') {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md overflow-hidden shadow-lg max-w-[260px] flex flex-col group hover:scale-[1.01] transition-transform duration-300">
        <div className="h-44 w-full bg-white/[0.03] flex items-center justify-center relative overflow-hidden">
          {data.image ? (
            <img src={data.image} alt={data.name} className="h-full w-full object-cover" />
          ) : (
            <ShoppingCart className="h-12 w-12 text-white/15" />
          )}
          <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-[9px] font-bold text-white uppercase font-mono">
            {data.inStock ? 'In Stock' : 'Out of Stock'}
          </span>
        </div>
        <div className="p-4 flex-grow flex flex-col justify-between gap-3">
          <div>
            <h4 className="font-bold text-sm text-white line-clamp-1 leading-snug">{data.name || 'Premium Item'}</h4>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="flex items-center text-amber-400">
                <Star size={10} fill="currentColor" />
                <span className="text-[10px] font-bold text-white/80 ml-0.5">{data.rating || '5.0'}</span>
              </div>
              <span className="text-[9px] text-white/30">({data.reviews || '0'} reviews)</span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/[0.06] pt-3 mt-1">
            <span className="text-lg font-black text-white">${data.price?.toFixed(2) || '0.00'}</span>
            <button className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary text-black hover:bg-primary-glow active:scale-95 transition-all">
              <ShoppingCart size={14} className="stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 5. Job Listing Card
  if (t === 'job') {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md p-5 shadow-lg max-w-md">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 font-black text-lg">
              {data.company?.slice(0, 1) || 'J'}
            </div>
            <div>
              <h4 className="font-bold text-white leading-tight">{data.title || 'Software Engineer'}</h4>
              <p className="text-xs text-white/50 font-medium mt-0.5">{data.company || 'Tech Company'}</p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-[9px] font-bold text-primary uppercase tracking-wider">
            {data.type || 'Full Time'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 my-3.5 text-xs text-white/60 font-medium">
          <div className="flex items-center gap-1.5">
            <MapPin size={12} className="text-white/40" />
            <span>{data.location || 'Remote'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <DollarSign size={12} className="text-white/40" />
            <span>{data.salary || 'Competitive'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar size={12} className="text-white/40" />
            <span>{data.postedDate || 'Just posted'}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-3.5">
          {(data.requirements || ['React', 'TypeScript', 'Node.js'] as string[]).map((req: string) => (
            <span key={req} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/[0.08] text-[9px] font-bold text-white/70 uppercase">
              {req}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // 6. Event Card
  if (t === 'event') {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md p-5 shadow-lg max-w-sm flex gap-4">
        <div className="flex-none flex flex-col items-center justify-center bg-primary/10 border border-primary/25 rounded-2xl w-14 h-16">
          <span className="text-[10px] font-black text-primary uppercase tracking-widest">{data.month || 'DEC'}</span>
          <span className="text-2xl font-black text-white tracking-tighter leading-none mt-0.5">{data.day || '01'}</span>
        </div>
        <div className="flex-grow flex flex-col justify-between min-w-0">
          <div>
            <h4 className="font-bold text-white leading-tight truncate">{data.name || 'Event Title'}</h4>
            <div className="flex items-center gap-1.5 text-xs text-white/50 mt-1.5">
              <MapPin size={11} className="shrink-0" />
              <span className="truncate">{data.venue || 'Venue Location'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-white/50 mt-1">
              <Clock size={11} className="shrink-0" />
              <span>{data.time || '7:00 PM'}</span>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-white/[0.06] pt-3 mt-3">
            <span className="text-xs font-mono font-bold text-white/40">{data.price || 'Free'}</span>
            <button className="px-3 py-1 rounded-lg bg-primary hover:bg-primary-glow text-black text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all">
              RSVP
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 7. Movie / Show Card
  if (t === 'movie' || t === 'show') {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md overflow-hidden shadow-lg max-w-md flex">
        <div className="w-28 bg-white/[0.03] flex items-center justify-center relative overflow-hidden flex-none">
          {data.poster ? (
            <img src={data.poster} alt={data.title} className="h-full w-full object-cover" />
          ) : (
            <BookOpen className="h-10 w-10 text-white/10" />
          )}
        </div>
        <div className="p-4 flex-grow flex flex-col justify-between gap-3 min-w-0">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[8px] font-mono text-white/50 font-bold uppercase">{data.rating || 'PG-13'}</span>
              <span className="text-[10px] font-mono text-white/40">{data.year || '2026'} · {data.runtime || '2h'}</span>
            </div>
            <h4 className="font-bold text-white leading-tight truncate">{data.title || 'Movie Title'}</h4>
            <p className="text-[11px] text-white/50 line-clamp-2 mt-2 leading-relaxed font-medium">{data.synopsis || 'Movie description...'}</p>
          </div>
          <div className="flex flex-wrap gap-1 border-t border-white/[0.06] pt-3">
            {(data.genres || ['Action', 'Sci-Fi'] as string[]).map((g: string) => (
              <span key={g} className="px-1.5 py-0.5 rounded bg-primary/10 text-[9px] font-bold text-primary uppercase">
                {g}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 8. Book Card
  if (t === 'book') {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md p-5 shadow-lg max-w-sm flex gap-4">
        <div className="w-20 h-28 bg-white/5 border border-white/10 rounded overflow-hidden flex-none shadow-md">
          {data.cover ? (
            <img src={data.cover} alt={data.title} className="h-full w-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/10"><BookOpen size={24} /></div>
          )}
        </div>
        <div className="flex-grow flex flex-col justify-between min-w-0">
          <div>
            <h4 className="font-bold text-white leading-tight truncate">{data.title || 'Book Title'}</h4>
            <p className="text-xs text-white/50 mt-1">by <span className="font-bold text-white/70">{data.author || 'Author'}</span></p>
            <div className="flex items-center text-amber-400 mt-2">
              <Star size={10} fill="currentColor" />
              <span className="text-[10px] font-bold text-white/80 ml-1">{data.rating || '4.8'}</span>
              <span className="text-[10px] text-white/30 ml-2">({data.pages || '350'} pages)</span>
            </div>
            <p className="text-[10px] text-white/40 line-clamp-2 leading-normal mt-2">{data.description || 'Description...'}</p>
          </div>
        </div>
      </div>
    );
  }

  // 9. Person / Contact Card
  if (t === 'person' || t === 'contact') {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md p-5 shadow-lg max-w-xs flex flex-col items-center text-center">
        <div className="h-16 w-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-black text-2xl shadow-inner relative">
          {data.avatar ? (
            <img src={data.avatar} alt={data.name} className="h-full w-full rounded-full object-cover" />
          ) : (
            <User size={28} />
          )}
          <div className="w-3 h-3 rounded-full bg-emerald-500 border border-black absolute bottom-0 right-0" />
        </div>

        <div className="mt-3">
          <h4 className="font-bold text-white tracking-tight">{data.name || 'John Doe'}</h4>
          <p className="text-xs text-white/50 font-medium mt-0.5">{data.role || 'Principal Investigator'}</p>
          <p className="text-[10px] text-primary font-mono mt-1">{data.organization || 'Aegis Division'}</p>
        </div>

        <div className="w-full border-t border-white/[0.06] pt-3.5 mt-3.5 text-xs text-white/60 space-y-2">
          {data.email && (
            <div className="flex items-center justify-between">
              <span className="text-white/30">Email</span>
              <span className="font-mono text-white/80">{data.email}</span>
            </div>
          )}
          {data.phone && (
            <div className="flex items-center justify-between">
              <span className="text-white/30">Phone</span>
              <span className="font-mono text-white/80">{data.phone}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 10. Nutrition Label Card
  if (t === 'nutrition' || t === 'food') {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md p-5 shadow-lg max-w-xs text-white font-mono text-xs">
        <div className="border-b-4 border-white pb-1.5 mb-2">
          <h4 className="text-lg font-black tracking-tighter uppercase leading-none">{data.name || 'Nutrition Facts'}</h4>
          <p className="text-[10px] text-white/50 mt-0.5">Serving Size: {data.servingSize || '1 container'}</p>
        </div>
        
        <div className="flex justify-between items-baseline border-b-2 border-white pb-1 mb-2">
          <span className="font-black text-sm uppercase">Calories</span>
          <span className="text-2xl font-black tracking-tighter leading-none">{data.calories || '0'}</span>
        </div>

        <div className="space-y-1.5 border-b-4 border-white pb-2 mb-2">
          <div className="flex justify-between border-b border-white/10 pb-0.5">
            <span><strong className="text-white/90">Total Fat</strong> {data.fat || '0'}g</span>
            <strong className="text-white/90">{data.fatPercent || '0'}%</strong>
          </div>
          <div className="flex justify-between border-b border-white/10 pb-0.5">
            <span><strong className="text-white/90">Total Carb</strong> {data.carbs || '0'}g</span>
            <strong className="text-white/90">{data.carbsPercent || '0'}%</strong>
          </div>
          <div className="flex justify-between pb-0.5">
            <span><strong className="text-white/90">Protein</strong> {data.protein || '0'}g</span>
            <strong className="text-white/90">--%</strong>
          </div>
        </div>

        {/* Macro Bars */}
        <div className="space-y-2 mt-3 pt-1">
          <span className="text-[9px] uppercase tracking-wider text-white/30 block">Macro split</span>
          <div className="w-full h-3 rounded-full bg-white/5 flex overflow-hidden">
            <div className="bg-amber-500 h-full transition-all" style={{ width: `${data.fatRatio || 20}%` }} title="Fat" />
            <div className="bg-primary h-full transition-all" style={{ width: `${data.carbsRatio || 50}%` }} title="Carbs" />
            <div className="bg-emerald-500 h-full transition-all" style={{ width: `${data.proteinRatio || 30}%` }} title="Protein" />
          </div>
        </div>
      </div>
    );
  }

  // Fallback visual display for raw custom cards
  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/40 backdrop-blur-md p-4 max-w-sm">
      <div className="flex items-center gap-2 mb-2 text-primary">
        <CheckCircle2 size={16} />
        <span className="text-xs font-black uppercase tracking-wider font-mono">{t} Visualizer</span>
      </div>
      <pre className="text-[10px] font-mono text-white/60 bg-white/5 p-2.5 rounded border border-white/[0.04] overflow-x-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
