/**
 * CesiumViewerFactory: Encapsulates Cesium.Viewer creation, scene
 * configuration, data-source registration, click handling, and camera
 * tracking. Keeps the React hook thin and testable.
 */
import * as Cesium from "cesium";

export interface CesiumDataSources {
    flights: Cesium.CustomDataSource;
    earthquakes: Cesium.CustomDataSource;
    vessels: Cesium.CustomDataSource;
    naturalEvents: Cesium.CustomDataSource;
    military: Cesium.CustomDataSource;
    connectors: Cesium.CustomDataSource;
    cables: Cesium.CustomDataSource;
    nuclear: Cesium.CustomDataSource;
}

export interface CesiumViewerCallbacks {
    setViewportCenter: (center: { lat: number; lon: number; alt: number }) => void;
    setSelectedTarget: (target: any) => void;
    setTargetLocked: (locked: boolean) => void;
    setExpandedHubId: React.Dispatch<React.SetStateAction<string | null>>;
}

export interface CesiumViewerInstance {
    viewer: Cesium.Viewer;
    handler: Cesium.ScreenSpaceEventHandler;
    dataSources: CesiumDataSources;
    dispose: () => void;
}

const DEFAULT_POSITION = { lon: -74.0060, lat: 40.7128 };

export function createCesiumViewer(
    container: HTMLDivElement,
    viewMode: string,
    callbacks: CesiumViewerCallbacks,
): CesiumViewerInstance {
    let destroyed = false;

    const viewer = new Cesium.Viewer(container, {
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
                powerPreference: "high-performance",
            },
        },
    });

    // ── Scene defaults ──
    const { scene } = viewer;
    scene.backgroundColor = Cesium.Color.fromCssColorString("#020202");
    scene.globe.baseColor = Cesium.Color.fromCssColorString("#050a0f");
    scene.globe.enableLighting = true;
    scene.highDynamicRange = true;
    scene.requestRenderMode = true;
    scene.maximumRenderTimeChange = Infinity;
    scene.fog.enabled = false;
    viewer.resolutionScale = 0.85;
    scene.globe.maximumScreenSpaceError = 3;

    if (viewMode === "navigation") {
        scene.morphTo2D(0);
    } else if (viewMode === "radar") {
        scene.morphToColumbusView(0);
    } else {
        scene.morphTo3D(0);
    }

    viewer.imageryLayers.addImageryProvider(
        new Cesium.OpenStreetMapImageryProvider({
            url: "https://a.basemaps.cartocdn.com/dark_all/",
        }),
    );

    // ── Data sources ──
    const flights = new Cesium.CustomDataSource("flights");
    const earthquakes = new Cesium.CustomDataSource("earthquakes");
    const vessels = new Cesium.CustomDataSource("vessels");
    const naturalEvents = new Cesium.CustomDataSource("naturalEvents");
    const military = new Cesium.CustomDataSource("military");
    const connectors = new Cesium.CustomDataSource("connectors");
    const cables = new Cesium.CustomDataSource("cables");
    const nuclear = new Cesium.CustomDataSource("nuclear");

    for (const ds of [flights, earthquakes, vessels, naturalEvents, military, connectors, cables, nuclear]) {
        viewer.dataSources.add(ds);
    }

    const dataSources: CesiumDataSources = {
        flights, earthquakes, vessels, naturalEvents,
        military, connectors, cables, nuclear,
    };

    // ── Camera tracking ──
    const updateCoords = () => {
        if (destroyed) return;
        const pos = viewer.camera.positionCartographic;
        if (pos) {
            callbacks.setViewportCenter({
                lat: Cesium.Math.toDegrees(pos.latitude),
                lon: Cesium.Math.toDegrees(pos.longitude),
                alt: pos.height,
            });
        }
    };
    viewer.camera.changed.addEventListener(updateCoords);
    viewer.camera.moveEnd.addEventListener(updateCoords);

    // ── Initial camera + primary target ──
    viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
            DEFAULT_POSITION.lon,
            DEFAULT_POSITION.lat,
            6_000_000,
        ),
        duration: 0,
    });

    viewer.entities.add({
        id: "PRIMARY_TARGET",
        position: Cesium.Cartesian3.fromDegrees(DEFAULT_POSITION.lon, DEFAULT_POSITION.lat),
        point: {
            pixelSize: 10,
            color: Cesium.Color.CYAN,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
        },
        label: {
            text: "SYNC_POINT",
            font: "8px JetBrains Mono, monospace",
            pixelOffset: new Cesium.Cartesian2(12, 0),
            fillColor: Cesium.Color.CYAN,
            showBackground: true,
            backgroundColor: new Cesium.Color(0, 0, 0, 0.7),
        },
    });

    // ── Click handler ──
    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((click: any) => {
        if (destroyed) return;

        const pickedObject = viewer.scene.pick(click.position);
        if (!Cesium.defined(pickedObject) || !pickedObject.id) {
            callbacks.setSelectedTarget(null);
            callbacks.setTargetLocked(false);
            return;
        }

        const picked = pickedObject.id;

        // Primitive-style pick (from EntityRenderer)
        if (picked && typeof picked === "object" && !(picked instanceof Cesium.Entity) && picked.type) {
            const primitiveId = picked as { id: string; type: string; properties: Record<string, any> };
            const bb = pickedObject.primitive;
            let pos = viewer.camera.positionCartographic;
            if (bb && bb.position) {
                pos = Cesium.Cartographic.fromCartesian(bb.position);
            }
            callbacks.setSelectedTarget({
                id: primitiveId.id,
                type: primitiveId.type as any,
                position: {
                    lat: Cesium.Math.toDegrees(pos.latitude),
                    lon: Cesium.Math.toDegrees(pos.longitude),
                    alt: pos.height,
                },
                velocity: primitiveId.properties?.velocity || 0,
                metadata: primitiveId.properties,
            });
            return;
        }

        // Standard Cesium entity pick
        const entity = picked as Cesium.Entity;
        if (entity.properties?.hasProperty("isHub") && entity.properties.isHub.getValue()) {
            callbacks.setExpandedHubId((prev) => (prev === entity.id ? null : entity.id));
            return;
        }

        if (entity.properties?.hasProperty("metadata")) {
            const type = entity.properties.type?.getValue();
            const metadata = entity.properties.metadata?.getValue();
            const position = Cesium.Cartographic.fromCartesian(
                entity.position?.getValue(viewer.clock.currentTime) || viewer.camera.position,
            );
            callbacks.setSelectedTarget({
                id: entity.id,
                type: type || "flight",
                position: {
                    lat: Cesium.Math.toDegrees(position.latitude),
                    lon: Cesium.Math.toDegrees(position.longitude),
                    alt: position.height,
                },
                velocity: metadata?.velocity || metadata?.velocity_mps || 0,
                metadata,
            });
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // ── Resize ──
    setTimeout(() => {
        if (!destroyed) viewer.resize();
    }, 50);

    const resizeObserver = new ResizeObserver(() => {
        if (!destroyed && !viewer.isDestroyed()) {
            viewer.resize();
        }
    });
    resizeObserver.observe(container);

    // ── Teardown ──
    function dispose() {
        destroyed = true;
        resizeObserver.disconnect();
        handler.destroy();
        if (!viewer.isDestroyed()) {
            viewer.destroy();
        }
    }

    return { viewer, handler, dataSources, dispose };
}
