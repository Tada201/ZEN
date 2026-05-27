import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import * as Cesium from 'cesium';
import { EntityService } from '../../../services/EntityService';
import type { CesiumDataSourcesRef, CesiumEntityServiceRef, CesiumHandlerRef, CesiumViewerRef } from './cesiumMapTypes';

interface UseCesiumViewerSetupOptions {
    containerRef: MutableRefObject<HTMLDivElement | null>;
    viewerRef: CesiumViewerRef;
    handlerRef: CesiumHandlerRef;
    dataSourcesRef: CesiumDataSourcesRef;
    entityServiceRef: CesiumEntityServiceRef;
    viewMode: string;
    setViewportCenter: (center: { lat: number; lon: number; alt: number }) => void;
    setSelectedTarget: (target: any) => void;
    setTargetLocked: (locked: boolean) => void;
    setExpandedHubId: Dispatch<SetStateAction<string | null>>;
}

export const useCesiumViewerSetup = ({
    containerRef,
    viewerRef,
    handlerRef,
    dataSourcesRef,
    entityServiceRef,
    viewMode,
    setViewportCenter,
    setSelectedTarget,
    setTargetLocked,
    setExpandedHubId,
}: UseCesiumViewerSetupOptions) => {
    useEffect(() => {
        if (!containerRef.current || viewerRef.current) return;

        const viewer = new Cesium.Viewer(containerRef.current, {
            animation: false,
            baseLayerPicker: false,
            fullscreenButton: false,
            geocoder: false,
            homeButton: false,
            infoBox: false,
            sceneModePicker: false,
            selectionIndicator: false,
            timeline: false,
            navigationHelpButton: false,
            navigationInstructionsInitiallyVisible: false,
            scene3DOnly: false,
            shouldAnimate: true,
            msaaSamples: 4,
            skyAtmosphere: new Cesium.SkyAtmosphere(),
            skyBox: new Cesium.SkyBox({ show: false }),
            contextOptions: {
                webgl: {
                    alpha: true,
                    antialias: true,
                    preserveDrawingBuffer: true,
                    powerPreference: "high-performance"
                },
            },
        });

        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#020202');
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#050a0f');
        viewer.scene.globe.enableLighting = true;
        viewer.scene.highDynamicRange = true;
        viewer.scene.requestRenderMode = true;
        viewer.scene.maximumRenderTimeChange = Infinity;
        viewer.scene.fog.enabled = false;
        viewer.resolutionScale = 0.85;
        viewer.scene.globe.maximumScreenSpaceError = 3;

        if (viewMode === 'navigation') {
            viewer.scene.morphTo2D(0);
        } else if (viewMode === 'radar') {
            viewer.scene.morphToColumbusView(0);
        } else {
            viewer.scene.morphTo3D(0);
        }

        viewer.imageryLayers.addImageryProvider(
            new Cesium.OpenStreetMapImageryProvider({
                url: "https://a.basemaps.cartocdn.com/dark_all/"
            })
        );

        const flightsDS = new Cesium.CustomDataSource('flights');
        const earthquakesDS = new Cesium.CustomDataSource('earthquakes');
        const vesselsDS = new Cesium.CustomDataSource('vessels');
        const naturalEventsDS = new Cesium.CustomDataSource('naturalEvents');
        const militaryDS = new Cesium.CustomDataSource('military');
        const connectorsDS = new Cesium.CustomDataSource('connectors');
        const cablesDS = new Cesium.CustomDataSource('cables');
        const nuclearDS = new Cesium.CustomDataSource('nuclear');

        viewer.dataSources.add(flightsDS);
        viewer.dataSources.add(earthquakesDS);
        viewer.dataSources.add(vesselsDS);
        viewer.dataSources.add(naturalEventsDS);
        viewer.dataSources.add(militaryDS);
        viewer.dataSources.add(connectorsDS);
        viewer.dataSources.add(cablesDS);
        viewer.dataSources.add(nuclearDS);

        dataSourcesRef.current = {
            flights: flightsDS,
            military: militaryDS,
            earthquakes: earthquakesDS,
            vessels: vesselsDS,
            naturalEvents: naturalEventsDS,
            connectors: connectorsDS,
            cables: cablesDS,
            nuclear: nuclearDS
        };

        entityServiceRef.current = new EntityService(viewer);

        import('../../../services/globe/EntityRenderer').then(({ initPrimitiveCollections }) => {
            initPrimitiveCollections(viewer);
        });

        const updateCoords = () => {
            if (viewer.isDestroyed()) return;
            const camera = viewer.camera;
            const position = camera.positionCartographic;
            if (position) {
                setViewportCenter({
                    lat: Cesium.Math.toDegrees(position.latitude),
                    lon: Cesium.Math.toDegrees(position.longitude),
                    alt: position.height
                });
            }
        };

        viewer.camera.changed.addEventListener(updateCoords);
        viewer.camera.moveEnd.addEventListener(updateCoords);

        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(-74.0060, 40.7128, 6000000),
            duration: 0
        });

        viewer.entities.add({
            id: 'PRIMARY_TARGET',
            position: Cesium.Cartesian3.fromDegrees(-74.0060, 40.7128),
            point: {
                pixelSize: 10,
                color: Cesium.Color.CYAN,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
            },
            label: {
                text: "SYNC_POINT",
                font: '8px JetBrains Mono, monospace',
                pixelOffset: new Cesium.Cartesian2(12, 0),
                fillColor: Cesium.Color.CYAN,
                showBackground: true,
                backgroundColor: new Cesium.Color(0, 0, 0, 0.7),
            }
        });

        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((click: any) => {
            if (viewer.isDestroyed()) return;
            const pickedObject = viewer.scene.pick(click.position);
            if (Cesium.defined(pickedObject) && pickedObject.id) {
                const picked = pickedObject.id;

                if (picked && typeof picked === 'object' && !(picked instanceof Cesium.Entity) && picked.type) {
                    const primitiveId = picked as { id: string; type: string; properties: Record<string, any> };
                    const bb = pickedObject.primitive;
                    let pos = viewer.camera.positionCartographic;
                    if (bb && bb.position) {
                        pos = Cesium.Cartographic.fromCartesian(bb.position);
                    }
                    setSelectedTarget({
                        id: primitiveId.id,
                        type: primitiveId.type as any,
                        position: {
                            lat: Cesium.Math.toDegrees(pos.latitude),
                            lon: Cesium.Math.toDegrees(pos.longitude),
                            alt: pos.height
                        },
                        velocity: primitiveId.properties?.velocity || 0,
                        metadata: primitiveId.properties
                    });
                } else {
                    const entity = picked as Cesium.Entity;
                    if (entity.properties && entity.properties.hasProperty('isHub') && entity.properties.isHub.getValue()) {
                        const hubId = entity.id;
                        setExpandedHubId(prev => prev === hubId ? null : hubId);
                        return;
                    }

                    if (entity.properties && entity.properties.hasProperty('metadata')) {
                        const type = entity.properties.type?.getValue();
                        const metadata = entity.properties.metadata?.getValue();
                        const position = Cesium.Cartographic.fromCartesian(
                            entity.position?.getValue(viewer.clock.currentTime) || viewer.camera.position
                        );
                        setSelectedTarget({
                            id: entity.id,
                            type: type || 'flight',
                            position: {
                                lat: Cesium.Math.toDegrees(position.latitude),
                                lon: Cesium.Math.toDegrees(position.longitude),
                                alt: position.height
                            },
                            velocity: metadata?.velocity || metadata?.velocity_mps || 0,
                            metadata
                        });
                    }
                }
            } else {
                setSelectedTarget(null);
                setTargetLocked(false);
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        handlerRef.current = handler;
        viewerRef.current = viewer;

        setTimeout(() => {
            if (!viewer.isDestroyed()) viewer.resize();
        }, 50);

        const resizeObserver = new ResizeObserver(() => {
            if (viewerRef.current && !viewerRef.current.isDestroyed()) {
                viewerRef.current.resize();
            }
        });
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        return () => {
            resizeObserver.disconnect();
            if (handlerRef.current) handlerRef.current.destroy();
            if (entityServiceRef.current) {
                entityServiceRef.current.dispose();
                entityServiceRef.current = null;
            }
            if (viewerRef.current && !viewerRef.current.isDestroyed()) {
                viewerRef.current.destroy();
            }
            viewerRef.current = null;
        };
    }, []);
};
