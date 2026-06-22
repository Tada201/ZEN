/**
 * EntityService: Primitive-based rendering for high-performance geospatial data.
 * Ported from worldwideview-main.
 */
import * as Cesium from 'cesium';
import type { GeoEntity, CesiumEntityOptions } from '../types/PluginTypes';
import { getEntityColor } from './globe/renderCaches';

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

interface LayerCollections {
    points: Cesium.PointPrimitiveCollection;
    billboards: Cesium.BillboardCollection;
    labels: Cesium.LabelCollection;
    polylines: Cesium.PolylineCollection;
}

export class EntityService {
    private viewer: Cesium.Viewer;
    private collections: LayerCollections;
    private items = new Map<string, AnimatableItem>();
    private layerItems = new Map<string, Set<string>>();

    constructor(viewer: Cesium.Viewer) {
        this.viewer = viewer;
        const scene = viewer.scene;

        this.collections = {
            points: scene.primitives.add(new Cesium.PointPrimitiveCollection()),
            billboards: scene.primitives.add(new Cesium.BillboardCollection({ scene })),
            labels: scene.primitives.add(new Cesium.LabelCollection({ scene })),
            polylines: scene.primitives.add(new Cesium.PolylineCollection())
        };
    }

    public renderEntities(entities: Array<{ entity: GeoEntity; options: CesiumEntityOptions }>, layerId: string): void {
        const { points, billboards, labels, polylines } = this.collections;
        const currentIds = new Set<string>();

        if (!this.layerItems.has(layerId)) {
            this.layerItems.set(layerId, new Set());
        }
        const layerSet = this.layerItems.get(layerId)!;

        for (const { entity, options } of entities) {
            const pos = Cesium.Cartesian3.fromDegrees(
                entity.longitude, entity.latitude, entity.altitude || 0,
                Cesium.Ellipsoid.WGS84, new Cesium.Cartesian3()
            );
            const baseColor = getEntityColor(options);
            currentIds.add(entity.id);
            layerSet.add(entity.id);

            const existing = this.items.get(entity.id);
            if (existing) {
                // Update existing item position/color
                existing.posRef = pos;
                existing.entity = entity;
                existing.options = options;
                existing.baseColor = baseColor;
                if (existing.primitive) {
                    existing.primitive.position = pos;
                    if (!existing._modelPromoted && existing.primitive.color) {
                        existing.primitive.color = baseColor;
                    }
                }
            } else {
                // Create new primitive
                let prim: any;
                if (options.type === 'billboard' && options.iconUrl) {
                    prim = billboards.add({
                        position: pos,
                        image: options.iconUrl,
                        scale: options.iconScale || 1.0,
                        color: Cesium.Color.WHITE,
                        id: { id: entity.id, type: layerId }
                    });
                } else {
                    prim = points.add({
                        position: pos,
                        color: baseColor,
                        outlineColor: options.outlineColor
                            ? Cesium.Color.fromCssColorString(options.outlineColor)
                            : Cesium.Color.BLACK,
                        outlineWidth: options.outlineWidth || 1,
                        pixelSize: options.size || 6,
                        id: { id: entity.id, type: layerId, properties: entity.properties }
                    });
                }

                this.items.set(entity.id, {
                    primitive: prim,
                    entity,
                    posRef: pos,
                    options,
                    baseColor
                });
            }
        }

        // Cleanup removed entities for this layer
        for (const id of layerSet) {
            if (!currentIds.has(id)) {
                layerSet.delete(id);
                const item = this.items.get(id);
                if (item) {
                    try {
                        if (item.options.iconUrl) {
                            billboards.remove(item.primitive);
                        } else {
                            points.remove(item.primitive);
                        }
                        if (item.labelPrimitive) labels.remove(item.labelPrimitive);
                        if (item.polylinePrimitive) polylines.remove(item.polylinePrimitive);
                    } catch (_) { /* ignore double-removal errors */ }
                    this.items.delete(id);
                }
            }
        }
    }

    public clearEntities(layerId: string): void {
        if (this.viewer.isDestroyed()) return;
        const { points, billboards, labels, polylines } = this.collections;
        const layerSet = this.layerItems.get(layerId);
        if (!layerSet) return;

        for (const id of layerSet) {
            const item = this.items.get(id);
            if (item) {
                try {
                    if (item.options.iconUrl) {
                        billboards.remove(item.primitive);
                    } else {
                        points.remove(item.primitive);
                    }
                    if (item.labelPrimitive) labels.remove(item.labelPrimitive);
                    if (item.polylinePrimitive) polylines.remove(item.polylinePrimitive);
                } catch (_) { /* ignore */ }
                this.items.delete(id);
            }
        }
        layerSet.clear();
        this.viewer.scene.requestRender();
    }

    public getItem(entityId: string): AnimatableItem | undefined {
        return this.items.get(entityId);
    }

    public getAllItems(): AnimatableItem[] {
        return Array.from(this.items.values());
    }

    public dispose(): void {
        if (this.viewer.isDestroyed()) {
            this.items.clear();
            this.layerItems.clear();
            return;
        }
        const scene = this.viewer.scene;
        try { scene.primitives.remove(this.collections.points); } catch (_) {}
        try { scene.primitives.remove(this.collections.billboards); } catch (_) {}
        try { scene.primitives.remove(this.collections.labels); } catch (_) {}
        try { scene.primitives.remove(this.collections.polylines); } catch (_) {}
        this.items.clear();
        this.layerItems.clear();
    }
}
