import { useEffect } from 'react';
import * as Cesium from 'cesium';
import type { CesiumDataSourcesRef, CesiumViewerRef } from './cesiumMapTypes';

interface UseCesiumVisualLayersOptions {
    viewerRef: CesiumViewerRef;
    dataSourcesRef: CesiumDataSourcesRef;
    selectedTarget: any;
    satellites: any[];
    selectedLayers: string[];
}

export const useCesiumVisualLayers = ({
    viewerRef,
    dataSourcesRef,
    selectedTarget,
    satellites,
    selectedLayers,
}: UseCesiumVisualLayersOptions) => {
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed()) return;

        const oldOrbit = viewer.entities.getById('ORBITAL_PATH');
        if (oldOrbit) viewer.entities.remove(oldOrbit);

        const oldFootprint = viewer.entities.getById('SENSOR_FOOTPRINT');
        if (oldFootprint) viewer.entities.remove(oldFootprint);

        if (!selectedTarget) return;

        const isSatellite = selectedTarget.id.toLowerCase().includes('sat') || satellites.some(s => s.id === selectedTarget.id);

        if (isSatellite) {
            const alt = selectedTarget.position.alt || 420000;
            const pos = Cesium.Cartesian3.fromDegrees(selectedTarget.position.lon, selectedTarget.position.lat, alt);

            const x = pos.x, y = pos.y, z = pos.z;
            const u_raw_x = -y, u_raw_y = x;
            const u_len = Math.sqrt(u_raw_x * u_raw_x + u_raw_y * u_raw_y);

            if (u_len > 0.001) {
                const ux = u_raw_x / u_len, uy = u_raw_y / u_len, uz = 0;
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

                const groundPos = Cesium.Cartesian3.fromDegrees(selectedTarget.position.lon, selectedTarget.position.lat, 0);
                const centerPos = Cesium.Cartesian3.midpoint(pos, groundPos, new Cesium.Cartesian3());

                viewer.entities.add({
                    id: 'SENSOR_FOOTPRINT',
                    position: centerPos as any,
                    cylinder: {
                        length: alt,
                        topRadius: 0.0,
                        bottomRadius: 350000.0,
                        material: Cesium.Color.fromCssColorString('rgba(0, 240, 240, 0.08)'),
                        outline: true,
                        outlineColor: Cesium.Color.fromCssColorString('rgba(0, 240, 240, 0.3)'),
                        numberOfVerticalLines: 12
                    }
                });
            }
        }
    }, [viewerRef, selectedTarget, satellites]);

    useEffect(() => {
        const viewer = viewerRef.current;
        const ds = dataSourcesRef.current.cables;
        if (!viewer || viewer.isDestroyed() || !ds) return;

        let destroyed = false;

        ds.entities.suspendEvents();
        ds.entities.removeAll();

        if (!selectedLayers.includes('cables')) {
            ds.entities.resumeEvents();
            return;
        }

        fetch("https://www.submarinecablemap.com/api/v3/cable/cable-geo.json")
            .then(res => {
                if (!res.ok) throw new Error("CORS or network error");
                return res.json();
            })
            .then(geoJson => {
                if (destroyed || !selectedLayers.includes('cables')) return;

                Cesium.GeoJsonDataSource.load(geoJson, {
                    stroke: Cesium.Color.fromCssColorString('rgba(0, 240, 180, 0.75)'),
                    strokeWidth: 2,
                    clampToGround: true
                }).then(loadedDs => {
                    if (destroyed || !selectedLayers.includes('cables')) return;

                    loadedDs.entities.values.forEach(entity => {
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
                if (!destroyed) {
                    console.warn("[CesiumMapRenderer] Undersea cables fetch failed, using fallback high-traffic lanes:", err);
                }

                const fallbacks = [
                    { name: "Atlantic Crossing 1 (AC-1)", coords: [[-74.0060, 40.7128], [-4.2181, 50.7978], [8.6821, 50.1109]] },
                    { name: "Unity / EGRT", coords: [[-124.0444, 45.3675], [140.8550, 35.7000]] },
                    { name: "Southeast Asia-Japan Cable (SJC)", coords: [[106.6602, 10.7626], [103.8519, 1.2902], [114.1694, 22.3193], [139.6917, 35.6895]] },
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
                if (!destroyed) ds.entities.resumeEvents();
            });

        return () => { destroyed = true; };
    }, [viewerRef, dataSourcesRef, selectedLayers]);

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
    }, [viewerRef, dataSourcesRef, selectedLayers]);
};
