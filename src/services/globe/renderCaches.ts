/**
 * DOD: Color cache and scratch allocations for the rendering pipeline.
 * Ported from worldwideview-main.
 */
import { Cartesian3, Color } from "cesium";
import type { CesiumEntityOptions } from "../../types/PluginTypes";
import type { AnimatableItem } from "./EntityRenderer";

export const scratchPosition = new Cartesian3();

const colorCache = new Map<string, Color>();

export function getCachedColor(css: string | undefined): Color {
    if (!css) return Color.CYAN;
    let c = colorCache.get(css);
    if (!c) {
        c = Color.fromCssColorString(css);
        colorCache.set(css, c);
    }
    return c;
}

export function getEntityColor(options: CesiumEntityOptions): Color {
    return getCachedColor(options.color);
}

let stableAnimatables: AnimatableItem[] = [];
let stableArrayDirty = true;

export function markAnimatablesDirty(): void {
    stableArrayDirty = true;
}

export function getStableAnimatables(
    existingMap: Map<string, AnimatableItem>
): AnimatableItem[] {
    if (stableArrayDirty) {
        stableAnimatables = Array.from(existingMap.values());
        stableArrayDirty = false;
    }
    return stableAnimatables;
}
