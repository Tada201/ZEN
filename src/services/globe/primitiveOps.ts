/**
 * Primitive creation and cleanup helpers for EntityRenderer.
 * Ported from worldwideview-main.
 */
import {
    Cartesian3,
    Color,
    PointPrimitiveCollection,
    BillboardCollection,
    LabelCollection,
    PolylineCollection,
} from "cesium";
import type { GeoEntity, CesiumEntityOptions } from "../../types/PluginTypes";
import type { AnimatableItem } from "./EntityRenderer";
import { scratchPosition } from "./renderCaches";

export function getDefaultDotIcon(color: Color, outlineColor: Color, outlineWidth: number, size: number): string {
    const actualSize = size + outlineWidth * 2 + 4;
    const center = actualSize / 2;
    const radius = size / 2;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${actualSize}" height="${actualSize}">
        <circle cx="${center}" cy="${center}" r="${radius}"
                fill="${color.toCssColorString()}"
                stroke="${outlineColor.toCssColorString()}"
                stroke-width="${outlineWidth}" />
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createNewItem(
    entity: GeoEntity,
    options: CesiumEntityOptions,
    baseColor: Color,
    clickId: any,
    existingMap: Map<string, AnimatableItem>,
    points: PointPrimitiveCollection,
    billboards: BillboardCollection
): void {
    let prim;
    if (options.iconUrl) {
        prim = billboards.add({
            position: scratchPosition,
            image: options.iconUrl,
            scale: options.iconScale || 1.0,
            color: Color.WHITE,
            id: clickId,
        });
    } else {
        prim = points.add({
            position: scratchPosition,
            color: baseColor,
            outlineColor: options.outlineColor ? Color.fromCssColorString(options.outlineColor) : Color.BLACK,
            outlineWidth: options.outlineWidth || 1,
            pixelSize: options.size || 8,
            id: clickId,
        });
    }

    existingMap.set(entity.id, {
        primitive: prim,
        entity,
        posRef: Cartesian3.clone(scratchPosition),
        options,
        baseColor,
    });
}

export function updateExistingItem(
    item: AnimatableItem,
    entity: GeoEntity,
    options: CesiumEntityOptions,
    baseColor: Color
): void {
    Cartesian3.clone(scratchPosition, item.posRef);
    if (!item._modelPromoted) {
        item.primitive.position = item.posRef;
    }
    item.entity = entity;
    item.options = options;
    item.baseColor = baseColor;

    // Quick update color/size if changed (simplification for port)
    if (item.primitive.color && !options.iconUrl) {
        item.primitive.color = baseColor;
    }
}

export function cleanupRemovedEntities(
    existingMap: Map<string, AnimatableItem>,
    currentIds: Set<string>,
    points: PointPrimitiveCollection,
    billboards: BillboardCollection,
    labels: LabelCollection,
    polylines: PolylineCollection
): void {
    for (const [id, item] of existingMap.entries()) {
        if (!currentIds.has(id)) {
            if (item.options.iconUrl) {
                billboards.remove(item.primitive);
            } else {
                points.remove(item.primitive);
            }
            if (item.labelPrimitive) labels.remove(item.labelPrimitive);
            if (item.polylinePrimitive) polylines.remove(item.polylinePrimitive);

            existingMap.delete(id);
        }
    }
}
