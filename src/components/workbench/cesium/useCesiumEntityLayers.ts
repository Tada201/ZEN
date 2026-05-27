import { useEffect, type MutableRefObject } from 'react';
import * as Cesium from 'cesium';
import { altitudeToColor, getVesselStyle, issIconUrl } from './cesiumMapHelpers';
import type {
    CesiumClusterAssignments,
    CesiumDataSourcesRef,
    CesiumEntityIdsRef,
    CesiumEntityServiceRef,
    CesiumViewerRef,
} from './cesiumMapTypes';

interface UseCesiumEntityLayersOptions {
    viewerRef: CesiumViewerRef;
    dataSourcesRef: CesiumDataSourcesRef;
    entityIdsRef: CesiumEntityIdsRef;
    entityServiceRef: CesiumEntityServiceRef;
    flightPositionsRef: MutableRefObject<Map<string, Cesium.SampledPositionProperty>>;
    satellites: any[];
    flights: any[];
    earthquakes: any[];
    military: any[];
    vessels: any[];
    selectedLayers: string[];
    selectedTarget: any;
    viewportCenter: { alt: number };
    expandedHubId: string | null;
    allClusteredUnits: CesiumClusterAssignments;
}

export const useCesiumEntityLayers = ({
    viewerRef,
    dataSourcesRef,
    entityIdsRef,
    entityServiceRef,
    flightPositionsRef,
    satellites,
    flights,
    earthquakes,
    military,
    vessels,
    selectedLayers,
    selectedTarget,
    viewportCenter,
    expandedHubId,
    allClusteredUnits,
}: UseCesiumEntityLayersOptions) => {
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
    }, [viewerRef, entityServiceRef, satellites, selectedLayers]);

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
    }, [viewerRef, dataSourcesRef, flights, vessels, military, expandedHubId, allClusteredUnits]);

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
                const assign = allClusteredUnits.assignments.get(eid);
                const isHub = allClusteredUnits.hubSet.has(eid);
                const childCount = allClusteredUnits.hubChildCounts.get(eid) || 0;

                let rawPos = Cesium.Cartesian3.fromDegrees(f.position.lon, f.position.lat, f.position.alt || 0);
                if (assign) {
                    rawPos = assign.offsetPos;
                }

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
                const labelText = isHub
                    ? `[CLUSTER HUB] ${f.metadata.flight?.trim() || eid} (${childCount} TARGETS)`
                    : (f.metadata.flight?.trim() || f.metadata.registration || f.metadata.hex || eid);

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
                        existing.label.text = labelText as any;
                    }
                } else {
                    const entityOptions: Cesium.Entity.ConstructorOptions = {
                        id: eid,
                        position: property,
                        properties: { metadata: f.metadata, type: f.type, isHub: isHub, childCount },
                        label: {
                            show: showChild,
                            text: labelText,
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
    }, [dataSourcesRef, entityIdsRef, flightPositionsRef, viewerRef, flights, selectedLayers, selectedTarget, viewportCenter, allClusteredUnits]);

    useEffect(() => {
        const ds = dataSourcesRef.current.earthquakes;
        if (!ds) return;

        ds.entities.suspendEvents();
        const prev = entityIdsRef.current.earthquakes;
        const next = new Set<string>();

        if (selectedLayers.includes('earthquakes')) {
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
    }, [dataSourcesRef, entityIdsRef, viewerRef, earthquakes, selectedLayers]);

    useEffect(() => {
        const ds = dataSourcesRef.current.vessels;
        if (!ds) return;

        ds.entities.suspendEvents();
        const prev = entityIdsRef.current.vessels;
        const next = new Set<string>();

        if (selectedLayers.includes('vessels')) {
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
                const labelText = isHub
                    ? `[CLUSTER HUB] ${v.metadata?.name || eid} (${childCount} VESSELS)`
                    : (v.metadata?.name || eid);

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
                        existing.label.text = labelText as any;
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
                            text: labelText,
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
    }, [dataSourcesRef, entityIdsRef, viewerRef, vessels, selectedLayers, allClusteredUnits]);

    useEffect(() => {
        const ds = dataSourcesRef.current.military;
        if (!ds) return;

        ds.entities.suspendEvents();
        const prev = entityIdsRef.current.military;
        const next = new Set<string>();

        if (selectedLayers.includes('military')) {
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
                const flightColor = Cesium.Color.fromCssColorString('#FFCC00');
                const showChild = !assign || assign.isExpanded;
                const labelText = isHub
                    ? `[CLUSTER HUB] ${m.metadata.flight?.trim() || eid} (${childCount} TARGETS)`
                    : (m.metadata.flight?.trim() || m.metadata.registration || m.metadata.hex || eid);

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
                        existing.label.text = labelText as any;
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
                            text: labelText,
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
    }, [dataSourcesRef, entityIdsRef, viewerRef, military, selectedLayers, allClusteredUnits]);
};
