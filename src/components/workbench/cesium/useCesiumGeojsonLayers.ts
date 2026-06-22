import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { useGeojsonLayerStore } from '@/lib/stores/useGeojsonLayerStore';
import type { CesiumViewerRef } from './cesiumMapTypes';

interface UseCesiumGeojsonLayersOptions {
  viewerRef: CesiumViewerRef;
}

export const useCesiumGeojsonLayers = ({ viewerRef }: UseCesiumGeojsonLayersOptions) => {
  const layers = useGeojsonLayerStore((state) => state.layers);
  const dataSourcesMap = useRef<Map<string, Cesium.GeoJsonDataSource>>(new Map());

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // Track active layer IDs from Zustand store
    const activeIds = new Set(layers.map((l) => l.id));

    // Remove obsolete layer data sources
    dataSourcesMap.current.forEach((ds, id) => {
      if (!activeIds.has(id)) {
        viewer.dataSources.remove(ds);
        dataSourcesMap.current.delete(id);
      }
    });

    // Update styles or add new layers
    layers.forEach(async (layer) => {
      const isVisible = layer.visible === 1;
      const cachedDs = dataSourcesMap.current.get(layer.id);

      if (cachedDs) {
        // Toggle visibility
        cachedDs.show = isVisible;

        // Dynamically update entity colors if the layer color changes
        const color = Cesium.Color.fromCssColorString(layer.color);
        cachedDs.entities.values.forEach((entity) => {
          if (entity.polyline) {
            entity.polyline.material = new Cesium.ColorMaterialProperty(color);
          }
          if (entity.polygon) {
            entity.polygon.material = new Cesium.ColorMaterialProperty(
              color.withAlpha(0.2)
            );
            entity.polygon.outlineColor = color as any;
          }
          if (entity.point) {
            entity.point.color = color as any;
          }
        });
        viewer.scene.requestRender();
      } else if (isVisible) {
        try {
          const parsedGeoJson = JSON.parse(layer.geojson);
          const color = Cesium.Color.fromCssColorString(layer.color);

          const ds = await Cesium.GeoJsonDataSource.load(parsedGeoJson, {
            stroke: color,
            fill: color.withAlpha(0.2),
            strokeWidth: 2,
            clampToGround: true,
          });

          // Style point entities to look nice
          ds.entities.values.forEach((entity) => {
            if (entity.point) {
              entity.point.pixelSize = 8 as any;
              entity.point.outlineColor = Cesium.Color.BLACK as any;
              entity.point.outlineWidth = 1.5 as any;
            }
          });

          ds.show = true;
          viewer.dataSources.add(ds);
          dataSourcesMap.current.set(layer.id, ds);
          viewer.scene.requestRender();
        } catch (err) {
          console.error('[CesiumGeoJson] Failed to load GeoJSON layer:', layer.name, err);
        }
      }
    });
  }, [layers, viewerRef]);

  // Teardown
  useEffect(() => {
    return () => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      dataSourcesMap.current.forEach((ds) => {
        viewer.dataSources.remove(ds);
      });
      dataSourcesMap.current.clear();
    };
  }, [viewerRef]);
};
export default useCesiumGeojsonLayers;
