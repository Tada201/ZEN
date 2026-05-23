import { CheckCircle2 } from 'lucide-react';
import { StockCard } from './premium/StockCard';
import { FlightCard } from './premium/FlightCard';
import { PackageCard } from './premium/PackageCard';
import { ProductCard } from './premium/ProductCard';
import { JobCard } from './premium/JobCard';
import { EventCard } from './premium/EventCard';
import { MovieCard } from './premium/MovieCard';
import { BookCard } from './premium/BookCard';
import { PersonCard } from './premium/PersonCard';
import { NutritionCard } from './premium/NutritionCard';
import { MapComponent } from './Map';
import { MessageComposer } from './MessageComposer';

interface CardProps {
  type: string;
  data: any;
}

export function PremiumCard({ type, data }: CardProps) {
  const t = type.toLowerCase();

  // Specialized inline layouts
  if (t === 'map') {
    return (
      <div className="w-full max-w-sm p-1 rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md overflow-hidden shadow-lg">
        <MapComponent
          latitude={data.latitude ?? data.lat ?? 0}
          longitude={data.longitude ?? data.lng ?? data.long ?? 0}
          zoom={data.zoom}
          label={data.label}
          className="w-full"
        />
      </div>
    );
  }

  if (t === 'composer' || t === 'message_composer') {
    return (
      <div className="w-full max-w-md">
        <MessageComposer
          topic={data.topic ?? "Draft"}
          variants={data.variants || []}
        />
      </div>
    );
  }

  // Core Premium Entity Cards
  if (t === 'stock' || t === 'financial') {
    return <StockCard data={data} />;
  }

  if (t === 'flight') {
    return <FlightCard data={data} />;
  }

  if (t === 'package' || t === 'tracking') {
    return <PackageCard data={data} />;
  }

  if (t === 'product') {
    return <ProductCard data={data} />;
  }

  if (t === 'job') {
    return <JobCard data={data} />;
  }

  if (t === 'event') {
    return <EventCard data={data} />;
  }

  if (t === 'movie' || t === 'show') {
    return <MovieCard data={data} />;
  }

  if (t === 'book') {
    return <BookCard data={data} />;
  }

  if (t === 'person' || t === 'contact') {
    return <PersonCard data={data} />;
  }

  if (t === 'nutrition' || t === 'food') {
    return <NutritionCard data={data} />;
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
