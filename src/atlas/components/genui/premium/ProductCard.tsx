import { ShoppingCart, Star } from 'lucide-react';

export function ProductCard({ data }: { data: any }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-lg max-w-[260px] flex flex-col group hover:scale-[1.01] transition-transform duration-200">
      <div className="h-44 w-full bg-card flex items-center justify-center relative overflow-hidden">
        {data.image ? (
          <img src={data.image} alt={data.name} className="h-full w-full object-cover" />
        ) : (
          <ShoppingCart className="h-12 w-12 text-muted-foreground" />
        )}
        <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-card border border-border text-[9px] font-bold text-primary-foreground uppercase font-mono">
          {data.inStock ? 'In Stock' : 'Out of Stock'}
        </span>
      </div>
      <div className="p-4 flex-grow flex flex-col justify-between gap-3">
        <div>
          <h4 className="font-bold text-sm text-primary-foreground line-clamp-1 leading-snug">{data.name || 'Premium Item'}</h4>
          <div className="flex items-center gap-1.5 mt-1">
            <div className="flex items-center text-amber-400">
              <Star size={10} fill="currentColor" />
              <span className="text-[10px] font-bold text-primary-foreground ml-0.5">{data.rating || '5.0'}</span>
            </div>
            <span className="text-[9px] text-muted-foreground">({data.reviews || '0'} reviews)</span>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3 mt-1">
          <span className="text-lg font-black text-primary-foreground">
            ${(() => {
              const priceVal = typeof data.price === 'number' ? data.price : parseFloat(data.price);
              return !isNaN(priceVal) ? priceVal.toFixed(2) : '0.00';
            })()}
          </span>
          <button className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary text-foreground hover:bg-primary-glow active:scale-95 transition-all">
            <ShoppingCart size={14} className="stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
}
