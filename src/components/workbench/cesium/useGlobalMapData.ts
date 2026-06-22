import { useEffect } from 'react';
import { gtsmApi, type GlobalMapRecord } from '@/api/gtsmApi';
import { useGTSMStore, type SpatialEntity } from '@/lib/stores/useGTSMStore';

type GlobalLayer = 'satellites' | 'flights' | 'earthquakes' | 'military' | 'vessels' | 'naturalEvents';

const layerRequests: Record<GlobalLayer, () => Promise<GlobalMapRecord[]>> = {
  satellites: gtsmApi.getSatellites,
  flights: gtsmApi.getFlights,
  earthquakes: gtsmApi.getEarthquakes,
  military: gtsmApi.getMilitaryAircraft,
  vessels: gtsmApi.getVessels,
  naturalEvents: gtsmApi.getNaturalEvents,
};

function toSpatialEntity(layer: GlobalLayer, record: GlobalMapRecord, index: number): SpatialEntity | null {
  if (!Number.isFinite(record.lat) || !Number.isFinite(record.lon)) return null;
  const id = record.id ?? record.icao24 ?? record.hex ?? record.mmsi ?? `${layer}-${index}`;
  const typeByLayer: Record<GlobalLayer, SpatialEntity['type']> = {
    satellites: 'satellite',
    flights: 'flight',
    earthquakes: 'earthquake',
    military: 'military',
    vessels: 'vessel',
    naturalEvents: 'natural_event',
  };

  return {
    id: String(id),
    type: typeByLayer[layer],
    position: { lat: record.lat, lon: record.lon, alt: record.alt ?? record.alt_baro ?? record.depth ?? 0 },
    velocity: record.velocity ?? record.ground_speed,
    metadata: {
      ...record,
      heading: record.heading ?? record.track,
      type: record.ship_type,
      flight: record.flight ?? record.callsign,
    },
    _timestamp: Date.now(),
  };
}

/** Hydrates the active 3D globe from Zen-owned GTSM services at a bounded cadence. */
export function useGlobalMapData(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const store = useGTSMStore;

    const refresh = async () => {
      await Promise.all(Object.entries(layerRequests).map(async ([layer, request]) => {
        const typedLayer = layer as GlobalLayer;
        store.getState().setLoadingLayer(typedLayer, true);
        try {
          const records = await request();
          if (!cancelled) {
            store.getState().updateEntities(
              typedLayer,
              records.map((record, index) => toSpatialEntity(typedLayer, record, index)).filter((entity): entity is SpatialEntity => entity !== null),
            );
            store.getState().setLayerError(typedLayer, null);
          }
        } catch (error) {
          if (!cancelled) store.getState().setLayerError(typedLayer, error instanceof Error ? error.message : 'Unable to load layer');
        } finally {
          if (!cancelled) store.getState().setLoadingLayer(typedLayer, false);
        }
      }));
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [enabled]);
}
