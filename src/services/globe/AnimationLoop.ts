/**
 * Animation loop placeholder.
 */
import type { Viewer as CesiumViewer } from "cesium";
import type { AnimatableItem } from "./EntityRenderer";

export function createUpdateLoop(
    viewer: CesiumViewer,
    animatablesArray: { current: AnimatableItem[] },
    _hoveredEntityIdRef: React.MutableRefObject<string | null>
) {
    return function updatePositions() {
        if (viewer.isDestroyed()) return;
        const items = animatablesArray.current;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item._modelPromoted || item._occluded) continue;
            // Simplified: Just keep position sync
            if (item.primitive) {
                item.primitive.position = item.posRef;
            }
        }
    };
}
