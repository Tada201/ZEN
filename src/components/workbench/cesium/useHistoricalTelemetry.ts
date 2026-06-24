import { useEffect, useRef } from 'react';
import { gtsmApi } from '@/api/gtsmApi';
import { type SpatialEntity, useGTSMStore } from '@/lib/stores/useGTSMStore';

type HistoricalLayer = 'military' | 'earthquakes' | 'naturalEvents';

const HISTORY_SOURCES: Array<{ layer: HistoricalLayer; entityType: string; type: SpatialEntity['type'] }> = [
  { layer: 'military', entityType: 'military', type: 'military' },
  { layer: 'earthquakes', entityType: 'earthquake', type: 'earthquake' },
  { layer: 'naturalEvents', entityType: 'natural_event', type: 'natural_event' },
];

function parseMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/** Applies the nearest persisted telemetry frame while replay mode is active. */
export function useHistoricalTelemetry() {
  const historyMode = useGTSMStore((state) => state.historyMode);
  const currentTime = useGTSMStore((state) => state.currentTime);
  const liveLayersRef = useRef<Partial<Record<HistoricalLayer, SpatialEntity[]>> | null>(null);

  useEffect(() => {
    if (historyMode) return;
    if (!liveLayersRef.current) return;

    const store = useGTSMStore.getState();
    for (const source of HISTORY_SOURCES) {
      store.updateEntities(source.layer, liveLayersRef.current[source.layer] ?? []);
    }
    liveLayersRef.current = null;
  }, [historyMode]);

  useEffect(() => {
    if (!historyMode) return;
    const store = useGTSMStore.getState();
    if (!liveLayersRef.current) {
      liveLayersRef.current = {
        military: store.military,
        earthquakes: store.earthquakes,
        naturalEvents: store.naturalEvents,
      };
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      try {
        const timestampSeconds = Math.floor(currentTime / 1000);
        const frames = await Promise.all(HISTORY_SOURCES.map(async (source) => {
          const snapshots = await gtsmApi.getTelemetryHistory(source.entityType, timestampSeconds);
          return {
            source,
            snapshots: snapshots.map((snapshot): SpatialEntity => ({
              id: snapshot.entity_id,
              type: source.type,
              position: { lat: snapshot.lat, lon: snapshot.lon, alt: snapshot.alt ?? 0 },
              metadata: parseMetadata(snapshot.metadata ?? snapshot.raw_data),
              _timestamp: snapshot.timestamp * 1000,
            })),
          };
        }));

        if (cancelled) return;
        const activeStore = useGTSMStore.getState();
        frames.forEach(({ source, snapshots }) => activeStore.updateEntities(source.layer, snapshots));
        activeStore.setRecentSnapshots(frames.flatMap(({ snapshots }) => snapshots.map((entity) => ({
          id: 0,
          entity_type: entity.type,
          entity_id: entity.id,
          timestamp: Math.floor((entity._timestamp ?? 0) / 1000),
          lat: entity.position.lat,
          lon: entity.position.lon,
          alt: entity.position.alt,
          velocity: null,
          heading: null,
          raw_data: JSON.stringify(entity.metadata),
          metadata: JSON.stringify(entity.metadata),
        }))));
        activeStore.setHistoryTimestamp(timestampSeconds);
      } catch (error) {
        if (!cancelled) {
          useGTSMStore.getState().setLayerError('history', error instanceof Error ? error.message : 'Unable to load historical telemetry');
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [currentTime, historyMode]);
}
