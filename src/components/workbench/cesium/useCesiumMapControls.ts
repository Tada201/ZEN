import { useEffect } from 'react';
import * as Cesium from 'cesium';
import { useGTSMStore } from '@/lib/stores/useGTSMStore';
import type { CesiumTilesetRef, CesiumViewerRef } from './cesiumMapTypes';

interface UseCesiumMapControlsOptions {
    viewerRef: CesiumViewerRef;
    googleTilesetRef: CesiumTilesetRef;
    viewMode: string;
    imageryProvider: string;
    googleMapsApiKey: string;
    satellites: any[];
    flights: any[];
    earthquakes: any[];
    military: any[];
    vessels: any[];
    selectedTarget: any;
    targetLocked: boolean;
    flyToRequest: any;
    setFlyToRequest: (request: any) => void;
    setSelectedTarget: (target: any) => void;
    setTargetLocked: (locked: boolean) => void;
    resolutionScale: number;
    antiAliasing: string;
    tileDetail: number;
    shadows: boolean;
    globeLighting: boolean;
    showFps: boolean;
}

export const useCesiumMapControls = ({
    viewerRef,
    googleTilesetRef,
    viewMode,
    imageryProvider,
    googleMapsApiKey,
    satellites,
    flights,
    earthquakes,
    military,
    vessels,
    selectedTarget,
    targetLocked,
    flyToRequest,
    setFlyToRequest,
    setSelectedTarget,
    setTargetLocked,
    resolutionScale,
    antiAliasing,
    tileDetail,
    shadows,
    globeLighting,
    showFps,
}: UseCesiumMapControlsOptions) => {
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed()) return;

        if (viewMode === 'navigation') {
            viewer.scene.morphTo2D(0.5);
        } else if (viewMode === 'radar') {
            viewer.scene.morphToColumbusView(0.5);
        } else {
            viewer.scene.morphTo3D(0.5);
        }
    }, [viewerRef, viewMode]);

    useEffect(() => {
        const handleAgentMapCommand = (event: Event) => {
            const customEvent = event as CustomEvent;
            const cmd = customEvent.detail;
            const viewer = viewerRef.current;
            if (!viewer || viewer.isDestroyed()) return;

            if (cmd.type === 'fly-to') {
                const { lat, lon, alt } = cmd;
                viewer.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(lon, lat, alt || 50000),
                    duration: 3
                });
            } else if (cmd.type === 'select-target') {
                const { id } = cmd;
                const allEntities = [...satellites, ...flights, ...earthquakes, ...military, ...vessels];
                const matched = allEntities.find(e => e.id === id);
                if (matched) {
                    setSelectedTarget(matched);
                    setTargetLocked(true);
                    viewer.camera.flyTo({
                        destination: Cesium.Cartesian3.fromDegrees(matched.position.lon, matched.position.lat, matched.position.alt || 50000),
                        duration: 3
                    });
                }
            } else if (cmd.type === 'toggle-layer') {
                const { layerId } = cmd;
                const store = useGTSMStore.getState();
                store.toggleLayer(layerId);
            }
        };

        window.addEventListener('agent-map-command', handleAgentMapCommand);
        return () => {
            window.removeEventListener('agent-map-command', handleAgentMapCommand);
        };
    }, [viewerRef, satellites, flights, earthquakes, military, vessels, setSelectedTarget, setTargetLocked]);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed()) return;

        let destroyed = false;

        viewer.imageryLayers.removeAll();

        if (googleTilesetRef.current) {
            try {
                viewer.scene.primitives.remove(googleTilesetRef.current);
            } catch (e) {
                console.error("[CesiumMapRenderer] Failed to remove google tileset primitive:", e);
            }
            googleTilesetRef.current = null;
        }

        if (imageryProvider === 'satellite') {
            viewer.imageryLayers.addImageryProvider(
                new Cesium.UrlTemplateImageryProvider({
                    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                })
            );
        } else if (imageryProvider === 'dark') {
            viewer.imageryLayers.addImageryProvider(
                new Cesium.OpenStreetMapImageryProvider({
                    url: "https://a.basemaps.cartocdn.com/dark_all/"
                })
            );
        } else if (imageryProvider === 'google-3d') {
            if (googleMapsApiKey && googleMapsApiKey.length >= 20) {
                Cesium.GoogleMaps.defaultApiKey = googleMapsApiKey;
                viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#050a0f');

                Cesium.createGooglePhotorealistic3DTileset({
                    onlyUsingWithGoogleGeocoder: true,
                    ...({ enableCollision: true } as Record<string, unknown>),
                }).then((tileset) => {
                    if (destroyed || imageryProvider !== 'google-3d') {
                        tileset.destroy();
                        return;
                    }
                    tileset.maximumScreenSpaceError = 32;
                    (tileset as any).maximumMemoryUsage = 1024;
                    viewer.scene.primitives.add(tileset);
                    googleTilesetRef.current = tileset;
                    viewer.scene.requestRender();
                }).catch((err) => {
                    if (!destroyed) {
                        console.error("[CesiumMapRenderer] Failed to load Google Photorealistic 3D Tileset:", err);
                    }
                });
            } else {
                viewer.imageryLayers.addImageryProvider(
                    new Cesium.OpenStreetMapImageryProvider({
                        url: "https://a.basemaps.cartocdn.com/dark_all/"
                    })
                );
            }
        } else {
            viewer.scene.globe.baseColor = Cesium.Color.BLACK;
        }

        return () => { destroyed = true; };
    }, [viewerRef, googleTilesetRef, imageryProvider, googleMapsApiKey]);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed() || !flyToRequest) return;

        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(
                flyToRequest.lon,
                flyToRequest.lat,
                flyToRequest.alt
            ),
            duration: 1.5,
        });

        setFlyToRequest(null);
    }, [viewerRef, flyToRequest, setFlyToRequest]);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed()) return;

        if (selectedTarget) {
            const primary = viewer.entities.getById('PRIMARY_TARGET');
            if (primary) {
                const pos = Cesium.Cartesian3.fromDegrees(selectedTarget.position.lon, selectedTarget.position.lat, selectedTarget.position.alt || 0);
                primary.position = pos as any;
                primary.label!.text = `${selectedTarget.metadata?.name || selectedTarget.metadata?.flight || selectedTarget.id}`.toUpperCase() as any;

                if (targetLocked) {
                    viewer.trackedEntity = primary;
                } else {
                    viewer.trackedEntity = undefined;
                }
            }
        } else {
            viewer.trackedEntity = undefined;
            const primary = viewer.entities.getById('PRIMARY_TARGET');
            if (primary) {
                primary.position = Cesium.Cartesian3.fromDegrees(-74.0060, 40.7128) as any;
                primary.label!.text = "SYNC_POINT" as any;
            }
        }
    }, [viewerRef, selectedTarget, targetLocked]);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed()) return;

        viewer.resolutionScale = resolutionScale;

        if (antiAliasing === 'fxaa') {
            viewer.scene.postProcessStages.fxaa.enabled = true;
            viewer.scene.msaaSamples = 1;
        } else if (antiAliasing === 'msaa') {
            viewer.scene.postProcessStages.fxaa.enabled = false;
            viewer.scene.msaaSamples = 4;
        } else {
            viewer.scene.postProcessStages.fxaa.enabled = false;
            viewer.scene.msaaSamples = 1;
        }

        viewer.scene.globe.maximumScreenSpaceError = tileDetail;
        viewer.shadows = shadows;
        viewer.scene.globe.enableLighting = globeLighting;
        viewer.scene.debugShowFramesPerSecond = showFps;
        viewer.scene.requestRender();
    }, [viewerRef, resolutionScale, antiAliasing, tileDetail, shadows, globeLighting, showFps]);
};
