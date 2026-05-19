import React, { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { useGTSMStore } from '@/lib/stores/useGTSMStore';
import { EntityService } from '../../services/EntityService';

// Custom styles
import "cesium/Build/Cesium/Widgets/widgets.css";
import '../widgets/operational-map.css';

// SVGs for Icons Base64
const issSvg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <path d="M 4 10 L 4 4 L 10 4" fill="none" stroke="cyan" stroke-width="2" />
  <path d="M 28 10 L 28 4 L 22 4" fill="none" stroke="cyan" stroke-width="2" />
  <path d="M 4 22 L 4 28 L 10 28" fill="none" stroke="cyan" stroke-width="2" />
  <path d="M 28 22 L 28 28 L 22 28" fill="none" stroke="cyan" stroke-width="2" />
  <circle cx="16" cy="16" r="4" fill="none" stroke="cyan" stroke-width="2" />
  <circle cx="16" cy="16" r="2" fill="cyan" />
</svg>`;
const issIconUrl = 'data:image/svg+xml;base64,' + btoa(issSvg);


const boatSvg = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M 2 12 L 22 12 L 18 20 L 6 20 Z" fill="none" stroke="cyan" stroke-width="1.5"/>
</svg>`;
const boatIconUrl = 'data:image/svg+xml;base64,' + btoa(boatSvg);

const cargoSvg = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M 2 14 L 22 14 L 20 20 L 4 20 Z" fill="none" stroke="cyan" stroke-width="1.5"/>
  <rect x="6" y="10" width="12" height="4" fill="none" stroke="cyan" stroke-width="1.5"/>
</svg>`;
const cargoIconUrl = 'data:image/svg+xml;base64,' + btoa(cargoSvg);

const fishingSvg = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M 4 14 L 20 14 L 17 20 L 7 20 Z" fill="none" stroke="cyan" stroke-width="1.5"/>
  <line x1="12" y1="14" x2="12" y2="6" stroke="cyan" stroke-width="1.5"/>
</svg>`;
const fishingIconUrl = 'data:image/svg+xml;base64,' + btoa(fishingSvg);

const getVesselStyle = (type?: string) => {
    switch (type?.toLowerCase()) {
        case 'cargo':
            return { icon: cargoIconUrl, color: Cesium.Color.fromCssColorString('#00FF9F') };
        case 'tanker':
            return { icon: cargoIconUrl, color: Cesium.Color.fromCssColorString('#FFCC00') };
        case 'fishing':
            return { icon: fishingIconUrl, color: Cesium.Color.fromCssColorString('#FF00FF') };
        case 'passenger':
            return { icon: boatIconUrl, color: Cesium.Color.fromCssColorString('#FFFFFF') };
        case 'military':
            return { icon: boatIconUrl, color: Cesium.Color.fromCssColorString('#FF2266') };
        default:
            return { icon: boatIconUrl, color: Cesium.Color.fromCssColorString('#00CCFF') };
    }
};

const altitudeToColor = (alt?: number): string => {
    if (alt === undefined || alt <= 0) return "#22c55e";
    if (alt < 3000) return "#06b6d4";
    if (alt < 8000) return "#3b82f6";
    if (alt < 12000) return "#8b5cf6";
    return "#ec4899";
};

export const CesiumMapRenderer: React.FC = () => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const viewerRef = useRef<Cesium.Viewer | null>(null);
    const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);
    const googleTilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);
    const flightPositionsRef = useRef<Map<string, Cesium.SampledPositionProperty>>(new Map());
    const [expandedHubId, setExpandedHubId] = useState<string | null>(null);

    // GTSM states
    const satellites = useGTSMStore(state => state.satellites);
    const flights = useGTSMStore(state => state.flights);
    const earthquakes = useGTSMStore(state => state.earthquakes);
    const military = useGTSMStore(state => state.military);
    const vessels = useGTSMStore(state => state.vessels);

    const selectedLayers = useGTSMStore(state => state.selectedLayers);

    const targetLocked = useGTSMStore(state => state.targetLocked);
    const setTargetLocked = useGTSMStore(state => state.setTargetLocked);
    const setViewportCenter = useGTSMStore(state => state.setViewportCenter);
    const setSelectedTarget = useGTSMStore(state => state.setSelectedTarget);
    const selectedTarget = useGTSMStore(state => state.selectedTarget);
    const imageryProvider = useGTSMStore(state => state.imageryProvider);
    const googleMapsApiKey = useGTSMStore(state => state.googleMapsApiKey);
    const viewMode = useGTSMStore(state => state.viewMode);
    const viewportCenter = useGTSMStore(state => state.viewportCenter);

    const resolutionScale = useGTSMStore(state => state.resolutionScale);
    const antiAliasing = useGTSMStore(state => state.antiAliasing);
    const tileDetail = useGTSMStore(state => state.tileDetail);
    const shadows = useGTSMStore(state => state.shadows);
    const globeLighting = useGTSMStore(state => state.globeLighting);
    const showFps = useGTSMStore(state => state.showFps);

    // Group active map units for cluster & spider analysis
    const activeFlights = selectedLayers.includes('flights') ? flights : [];
    const activeVessels = selectedLayers.includes('vessels') ? vessels : [];
    const activeMilitary = selectedLayers.includes('military') ? military : [];

    const allClusteredUnits = React.useMemo(() => {
        const list = [
            ...activeFlights.map(f => ({ id: f.id, lat: f.position.lat, lon: f.position.lon, alt: f.position.alt || 0, type: 'flight' })),
            ...activeVessels.map(v => ({ id: v.id, lat: v.position.lat, lon: v.position.lon, alt: v.position.alt || 0, type: 'vessel' })),
            ...activeMilitary.map(m => ({ id: m.id, lat: m.position.lat, lon: m.position.lon, alt: m.position.alt || 0, type: 'military' }))
        ];

        const groupedIds = new Set<string>();
        const assignments = new Map<string, { hubId: string; offsetPos: Cesium.Cartesian3; isExpanded: boolean }>();
        const hubSet = new Set<string>();
        const hubChildCounts = new Map<string, number>();

        for (let i = 0; i < list.length; i++) {
            const u1 = list[i];
            if (groupedIds.has(u1.id)) continue;

            const group = [u1];
            for (let j = i + 1; j < list.length; j++) {
                const u2 = list[j];
                if (groupedIds.has(u2.id)) continue;

                const dist = Math.sqrt(Math.pow(u1.lat - u2.lat, 2) + Math.pow(u1.lon - u2.lon, 2));
                if (dist < 0.05) {
                    group.push(u2);
                    groupedIds.add(u2.id);
                }
            }

            if (group.length >= 2) {
                groupedIds.add(u1.id);
                const hub = group[0];
                hubSet.add(hub.id);
                hubChildCounts.set(hub.id, group.length);
                const isExpanded = expandedHubId === hub.id;

                group.forEach((item, index) => {
                    if (index === 0) return; // hub stays at center

                    if (isExpanded) {
                        const angle = (index / (group.length - 1)) * Math.PI * 2;
                        const offsetDist = 0.04; // degrees offset fanned out
                        const offsetLon = hub.lon + Math.cos(angle) * offsetDist;
                        const offsetLat = hub.lat + Math.sin(angle) * offsetDist;
                        assignments.set(item.id, {
                            hubId: hub.id,
                            offsetPos: Cesium.Cartesian3.fromDegrees(offsetLon, offsetLat, item.alt),
                            isExpanded: true
                        });
                    } else {
                        assignments.set(item.id, {
                            hubId: hub.id,
                            offsetPos: Cesium.Cartesian3.fromDegrees(hub.lon, hub.lat, item.alt),
                            isExpanded: false
                        });
                    }
                });
            }
        }

        return { assignments, hubSet, hubChildCounts };
    }, [activeFlights, activeVessels, activeMilitary, expandedHubId]);

    // References for entity tracking to prevent recreation stutter
    const entityIdsRef = useRef<{
        flights: Set<string>;
        earthquakes: Set<string>;
        military: Set<string>;
        vessels: Set<string>;
        naturalEvents: Set<string>;
    }>({
        flights: new Set(),
        earthquakes: new Set(),
        military: new Set(),
        vessels: new Set(),
        naturalEvents: new Set(),
    });

    const dataSourcesRef = useRef<{
        flights: Cesium.CustomDataSource | null;
        military: Cesium.CustomDataSource | null;
        earthquakes: Cesium.CustomDataSource | null;
        vessels: Cesium.CustomDataSource | null;
        naturalEvents: Cesium.CustomDataSource | null;
        connectors: Cesium.CustomDataSource | null;
        cables: Cesium.CustomDataSource | null;
        nuclear: Cesium.CustomDataSource | null;
    }>({
        flights: null,
        military: null,
        earthquakes: null,
        vessels: null,
        naturalEvents: null,
        connectors: null,
        cables: null,
        nuclear: null
    });

    const entityServiceRef = useRef<EntityService | null>(null);


    // 1. Initialize viewer, data sources, and raw primitive collections
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

        // Set void styling for eDEX style HUD aesthetics
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#020202');
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#050a0f');
        viewer.scene.globe.enableLighting = true;
        viewer.scene.highDynamicRange = true;
        viewer.scene.requestRenderMode = true;
        viewer.scene.maximumRenderTimeChange = Infinity;
        viewer.scene.fog.enabled = false;

        // Core FPS & WebGL Performance Tuning
        viewer.resolutionScale = 0.85; // Scales down full-screen WebGL pixel rendering load by ~28%, drastically increasing FPS
        viewer.scene.globe.maximumScreenSpaceError = 3; // Renders slightly lighter terrain geometry grids to save GPU cycles

        // Custom view mode morphing
        if (viewMode === 'navigation') {
            viewer.scene.morphTo2D(0);
        } else if (viewMode === 'radar') {
            viewer.scene.morphToColumbusView(0);
        } else {
            viewer.scene.morphTo3D(0);
        }

        // Initialize imagery providers
        viewer.imageryLayers.addImageryProvider(
            new Cesium.OpenStreetMapImageryProvider({
                url: "https://a.basemaps.cartocdn.com/dark_all/"
            })
        );

        // Separated custom datasources
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

        // Initialize primitive collections via our new EntityService engine
        import('../../services/globe/EntityRenderer').then(({ initPrimitiveCollections }) => {
            initPrimitiveCollections(viewer);
        });


        // Datalink center synchronization
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

        // Default initial camera point
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(-74.0060, 40.7128, 6000000),
            duration: 0
        });

        // Add visual target ring marker
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

        // Screen selection interaction click listener
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

        // Force viewport resize trigger
        setTimeout(() => {
            if (!viewer.isDestroyed()) viewer.resize();
        }, 50);

        // Set up ResizeObserver to handle sidebar/panel resize transitions flawlessly
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

    // 2. React to dynamic view mode switcher (2D / 3D / Columbus)
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
    }, [viewMode]);

    // 2.5 Agent-Map Command Bridge (AI Piloting)
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
    }, [satellites, flights, earthquakes, military, vessels, setSelectedTarget, setTargetLocked]);

    // 3. React to imagery provider changes
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed()) return;

        viewer.imageryLayers.removeAll();

        // 1. Clean up Google 3D Tiles if active and changing to another layer
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
                
                // Set default void/dark base color so space and gaps blend beautifully
                viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#050a0f');

                Cesium.createGooglePhotorealistic3DTileset({
                    onlyUsingWithGoogleGeocoder: true,
                    ...({ enableCollision: true } as Record<string, unknown>),
                }).then((tileset) => {
                    if (viewer.isDestroyed() || imageryProvider !== 'google-3d') {
                        tileset.destroy();
                        return;
                    }
                    tileset.maximumScreenSpaceError = 32; // Double the allowable Screen Space Error (from 16 to 32) to load lower-LOD structures, preventing stutters
                    (tileset as any).maximumMemoryUsage = 1024; // Capping VRAM usage to 1024MB to avoid VRAM paging lag
                    viewer.scene.primitives.add(tileset);
                    googleTilesetRef.current = tileset;
                    viewer.scene.requestRender();
                }).catch((err) => {
                    console.error("[CesiumMapRenderer] Failed to load Google Photorealistic 3D Tileset:", err);
                });
            } else {
                // Fallback to dark tiles if key is not configured/pasted
                viewer.imageryLayers.addImageryProvider(
                    new Cesium.OpenStreetMapImageryProvider({
                        url: "https://a.basemaps.cartocdn.com/dark_all/"
                    })
                );
            }
        } else {
            // solid black styling
            viewer.scene.globe.baseColor = Cesium.Color.BLACK;
        }
    }, [imageryProvider, googleMapsApiKey]);

    // 4. Dynamic Satellites Layer Sync
    useEffect(() => {
        if (!viewerRef.current || !entityServiceRef.current) return;

        const viewer = viewerRef.current;
        const service = entityServiceRef.current;

        if (!selectedLayers.includes('satellites')) {
            service.clearEntities('satellite');
            return;
        }

        const formattedSatellites = satellites.map(sat => {
            const isIss = sat.id.toLowerCase().includes('iss');
            return {
                entity: {
                    id: sat.id,
                    latitude: sat.position.lat,
                    longitude: sat.position.lon,
                    altitude: sat.position.alt
                },
                options: isIss ? {
                    type: "billboard" as const,
                    iconUrl: issIconUrl,
                    iconScale: 0.8,
                    color: "cyan"
                } : {
                    type: "point" as const,
                    size: 3,
                    color: "rgba(0, 220, 220, 0.8)"
                }
            };
        });

        service.renderEntities(formattedSatellites, 'satellite');
        viewer.scene.requestRender();
    }, [satellites, selectedLayers]);


    // 4.5 Dynamic Tactical Link Connectors (Spider Tethers)
    useEffect(() => {
        const viewer = viewerRef.current;
        const ds = dataSourcesRef.current.connectors;
        if (!viewer || viewer.isDestroyed() || !ds) return;

        ds.entities.suspendEvents();
        ds.entities.removeAll();

        if (expandedHubId) {
            const allUnits = [
                ...flights.map(f => ({ id: f.id, lat: f.position.lat, lon: f.position.lon, alt: f.position.alt || 0 })),
                ...vessels.map(v => ({ id: v.id, lat: v.position.lat, lon: v.position.lon, alt: v.position.alt || 0 })),
                ...military.map(m => ({ id: m.id, lat: m.position.lat, lon: m.position.lon, alt: m.position.alt || 0 }))
            ];
            const hub = allUnits.find(u => u.id === expandedHubId);

            if (hub) {
                const hubPos = Cesium.Cartesian3.fromDegrees(hub.lon, hub.lat, hub.alt);
                
                allClusteredUnits.assignments.forEach((assign) => {
                    if (assign.hubId === expandedHubId && assign.isExpanded) {
                        ds.entities.add({
                            polyline: {
                                positions: [hubPos, assign.offsetPos],
                                width: 1.5,
                                material: new Cesium.PolylineDashMaterialProperty({
                                    color: Cesium.Color.fromCssColorString('rgba(0, 255, 247, 0.75)'),
                                    dashLength: 6.0
                                })
                            }
                        });
                    }
                });
            }
        }

        ds.entities.resumeEvents();
        viewer.scene.requestRender();
    }, [flights, vessels, military, expandedHubId, allClusteredUnits]);

    // 5. Dynamic Flights Layer Sync
    useEffect(() => {
        const ds = dataSourcesRef.current.flights;
        const viewer = viewerRef.current;
        if (!ds || !viewer) return;

        ds.entities.suspendEvents();
        const prev = entityIdsRef.current.flights;
        const next = new Set<string>();

        const showFlights = selectedLayers.includes('flights');

        if (showFlights) {
            flights.forEach(f => {
                const eid = f.id;
                next.add(eid);

                const isSelected = selectedTarget?.id === eid;
                const isClose = viewportCenter.alt < 80000;
                const isAirborne = f.position.alt && f.position.alt > 100;
                
                // 1. Resolve final position (with spiderification offsets)
                const assign = allClusteredUnits.assignments.get(eid);
                const isHub = allClusteredUnits.hubSet.has(eid);
                const childCount = allClusteredUnits.hubChildCounts.get(eid) || 0;

                let rawPos = Cesium.Cartesian3.fromDegrees(f.position.lon, f.position.lat, f.position.alt || 0);
                if (assign) {
                    rawPos = assign.offsetPos;
                }

                // Update sample history
                let property = flightPositionsRef.current.get(eid);
                if (!property) {
                    property = new Cesium.SampledPositionProperty();
                    property.backwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
                    property.forwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
                    flightPositionsRef.current.set(eid, property);
                }
                const time = Cesium.JulianDate.now();
                property.addSample(time, rawPos);

                const flightColor = Cesium.Color.fromCssColorString(altitudeToColor(f.position.alt));
                const showChild = !assign || assign.isExpanded;
                const shouldShowGltf = isAirborne && (isSelected || isClose) && showChild;

                const existing = ds.entities.getById(eid);
                if (existing) {
                    existing.position = property as any;
                    existing.properties = { metadata: f.metadata, type: f.type, isHub: isHub, childCount } as any;

                    if (shouldShowGltf) {
                        existing.point = undefined as any;
                        existing.model = {
                            uri: '/airplane/scene.gltf',
                            scale: isSelected ? 4.0 : 2.5,
                            minimumPixelSize: 16,
                            maximumScale: 50,
                            silhouetteColor: Cesium.Color.CYAN,
                            silhouetteSize: isSelected ? 1.0 : 0.0,
                            heightReference: Cesium.HeightReference.NONE
                        } as any;

                        const heading = Cesium.Math.toRadians(parseFloat(f.metadata?.heading || f.metadata?.track || f.metadata?.course) || 0);
                        const hpr = new Cesium.HeadingPitchRoll(heading - Math.PI, 0, 0);
                        existing.orientation = Cesium.Transforms.headingPitchRollQuaternion(rawPos, hpr) as any;

                        existing.path = {
                            show: isSelected,
                            width: 2.5,
                            material: new Cesium.PolylineGlowMaterialProperty({
                                glowPower: 0.25,
                                color: Cesium.Color.CYAN
                            }),
                            leadTime: 0,
                            trailTime: 180
                        } as any;
                    } else {
                        existing.model = undefined as any;
                        existing.orientation = undefined as any;
                        existing.path = undefined as any;
                        existing.point = {
                            show: showChild,
                            pixelSize: isAirborne ? 6 : 4,
                            color: isHub ? Cesium.Color.CYAN : flightColor,
                            outlineColor: isHub ? Cesium.Color.WHITE : Cesium.Color.BLACK,
                            outlineWidth: isHub ? 2 : 1,
                        } as any;
                    }

                    if (existing.label) {
                        existing.label.show = showChild as any;
                        existing.label.text = (isHub 
                            ? `[CLUSTER HUB] ${f.metadata.flight?.trim() || eid} (${childCount} TARGETS)` 
                            : (f.metadata.flight?.trim() || f.metadata.registration || f.metadata.hex || eid)) as any;
                    }
                } else {
                    const entityOptions: Cesium.Entity.ConstructorOptions = {
                        id: eid,
                        position: property,
                        properties: { metadata: f.metadata, type: f.type, isHub: isHub, childCount },
                        label: {
                            show: showChild,
                            text: isHub 
                                ? `[CLUSTER HUB] ${f.metadata.flight?.trim() || eid} (${childCount} TARGETS)` 
                                : (f.metadata.flight?.trim() || f.metadata.registration || f.metadata.hex || eid),
                            font: '8px JetBrains Mono, monospace',
                            fillColor: isHub ? Cesium.Color.CYAN : flightColor,
                            pixelOffset: new Cesium.Cartesian2(0, -12),
                            showBackground: true,
                            backgroundColor: new Cesium.Color(0, 0, 0, 0.7),
                            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1500000)
                        }
                    };

                    if (shouldShowGltf) {
                        entityOptions.model = {
                            uri: '/airplane/scene.gltf',
                            scale: isSelected ? 4.0 : 2.5,
                            minimumPixelSize: 16,
                            maximumScale: 50,
                            silhouetteColor: Cesium.Color.CYAN,
                            silhouetteSize: isSelected ? 1.0 : 0.0,
                            heightReference: Cesium.HeightReference.NONE
                        };

                        const heading = Cesium.Math.toRadians(parseFloat(f.metadata?.heading || f.metadata?.track || f.metadata?.course) || 0);
                        const hpr = new Cesium.HeadingPitchRoll(heading - Math.PI, 0, 0);
                        entityOptions.orientation = Cesium.Transforms.headingPitchRollQuaternion(rawPos, hpr);

                        entityOptions.path = {
                            show: isSelected,
                            width: 2.5,
                            material: new Cesium.PolylineGlowMaterialProperty({
                                glowPower: 0.25,
                                color: Cesium.Color.CYAN
                            }),
                            leadTime: 0,
                            trailTime: 180
                        };
                    } else {
                        entityOptions.point = {
                            show: showChild,
                            pixelSize: isAirborne ? 6 : 4,
                            color: isHub ? Cesium.Color.CYAN : flightColor,
                            outlineColor: isHub ? Cesium.Color.WHITE : Cesium.Color.BLACK,
                            outlineWidth: isHub ? 2 : 1,
                        };
                    }

                    ds.entities.add(entityOptions);
                }
            });
        }

        prev.forEach(id => {
            if (!next.has(id)) {
                ds.entities.removeById(id);
                flightPositionsRef.current.delete(id);
            }
        });
        entityIdsRef.current.flights = next;
        ds.entities.resumeEvents();
        viewerRef.current?.scene.requestRender();
    }, [flights, selectedLayers, selectedTarget, viewportCenter, allClusteredUnits]);

    // 6. Dynamic Earthquakes Layer Sync
    useEffect(() => {
        const ds = dataSourcesRef.current.earthquakes;
        if (!ds) return;

        ds.entities.suspendEvents();
        const prev = entityIdsRef.current.earthquakes;
        const next = new Set<string>();

        const showEarthquakes = selectedLayers.includes('earthquakes');

        if (showEarthquakes) {
            earthquakes.forEach(eq => {
                const eid = eq.id;
                next.add(eid);
                const pos = Cesium.Cartesian3.fromDegrees(eq.position.lon, eq.position.lat, eq.position.alt || 0);

                const existing = ds.entities.getById(eid);
                if (existing) {
                    existing.position = pos as any;
                    existing.properties = { metadata: eq.metadata, type: eq.type } as any;
                } else {
                    const mag = parseFloat(eq.metadata?.mag) || 4.0;
                    const size = Math.max(8, mag * 3);

                    ds.entities.add({
                        id: eid,
                        position: pos,
                        properties: { metadata: eq.metadata, type: eq.type },
                        point: {
                            pixelSize: size,
                            color: Cesium.Color.fromCssColorString('rgba(255, 34, 102, 0.7)'),
                            outlineColor: Cesium.Color.BLACK,
                            outlineWidth: 1.5,
                        },
                        label: {
                            text: `M${mag.toFixed(1)}`,
                            font: 'bold 8px JetBrains Mono, monospace',
                            fillColor: Cesium.Color.fromCssColorString('#FF2266'),
                            pixelOffset: new Cesium.Cartesian2(0, -12),
                            showBackground: true,
                            backgroundColor: new Cesium.Color(0, 0, 0, 0.7),
                            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000000)
                        }
                    });
                }
            });
        }

        prev.forEach(id => {
            if (!next.has(id)) ds.entities.removeById(id);
        });
        entityIdsRef.current.earthquakes = next;
        ds.entities.resumeEvents();
        viewerRef.current?.scene.requestRender();
    }, [earthquakes, selectedLayers]);

    // 7. Dynamic AIS Vessels Layer Sync
    useEffect(() => {
        const ds = dataSourcesRef.current.vessels;
        if (!ds) return;

        ds.entities.suspendEvents();
        const prev = entityIdsRef.current.vessels;
        const next = new Set<string>();

        const showVessels = selectedLayers.includes('vessels');

        if (showVessels) {
            vessels.forEach(v => {
                const eid = v.id;
                next.add(eid);

                const assign = allClusteredUnits.assignments.get(eid);
                const isHub = allClusteredUnits.hubSet.has(eid);
                const childCount = allClusteredUnits.hubChildCounts.get(eid) || 0;

                let pos = Cesium.Cartesian3.fromDegrees(v.position.lon, v.position.lat);
                if (assign) {
                    pos = assign.offsetPos;
                }

                const style = getVesselStyle(v.metadata?.type);
                const showChild = !assign || assign.isExpanded;

                const existing = ds.entities.getById(eid);
                if (existing) {
                    existing.position = pos as any;
                    existing.properties = { metadata: v.metadata, type: v.type, isHub: isHub, childCount } as any;
                    if (existing.billboard) {
                        existing.billboard.show = showChild as any;
                        existing.billboard.color = (isHub ? Cesium.Color.CYAN : style.color) as any;
                    }
                    if (existing.label) {
                        existing.label.show = showChild as any;
                        existing.label.text = (isHub 
                            ? `[CLUSTER HUB] ${v.metadata?.name || eid} (${childCount} VESSELS)` 
                            : (v.metadata?.name || eid)) as any;
                        existing.label.fillColor = (isHub ? Cesium.Color.CYAN : style.color) as any;
                    }
                } else {
                    ds.entities.add({
                        id: eid,
                        position: pos,
                        properties: { metadata: v.metadata, type: v.type, isHub: isHub, childCount },
                        billboard: {
                            show: showChild,
                            image: style.icon,
                            width: 14,
                            height: 14,
                            color: isHub ? Cesium.Color.CYAN : style.color
                        },
                        label: {
                            show: showChild,
                            text: isHub 
                                ? `[CLUSTER HUB] ${v.metadata?.name || eid} (${childCount} VESSELS)` 
                                : (v.metadata?.name || eid),
                            font: '8px JetBrains Mono, monospace',
                            fillColor: isHub ? Cesium.Color.CYAN : style.color,
                            pixelOffset: new Cesium.Cartesian2(0, -12),
                            showBackground: true,
                            backgroundColor: new Cesium.Color(0, 0, 0, 0.8),
                            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 800000)
                        }
                    });
                }
            });
        }

        prev.forEach(id => {
            if (!next.has(id)) ds.entities.removeById(id);
        });
        entityIdsRef.current.vessels = next;
        ds.entities.resumeEvents();
        viewerRef.current?.scene.requestRender();
    }, [vessels, selectedLayers, allClusteredUnits]);

    // 8. Dynamic Military Air Layer Sync
    useEffect(() => {
        const ds = dataSourcesRef.current.military;
        if (!ds) return;

        ds.entities.suspendEvents();
        const prev = entityIdsRef.current.military;
        const next = new Set<string>();

        const showMilitary = selectedLayers.includes('military');

        if (showMilitary) {
            military.forEach(m => {
                const eid = m.id;
                next.add(eid);

                const assign = allClusteredUnits.assignments.get(eid);
                const isHub = allClusteredUnits.hubSet.has(eid);
                const childCount = allClusteredUnits.hubChildCounts.get(eid) || 0;

                let position = Cesium.Cartesian3.fromDegrees(m.position.lon, m.position.lat, m.position.alt || 0);
                if (assign) {
                    position = assign.offsetPos;
                }

                const isAirborne = m.position.alt && m.position.alt > 0;
                const flightColor = Cesium.Color.fromCssColorString('#FFCC00'); // Amber
                const showChild = !assign || assign.isExpanded;

                const existing = ds.entities.getById(eid);
                if (existing) {
                    existing.position = position as any;
                    existing.properties = { metadata: m.metadata, type: m.type, isHub: isHub, childCount } as any;
                    if (existing.point) {
                        existing.point.show = showChild as any;
                        existing.point.color = (isHub ? Cesium.Color.CYAN : flightColor) as any;
                        existing.point.outlineColor = (isHub ? Cesium.Color.WHITE : Cesium.Color.BLACK) as any;
                        existing.point.outlineWidth = (isHub ? 2 : 1) as any;
                    }
                    if (existing.label) {
                        existing.label.show = showChild as any;
                        existing.label.text = (isHub 
                            ? `[CLUSTER HUB] ${m.metadata.flight?.trim() || eid} (${childCount} TARGETS)` 
                            : (m.metadata.flight?.trim() || m.metadata.registration || m.metadata.hex || eid)) as any;
                        existing.label.fillColor = (isHub ? Cesium.Color.CYAN : flightColor) as any;
                    }
                } else {
                    ds.entities.add({
                        id: eid,
                        position: position,
                        properties: { metadata: m.metadata, type: m.type, isHub: isHub, childCount },
                        point: {
                            show: showChild,
                            pixelSize: isAirborne ? 7 : 5,
                            color: isHub ? Cesium.Color.CYAN : flightColor,
                            outlineColor: isHub ? Cesium.Color.WHITE : Cesium.Color.BLACK,
                            outlineWidth: isHub ? 2 : 1,
                        },
                        label: {
                            show: showChild,
                            text: isHub 
                                ? `[CLUSTER HUB] ${m.metadata.flight?.trim() || eid} (${childCount} TARGETS)` 
                                : (m.metadata.flight?.trim() || m.metadata.registration || m.metadata.hex || eid),
                            font: '8px JetBrains Mono, monospace',
                            fillColor: isHub ? Cesium.Color.CYAN : flightColor,
                            pixelOffset: new Cesium.Cartesian2(0, -12),
                            showBackground: true,
                            backgroundColor: new Cesium.Color(0, 0, 0, 0.7),
                            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1500000)
                        }
                    });
                }
            });
        }

        prev.forEach(id => {
            if (!next.has(id)) ds.entities.removeById(id);
        });
        entityIdsRef.current.military = next;
        ds.entities.resumeEvents();
        viewerRef.current?.scene.requestRender();
    }, [military, selectedLayers, allClusteredUnits]);

    // 9. Camera fly-to and tracking sync
    const flyToRequest = useGTSMStore(state => state.flyToRequest);
    const setFlyToRequest = useGTSMStore(state => state.setFlyToRequest);

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
    }, [flyToRequest, setFlyToRequest]);

    // 10. Selected Entity Camera Lock tracking
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
    }, [selectedTarget, targetLocked]);

    // 11. Selected Satellite Orbital Path & Sensor Footprint Sweeper
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed()) return;

        // Clean up previous orbital path and footprint
        const oldOrbit = viewer.entities.getById('ORBITAL_PATH');
        if (oldOrbit) viewer.entities.remove(oldOrbit);

        const oldFootprint = viewer.entities.getById('SENSOR_FOOTPRINT');
        if (oldFootprint) viewer.entities.remove(oldFootprint);

        if (!selectedTarget) return;

        const isSatellite = selectedTarget.id.toLowerCase().includes('sat') || satellites.some(s => s.id === selectedTarget.id);

        if (isSatellite) {
            const alt = selectedTarget.position.alt || 420000; // default 420km orbit altitude (e.g. ISS)
            const pos = Cesium.Cartesian3.fromDegrees(selectedTarget.position.lon, selectedTarget.position.lat, alt);

            // Compute orbit plane normal orthogonal to current satellite position
            const x = pos.x, y = pos.y, z = pos.z;
            const u_raw_x = -y, u_raw_y = x;
            const u_len = Math.sqrt(u_raw_x * u_raw_x + u_raw_y * u_raw_y);
            
            if (u_len > 0.001) {
                const ux = u_raw_x / u_len, uy = u_raw_y / u_len, uz = 0;

                // Cross product w = u x pos
                const wx = uy * z - uz * y;
                const wy = uz * x - ux * z;
                const wz = ux * y - uy * x;

                const orbitPoints: Cesium.Cartesian3[] = [];
                for (let i = 0; i <= 72; i++) {
                    const theta = (i * 5 * Math.PI) / 180;
                    const rotX = x * Math.cos(theta) + wx * Math.sin(theta);
                    const rotY = y * Math.cos(theta) + wy * Math.sin(theta);
                    const rotZ = z * Math.cos(theta) + wz * Math.sin(theta);
                    orbitPoints.push(new Cesium.Cartesian3(rotX, rotY, rotZ));
                }

                // Add highly stylized glowing orbital path
                viewer.entities.add({
                    id: 'ORBITAL_PATH',
                    polyline: {
                        positions: orbitPoints,
                        width: 1.5,
                        material: new Cesium.PolylineGlowMaterialProperty({
                            glowPower: 0.2,
                            color: Cesium.Color.fromCssColorString('rgba(0, 240, 240, 0.85)')
                        })
                    }
                });

                // Add transparent conical visual sensor sweep down to Earth
                const groundPos = Cesium.Cartesian3.fromDegrees(selectedTarget.position.lon, selectedTarget.position.lat, 0);
                const centerPos = Cesium.Cartesian3.midpoint(pos, groundPos, new Cesium.Cartesian3());

                viewer.entities.add({
                    id: 'SENSOR_FOOTPRINT',
                    position: centerPos as any,
                    cylinder: {
                        length: alt,
                        topRadius: 0.0,
                        bottomRadius: 350000.0, // 350km footprint coverage
                        material: Cesium.Color.fromCssColorString('rgba(0, 240, 240, 0.08)'),
                        outline: true,
                        outlineColor: Cesium.Color.fromCssColorString('rgba(0, 240, 240, 0.3)'),
                        numberOfVerticalLines: 12
                    }
                });
            }
        }
    }, [selectedTarget, satellites]);

    // 12. Dynamic Undersea Cables Layer Sync
    useEffect(() => {
        const viewer = viewerRef.current;
        const ds = dataSourcesRef.current.cables;
        if (!viewer || viewer.isDestroyed() || !ds) return;

        ds.entities.suspendEvents();
        ds.entities.removeAll();

        if (!selectedLayers.includes('cables')) {
            ds.entities.resumeEvents();
            return;
        }

        // Fetch submarine cable map GeoJSON
        fetch("https://www.submarinecablemap.com/api/v3/cable/cable-geo.json")
            .then(res => {
                if (!res.ok) throw new Error("CORS or network error");
                return res.json();
            })
            .then(geoJson => {
                if (viewer.isDestroyed() || !selectedLayers.includes('cables')) return;
                
                // Load parsed GeoJSON into custom datasource
                Cesium.GeoJsonDataSource.load(geoJson, {
                    stroke: Cesium.Color.fromCssColorString('rgba(0, 240, 180, 0.75)'),
                    strokeWidth: 2,
                    clampToGround: true
                }).then(loadedDs => {
                    if (viewer.isDestroyed() || !selectedLayers.includes('cables')) return;
                    
                    // Copy entities to our datasource for consistent lifecycle
                    loadedDs.entities.values.forEach(entity => {
                        // Apply custom glowing fiber styling to polylines
                        if (entity.polyline) {
                            entity.polyline.width = 1.5 as any;
                            entity.polyline.material = new Cesium.PolylineGlowMaterialProperty({
                                glowPower: 0.15,
                                color: Cesium.Color.fromCssColorString('rgba(0, 240, 180, 0.85)')
                            }) as any;
                        }
                        ds.entities.add(entity);
                    });
                    viewer.scene.requestRender();
                });
            })
            .catch(err => {
                console.warn("[CesiumMapRenderer] Undersea cables fetch failed, using fallback high-traffic lanes:", err);
                
                // Fallback transoceanic cables for ultimate robustness & offline support
                const fallbacks = [
                    // AC-1 (Transatlantic): USA to UK/Germany
                    { name: "Atlantic Crossing 1 (AC-1)", coords: [[-74.0060, 40.7128], [-4.2181, 50.7978], [8.6821, 50.1109]] },
                    // Unity (Transpacific): USA to Japan
                    { name: "Unity / EGRT", coords: [[-124.0444, 45.3675], [140.8550, 35.7000]] },
                    // SJC (Saigon / Singapore / HK / Japan): Vietnam HQ connector!
                    { name: "Southeast Asia-Japan Cable (SJC)", coords: [[106.6602, 10.7626], [103.8519, 1.2902], [114.1694, 22.3193], [139.6917, 35.6895]] },
                    // SMW3 (Europe-Asia): Singapore to India to France
                    { name: "SeaMeWe-3 Segment", coords: [[103.8519, 1.2902], [80.2707, 13.0827], [31.2357, 30.0444], [5.4083, 43.2965]] }
                ];

                fallbacks.forEach(cable => {
                    const positions = cable.coords.map(c => Cesium.Cartesian3.fromDegrees(c[0], c[1], 0));
                    ds.entities.add({
                        name: cable.name,
                        polyline: {
                            positions: positions,
                            width: 1.5,
                            material: new Cesium.PolylineGlowMaterialProperty({
                                glowPower: 0.15,
                                color: Cesium.Color.fromCssColorString('rgba(0, 240, 180, 0.85)')
                            }),
                            clampToGround: true
                        }
                    });
                });
                viewer.scene.requestRender();
            })
            .finally(() => {
                ds.entities.resumeEvents();
            });
    }, [selectedLayers]);

    // 13. Dynamic Nuclear Facilities Layer Sync
    useEffect(() => {
        const viewer = viewerRef.current;
        const ds = dataSourcesRef.current.nuclear;
        if (!viewer || viewer.isDestroyed() || !ds) return;

        ds.entities.suspendEvents();
        ds.entities.removeAll();

        if (!selectedLayers.includes('nuclear')) {
            ds.entities.resumeEvents();
            return;
        }

        // Global list of the most prominent nuclear stations
        const nuclearStations = [
            { id: "cher", name: "Chernobyl Nuclear Station", country: "Ukraine", status: "Decommissioned / Entombed", coords: [30.0997, 51.3896], desc: "Site of the 1986 containment rupture." },
            { id: "fuku", name: "Fukushima Daiichi", country: "Japan", status: "Active Clean-up", coords: [141.0328, 37.4211], desc: "Currently undergoing decommissioning." },
            { id: "thre", name: "Three Mile Island", country: "United States", status: "Unit 1 Shutdown / Unit 2 Inactive", coords: [-76.7247, 40.1542], desc: "Site of the 1979 partial core melt." },
            { id: "zapo", name: "Zaporizhzhia Station", country: "Ukraine", status: "Cold Shutdown", coords: [34.5858, 47.5122], desc: "Europe's largest nuclear generating facility." },
            { id: "palo", name: "Palo Verde Generating Station", country: "United States", status: "Fully Operational", coords: [-112.8683, 33.3964], desc: "Largest power station in the United States by net generation." },
            { id: "bruc", name: "Bruce Power Station", country: "Canada", status: "Fully Operational", coords: [-81.5982, 44.3241], desc: "Second largest nuclear facility in the world." },
            { id: "hanb", name: "Hanbit Nuclear Station", country: "South Korea", status: "Fully Operational", coords: [126.4172, 35.4147], desc: "High-yield multi-reactor generating facility." },
            { id: "grav", name: "Gravelines Station", country: "France", status: "Fully Operational", coords: [2.1360, 51.0150], desc: "One of Europe's largest generating capacities." },
            { id: "kash", name: "Kashiwazaki-Kariwa Station", country: "Japan", status: "Restarting Phase", coords: [138.5969, 37.4286], desc: "Largest nuclear generating station in the world." },
            { id: "catt", name: "Cattenom Generating Station", country: "France", status: "Fully Operational", coords: [6.2181, 49.4158], desc: "Major French atomic power plant." }
        ];

        nuclearStations.forEach(station => {
            const pos = Cesium.Cartesian3.fromDegrees(station.coords[0], station.coords[1], 0);

            // Yellow radioactive warning color
            const neonYellow = Cesium.Color.fromCssColorString('#E6C300');

            ds.entities.add({
                id: `nuclear_${station.id}`,
                position: pos,
                properties: { 
                    metadata: {
                        name: station.name,
                        country: station.country,
                        status: station.status,
                        details: station.desc,
                        type: 'nuclear'
                    }
                },
                point: {
                    pixelSize: 8,
                    color: neonYellow,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 2
                },
                label: {
                    text: station.name.toUpperCase(),
                    font: '8px JetBrains Mono, monospace',
                    fillColor: neonYellow,
                    pixelOffset: new Cesium.Cartesian2(0, -12),
                    showBackground: true,
                    backgroundColor: new Cesium.Color(0, 0, 0, 0.8),
                    distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3000000)
                }
            });
        });

        ds.entities.resumeEvents();
        viewer.scene.requestRender();
    }, [selectedLayers]);

    // 14. Real-time WebGL Graphics and Performance Sync
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed()) return;

        // 1. Resolution Scale Sync
        viewer.resolutionScale = resolutionScale;

        // 2. Anti-Aliasing Sync
        if (antiAliasing === 'fxaa') {
            viewer.scene.postProcessStages.fxaa.enabled = true;
            viewer.scene.msaaSamples = 1; // FXAA doesn't need MSAA
        } else if (antiAliasing === 'msaa') {
            viewer.scene.postProcessStages.fxaa.enabled = false;
            viewer.scene.msaaSamples = 4; // High-quality multi-sampling
        } else {
            viewer.scene.postProcessStages.fxaa.enabled = false;
            viewer.scene.msaaSamples = 1;
        }

        // 3. Tile Geometry SSE Detail Sync
        viewer.scene.globe.maximumScreenSpaceError = tileDetail;

        // 4. Shadow Sync
        viewer.shadows = shadows;

        // 5. Globe Dynamic Sun Lighting Sync
        viewer.scene.globe.enableLighting = globeLighting;

        // 6. Show FPS Sync
        viewer.scene.debugShowFramesPerSecond = showFps;

        // Request a frame render to apply settings immediately
        viewer.scene.requestRender();
    }, [resolutionScale, antiAliasing, tileDetail, shadows, globeLighting, showFps]);

    return <div ref={containerRef} className="flex-1 h-full z-0 relative" />;
};
