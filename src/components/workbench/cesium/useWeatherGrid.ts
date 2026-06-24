import { useEffect } from 'react';
import { gtsmApi } from '@/api/gtsmApi';
import { type SpatialEntity, useGTSMStore } from '@/lib/stores/useGTSMStore';

/** Loads a bounded weather grid centered on the current globe viewport. */
export function useWeatherGrid(enabled: boolean) {
  const center = useGTSMStore((state) => state.viewportCenter);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      const state = useGTSMStore.getState();
      state.setLoadingLayer('weather', true);
      try {
        const latitudeSpan = center.alt > 3_000_000 ? 30 : 6;
        const longitudeSpan = center.alt > 3_000_000 ? 45 : 9;
        const step = center.alt > 3_000_000 ? 5 : 1;
        const points = await gtsmApi.getWeatherGrid(
          Math.max(-85, center.lat - latitudeSpan),
          Math.min(85, center.lat + latitudeSpan),
          Math.max(-180, center.lon - longitudeSpan),
          Math.min(180, center.lon + longitudeSpan),
          step,
        );
        if (cancelled) return;
        const entities: SpatialEntity[] = points.map((point, index) => ({
          id: `weather-${point.lat.toFixed(3)}-${point.lon.toFixed(3)}-${index}`,
          type: 'weather',
          position: { lat: point.lat, lon: point.lon, alt: 1500 },
          metadata: point,
          _timestamp: Date.now(),
        }));
        state.setWeatherGrid(entities);
        state.setLayerError('weather', null);
        state.setLayerUpdatedAt('weather', Date.now());
      } catch (error) {
        if (!cancelled) state.setLayerError('weather', error instanceof Error ? error.message : 'Unable to load weather grid');
      } finally {
        if (!cancelled) state.setLoadingLayer('weather', false);
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [center.alt, center.lat, center.lon, enabled]);
}
