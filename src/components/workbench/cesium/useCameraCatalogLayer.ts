import { useEffect } from 'react';
import * as Cesium from 'cesium';
import type { MapCameraCatalogEntry } from '@/api/gtsmApi';
import type { CesiumDataSourcesRef, CesiumViewerRef } from './cesiumMapTypes';

interface UseCameraCatalogLayerOptions {
  viewerRef: CesiumViewerRef;
  dataSourcesRef: CesiumDataSourcesRef;
  cameras: MapCameraCatalogEntry[];
  selectedLayers: string[];
}

export function useCameraCatalogLayer({ viewerRef, dataSourcesRef, cameras, selectedLayers }: UseCameraCatalogLayerOptions) {
  useEffect(() => {
    const viewer = viewerRef.current;
    const dataSource = dataSourcesRef.current.cameras;
    if (!viewer || viewer.isDestroyed() || !dataSource) return;

    dataSource.entities.suspendEvents();
    dataSource.entities.removeAll();
    if (selectedLayers.includes('cameras')) {
      for (const camera of cameras) {
        dataSource.entities.add({
          id: `camera:${camera.id}`,
          position: Cesium.Cartesian3.fromDegrees(camera.longitude, camera.latitude, 0),
          properties: {
            cameraId: camera.id,
            label: camera.label,
            operator: camera.operator,
            type: 'camera',
          },
          billboard: {
            image: Cesium.PinBuilder ? new Cesium.PinBuilder().fromColor(Cesium.Color.fromCssColorString('#a78bfa'), 36) : undefined,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            scale: 0.72,
          },
          label: {
            text: camera.label,
            font: '10px Inter, sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -32),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 4_000_000),
          },
        });
      }
    }
    dataSource.entities.resumeEvents();
    viewer.scene.requestRender();
  }, [viewerRef, dataSourcesRef, cameras, selectedLayers]);
}
