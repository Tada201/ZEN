import type { BoardWidgetWidth } from "./board/types";
import { gridCoordinates, preferredGridSpan } from "./board/registry";
import { useVoiceStageStore, type VoiceStageBlock } from "./voiceStageStore";

const WIDTH_RATIO: Record<BoardWidgetWidth, number> = {
  small: 0.25,
  medium: 0.5,
  wide: 0.75,
  full: 1,
};

const DEFAULT_WIDTH: Partial<Record<VoiceStageBlock["kind"], BoardWidgetWidth>> = {
  metric: "small",
  progress: "medium",
  note: "medium",
  equation: "medium",
  chart: "wide",
  table: "wide",
  map: "wide",
  video: "wide",
  camera: "wide",
  svg: "wide",
  html: "wide",
  "gen-ui": "wide",
};

const HEIGHT_ESTIMATE: Partial<Record<VoiceStageBlock["kind"], number>> = {
  metric: 112,
  progress: 96,
  note: 140,
  equation: 120,
  chart: 220,
  table: 260,
  map: 320,
  video: 320,
  camera: 320,
  svg: 300,
  html: 320,
  "gen-ui": 320,
};

function preferredWidth(block: VoiceStageBlock): BoardWidgetWidth {
  return block.layout?.width ?? DEFAULT_WIDTH[block.kind] ?? "medium";
}

function contentHint(block: VoiceStageBlock): string {
  const candidate =
    ("body" in block && block.body) ||
    ("detail" in block && block.detail) ||
    ("label" in block && block.label) ||
    ("expression" in block && block.expression) ||
    ("location" in block && block.location) ||
    ("markup" in block && block.markup) ||
    ("content" in block && block.content) ||
    ("url" in block && block.url) ||
    "";
  return String(candidate).replace(/\s+/g, " ").trim().slice(0, 240);
}

function summarizeBlock(block: VoiceStageBlock, boardWidth: number) {
  const width = preferredWidth(block);
  const span = preferredGridSpan(block);
  const coordinates = gridCoordinates(block);
  const estimatedWidthPx = Math.max(120, Math.round((boardWidth - 24) * WIDTH_RATIO[width]));
  const estimatedHeightPx = HEIGHT_ESTIMATE[block.kind] ?? 160;

  return {
    id: block.id,
    kind: block.kind,
    title: block.title || "",
    contentHint: contentHint(block),
    layout: {
      width,
      order: block.layout?.order ?? 0,
      colSpan: block.layout?.colSpan,
      rowSpan: block.layout?.rowSpan,
      cell: coordinates?.cell,
      row: coordinates?.row,
      column: coordinates?.column,
    },
    occupiedCells: coordinates
      ? Array.from({ length: Math.min(span.rowSpan, 4 - coordinates.row) }, (_, rowOffset) =>
          Array.from({ length: Math.min(span.colSpan, 4 - coordinates.column) }, (_, columnOffset) =>
            (coordinates.row + rowOffset) * 4 + coordinates.column + columnOffset
          )
        ).flat()
      : [],
    estimatedPixelCost: {
      width: estimatedWidthPx,
      height: estimatedHeightPx,
      area: estimatedWidthPx * estimatedHeightPx,
    },
  };
}

export function buildVoiceDisplayContext(): string {
  const { document } = useVoiceStageStore.getState();
  const stage = window.document.querySelector<HTMLElement>("[data-voice-stage]");
  const rect = stage?.getBoundingClientRect();
  const boardWidth = Math.max(320, Math.round(rect?.width ?? window.innerWidth));
  const boardHeight = Math.max(240, Math.round(rect?.height ?? window.innerHeight));
  const widgets = document.widgets.map((block) => summarizeBlock(block, boardWidth));
  const occupiedArea = widgets.reduce((total, widget) => total + widget.estimatedPixelCost.area, 0);

  return JSON.stringify({
    version: 1,
    board: {
      id: document.id,
      layout: document.layout,
      widthPx: boardWidth,
      heightPx: boardHeight,
      windowWidthPx: window.innerWidth,
      windowHeightPx: window.innerHeight,
      estimatedOccupiedPercent: Math.min(100, Math.round((occupiedArea / (boardWidth * boardHeight)) * 100)),
    },
    widgets,
  });
}
