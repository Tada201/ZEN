import type { VoiceStageBlock } from "../voiceStageStore";
import { gridCoordinates, preferredGridSpan } from "./registry";

export function occupiedCells(block: VoiceStageBlock): number[] {
  const coordinates = gridCoordinates(block);
  if (!coordinates) return [];
  const span = preferredGridSpan(block);
  const width = Math.min(span.colSpan, 4 - coordinates.column);
  const height = Math.min(span.rowSpan, 4 - coordinates.row);
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (coordinates.row + y) * 4 + coordinates.column + x)
  ).flat();
}

export function canPlace(block: VoiceStageBlock, widgets: VoiceStageBlock[], ignoreId = block.id): boolean {
  const candidate = occupiedCells(block);
  if (candidate.length === 0) return true;
  const occupied = new Set(
    widgets.filter((widget) => widget.id !== ignoreId).flatMap(occupiedCells)
  );
  return candidate.every((cell) => !occupied.has(cell));
}

export function placeInFirstFreeSlot(block: VoiceStageBlock, widgets: VoiceStageBlock[]): VoiceStageBlock | null {
  if (canPlace(block, widgets)) return block;
  const span = preferredGridSpan(block);
  for (let row = 0; row <= 4 - span.rowSpan; row += 1) {
    for (let column = 0; column <= 4 - span.colSpan; column += 1) {
      const candidate = {
        ...block,
        layout: { ...block.layout, cell: row * 4 + column, row, column },
      } as VoiceStageBlock;
      if (canPlace(candidate, widgets)) return candidate;
    }
  }
  return null;
}
