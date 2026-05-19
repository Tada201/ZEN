/**
 * EntityRenderer: Core primitive-based rendering logic.
 * Ported from worldwideview-main.
 */
import * as Cesium from "cesium";
import type { GeoEntity, CesiumEntityOptions } from "../../types/PluginTypes";
import { globalChunkedProcessor } from "./ChunkedProcessor";
import { getStableAnimatables, markAnimatablesDirty } from "./renderCaches";
import { cleanupRemovedEntities } from "./primitiveOps";

export interface AnimatableItem {
    primitive: any;
    labelPrimitive?: any;
    entity: GeoEntity;
    posRef: Cesium.Cartesian3;
    options: CesiumEntityOptions;
    baseColor: Cesium.Color;
    _modelPromoted?: boolean;
    _occluded?: boolean;
    polylinePrimitive?: any;
}

// Registry for collections per viewer
const collectionsByViewer = new WeakMap<Cesium.Viewer, {
    points: Cesium.PointPrimitiveCollection;
    billboards: Cesium.BillboardCollection;
    labels: Cesium.LabelCollection;
    polylines: Cesium.PolylineCollection;
}>();

export function initPrimitiveCollections(viewer: Cesium.Viewer): void {
    const points = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
    const billboards = viewer.scene.primitives.add(new Cesium.BillboardCollection({ scene: viewer.scene }));
    const labels = viewer.scene.primitives.add(new Cesium.LabelCollection({ scene: viewer.scene }));
    const polylines = viewer.scene.primitives.add(new Cesium.PolylineCollection());

    collectionsByViewer.set(viewer, { points, billboards, labels, polylines });
}

export function getCollections(viewer: Cesium.Viewer) {
    return collectionsByViewer.get(viewer) || {
        points: new Cesium.PointPrimitiveCollection(),
        billboards: new Cesium.BillboardCollection(),
        labels: new Cesium.LabelCollection(),
        polylines: new Cesium.PolylineCollection()
    };
}

export async function renderEntitiesChunked(
    viewer: Cesium.Viewer,
    visibleEntities: Array<{ entity: GeoEntity; options: CesiumEntityOptions }>,
    existingMap: Map<string, AnimatableItem>
): Promise<AnimatableItem[]> {
    const { points, billboards, labels, polylines } = getCollections(viewer);
    const currentIds = new Set<string>();

    await globalChunkedProcessor.processChunked(visibleEntities, 500, (chunk) => {
        for (const item of chunk) {
            Cesium.Cartesian3.fromDegrees(item.entity.longitude, item.entity.latitude, item.entity.altitude || 0, Cesium.Ellipsoid.WGS84, Cesium.Cartesian3.clone(Cesium.Cartesian3.ZERO));
            // simplified render call for porting
            currentIds.add(item.entity.id);
            // ... (integration with primitiveOps)
        }
    });

    cleanupRemovedEntities(existingMap, currentIds, points, billboards, labels, polylines);
    markAnimatablesDirty();
    return getStableAnimatables(existingMap);
}
