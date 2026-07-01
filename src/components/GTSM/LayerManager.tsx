import React from 'react';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { useGTSMStore } from '@/lib/stores/useGTSMStore';

const LAYERS = [
  { id: 'satellites', label: 'Satellites' },
  { id: 'flights', label: 'Flights' },
  { id: 'earthquakes', label: 'Earthquakes' },
  { id: 'military', label: 'Military aircraft' },
  { id: 'vessels', label: 'Vessels' },
  { id: 'naturalEvents', label: 'Natural events' },
  { id: 'weather', label: 'Weather' },
  { id: 'cables', label: 'Undersea cables' },
  { id: 'cameras', label: 'Camera catalog' },
] as const;

type LayerId = typeof LAYERS[number]['id'];

const BASEMAPS = [
  { id: 'dark', label: 'Dark' },
  { id: 'satellite', label: 'Satellite' },
  { id: 'off', label: 'None' },
] as const;

export const LayerManager: React.FC = () => {
  const selectedLayers = useGTSMStore((state) => state.selectedLayers);
  const toggleLayer = useGTSMStore((state) => state.toggleLayer);
  const imageryProvider = useGTSMStore((state) => state.imageryProvider);
  const setImageryProvider = useGTSMStore((state) => state.setImageryProvider);
  const loadingLayers = useGTSMStore((state) => state.loadingLayers);
  const errorLayers = useGTSMStore((state) => state.errorLayers);
  const satelliteCount = useGTSMStore((state) => state.satellites.length);
  const flightCount = useGTSMStore((state) => state.flights.length);
  const earthquakeCount = useGTSMStore((state) => state.earthquakes.length);
  const militaryCount = useGTSMStore((state) => state.military.length);
  const vesselCount = useGTSMStore((state) => state.vessels.length);
  const naturalEventCount = useGTSMStore((state) => state.naturalEvents.length);
  const weatherCount = useGTSMStore((state) => state.weatherGrid.length);
  const cameraCount = useGTSMStore((state) => state.cameras.length);

  const countFor = (id: LayerId) => ({
    satellites: satelliteCount,
    flights: flightCount,
    earthquakes: earthquakeCount,
    military: militaryCount,
    vessels: vesselCount,
    naturalEvents: naturalEventCount,
    weather: weatherCount,
    cables: null,
    cameras: cameraCount,
  })[id];

  return (
    <div className="space-y-5">
      <section>
        <p className="mb-2 text-[10px] font-medium text-muted-foreground">Basemap</p>
        <div className="grid grid-cols-3 border border-border">
          {BASEMAPS.map((basemap) => (
            <button
              key={basemap.id}
              type="button"
              onClick={() => setImageryProvider(basemap.id)}
              className={`border-r border-border px-2 py-2 text-[10px] font-medium last:border-r-0 ${imageryProvider === basemap.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
            >
              {basemap.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-2 text-[10px] font-medium text-muted-foreground">Data layers</p>
        <div className="border border-border">
          {LAYERS.map((layer) => {
            const active = selectedLayers.includes(layer.id);
            const error = errorLayers[layer.id];
            const loading = loadingLayers.includes(layer.id);
            const count = countFor(layer.id);
            return (
              <button
                key={layer.id}
                type="button"
                onClick={() => toggleLayer(layer.id)}
                className="flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted/40"
              >
                <span aria-hidden="true" className={`flex h-3.5 w-3.5 items-center justify-center border ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-transparent'}`}>
                  {active && <WorkbenchIcon name="solar:check-read-linear" size={10} />}
                </span>
                <span className="min-w-0 flex-1 text-[11px] text-foreground">{layer.label}</span>
                {error ? <span className="text-[9px] text-destructive">Error</span> : loading ? <span className="text-[9px] text-muted-foreground">Updating</span> : count !== null ? <span className="text-[9px] text-muted-foreground">{count}</span> : null}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default LayerManager;
