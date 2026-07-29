import { BookOpen, Star } from 'lucide-react';

export function BookCard({ data }: { data: any }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-lg max-w-md flex gap-4">
      <div className="w-20 h-28 bg-muted border border-border rounded overflow-hidden flex-none shadow-md">
        {data.cover ? (
          <img src={data.cover} alt={data.title} className="h-full w-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground"><BookOpen size={24} /></div>
        )}
      </div>
      <div className="flex-grow flex flex-col justify-between min-w-0">
        <div>
          <h4 className="font-bold text-primary-foreground leading-tight truncate">{data.title || 'Book Title'}</h4>
          <p className="text-xs text-primary-foreground mt-1">by <span className="font-bold text-primary-foreground">{data.author || 'Author'}</span></p>
          <div className="flex items-center text-amber-400 mt-2">
            <Star size={10} fill="currentColor" />
            <span className="text-[10px] font-bold text-primary-foreground ml-1">{data.rating || '4.8'}</span>
            <span className="text-[10px] text-muted-foreground ml-2">({data.pages || '350'} pages)</span>
          </div>
          <p className="text-[10px] text-muted-foreground line-clamp-2 leading-normal mt-2">{data.description || 'Description...'}</p>
        </div>
      </div>
    </div>
  );
}
