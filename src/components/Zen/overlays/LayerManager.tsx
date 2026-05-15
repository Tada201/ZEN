import React, { useState } from 'react';
import { cn } from '@/lib/utils/style';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Layers, Search } from 'lucide-react';

interface LayerItem {
  id: string;
  label: string;
  count: string;
  color: string;
}

interface LayerManagerProps {
  className?: string;
  selectedLayers?: string[];
  onToggleLayer?: (layerId: string) => void;
  satellites?: number;
  flights?: number;
  earthquakes?: number;
  military?: number;
  vessels?: number;
  naturalEvents?: number;
}

const LayerManager: React.FC<LayerManagerProps> = ({
  className,
  selectedLayers = [],
  onToggleLayer,
  satellites = 0,
  flights = 0,
  earthquakes = 0,
  military = 0,
  vessels = 0,
  naturalEvents = 0,
}) => {
  const [search, setSearch] = useState('');

  const layers: LayerItem[] = [
    { id: 'satellites', label: 'Orbital Units', count: String(satellites || '—'), color: 'var(--color-primary)' },
    { id: 'flights', label: 'Flights', count: String(flights || '—'), color: 'var(--color-success)' },
    { id: 'earthquakes', label: 'Seismic', count: String(earthquakes || '—'), color: 'var(--color-destructive)' },
    { id: 'military', label: 'Military', count: String(military || '—'), color: 'var(--color-warning)' },
    { id: 'vessels', label: 'Vessels (AIS)', count: String(vessels || '—'), color: 'hsl(199 89% 48%)' },
    { id: 'naturalEvents', label: 'Natural Events', count: String(naturalEvents || '—'), color: 'hsl(32 95% 50%)' },
    { id: 'weather', label: 'Thermal Map', count: 'API', color: 'hsl(32 95% 50%)' },
    { id: 'radar', label: 'Precip Radar', count: 'LIVE', color: 'hsl(239 84% 60%)' },
    { id: 'heatmap', label: 'Threat Heatmap', count: 'DATA', color: 'var(--color-destructive)' },
  ];

  const filteredLayers = layers.filter(l => l.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className={cn(
      'card flex flex-col',
      className
    )}>
      {/* Header */}
      <div className="h-[34px] flex items-center justify-between px-3 bg-muted border-b border-border cursor-pointer select-none">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-primary opacity-60" />
          <span className="text-[10px] font-bold tracking-widest text-primary uppercase">
            LAYER_CONTROL
          </span>
        </div>
        <span className="text-[9px] font-mono text-muted-foreground">
          {selectedLayers.length}/{layers.length}
        </span>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative group">
            <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground opacity-40" />
            <input
              type="text"
              placeholder="Search layers..."
              value={search}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-muted/50 border border-border rounded-md pl-7 pr-3 py-1.5 text-[10px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/20 transition-colors"
            />
        </div>
      </div>

      {/* Layer list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-3 space-y-1">
        {filteredLayers.map((layer) => {
          const isActive = selectedLayers.includes(layer.id);
          return (
            <button
              key={layer.id}
              onClick={() => onToggleLayer?.(layer.id)}
              className={cn(
                'press w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-all',
                isActive
                  ? 'bg-primary/10 border border-primary/20 shadow-[0_0_8px_rgba(167,139,250,0.05)]'
                  : 'bg-transparent hover:bg-muted/50'
              )}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: layer.color }}
                />
                <span className={cn(
                    "text-[11px] font-bold",
                    isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                )}>{layer.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-mono text-muted-foreground/60">{layer.count}</span>
                <div className={cn(
                  'w-1.5 h-1.5 rounded-full shadow-[0_0_4px_rgba(0,0,0,0.2)]',
                  isActive ? 'bg-primary' : 'bg-muted-foreground/20'
                )} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-border bg-muted/20">
        <Button variant="ghost" size="sm" className="press w-full text-[9px] h-7 font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted">
          Clear All Layers
        </Button>
      </div>
    </div>
  );
};

export { LayerManager };
