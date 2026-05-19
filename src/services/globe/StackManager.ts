/**
 * Dummy StackManager until spiderifier port.
 */
import type { AnimatableItem } from "./EntityRenderer";

export function calculateGridSizeDegrees(_altitude: number): number {
    return 0.1;
}

export function rebuildStacks(
    _items: Map<string, AnimatableItem>,
    _gridSize: number,
    _force?: boolean
): void {
    // Placeholder to satisfy EntityRenderer compilation
}
