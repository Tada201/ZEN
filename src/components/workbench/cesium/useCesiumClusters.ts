import React from 'react';
import * as Cesium from 'cesium';
import type { CesiumClusterAssignments } from './cesiumMapTypes';

export const useCesiumClusters = (
    activeFlights: any[],
    activeVessels: any[],
    activeMilitary: any[],
    expandedHubId: string | null,
): CesiumClusterAssignments => React.useMemo(() => {
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
                if (index === 0) return;

                if (isExpanded) {
                    const angle = (index / (group.length - 1)) * Math.PI * 2;
                    const offsetDist = 0.04;
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
