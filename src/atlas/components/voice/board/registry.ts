import type { BoardWidget, BoardWidgetKind, BoardWidgetWidth } from "./types";

interface BoardWidgetDefinition {
  width: BoardWidgetWidth;
  colSpan: number;
  rowSpan: number;
  maturity: "production" | "partial" | "preview";
}

const wide: BoardWidgetKind[] = [
  "table", "chart", "map", "video", "camera", "gen-ui", "html", "svg", "kroki", "diff",
];
const small: BoardWidgetKind[] = ["metric", "progress", "qr", "palette"];

export const boardWidgetRegistry: Record<BoardWidgetKind, BoardWidgetDefinition> = {
  note: { width: "medium", colSpan: 2, rowSpan: 1, maturity: "production" },
  metric: { width: "small", colSpan: 1, rowSpan: 1, maturity: "production" },
  table: { width: "wide", colSpan: 2, rowSpan: 2, maturity: "production" },
  chart: { width: "wide", colSpan: 2, rowSpan: 2, maturity: "production" },
  equation: { width: "medium", colSpan: 2, rowSpan: 1, maturity: "production" },
  code: { width: "wide", colSpan: 2, rowSpan: 2, maturity: "production" },
  map: { width: "wide", colSpan: 2, rowSpan: 2, maturity: "preview" },
  image: { width: "medium", colSpan: 2, rowSpan: 2, maturity: "production" },
  "link-preview": { width: "medium", colSpan: 2, rowSpan: 1, maturity: "production" },
  video: { width: "wide", colSpan: 2, rowSpan: 2, maturity: "preview" },
  camera: { width: "wide", colSpan: 2, rowSpan: 2, maturity: "preview" },
  "gen-ui": { width: "full", colSpan: 2, rowSpan: 2, maturity: "partial" },
  "premium-card": { width: "medium", colSpan: 2, rowSpan: 2, maturity: "partial" },
  html: { width: "full", colSpan: 2, rowSpan: 2, maturity: "preview" },
  progress: { width: "small", colSpan: 1, rowSpan: 1, maturity: "production" },
  divider: { width: "full", colSpan: 2, rowSpan: 1, maturity: "production" },
  svg: { width: "wide", colSpan: 2, rowSpan: 2, maturity: "production" },
  qr: { width: "small", colSpan: 1, rowSpan: 1, maturity: "partial" },
  palette: { width: "small", colSpan: 1, rowSpan: 1, maturity: "production" },
  kroki: { width: "wide", colSpan: 2, rowSpan: 2, maturity: "partial" },
  diff: { width: "wide", colSpan: 2, rowSpan: 2, maturity: "production" },
};

export function preferredGridSpan(widget: BoardWidget) {
  const definition = boardWidgetRegistry[widget.kind];
  return {
    colSpan: Math.min(4, Math.max(1, widget.layout?.colSpan ?? definition.colSpan)),
    rowSpan: Math.min(4, Math.max(1, widget.layout?.rowSpan ?? definition.rowSpan)),
  };
}

export function gridCoordinates(widget: BoardWidget) {
  const explicitCell = widget.layout?.cell;
  const row = explicitCell != null ? Math.floor(explicitCell / 4) : widget.layout?.row;
  const column = explicitCell != null ? explicitCell % 4 : widget.layout?.column;
  if (row == null || column == null) return null;
  return {
    row: Math.min(3, Math.max(0, row)),
    column: Math.min(3, Math.max(0, column)),
    cell: Math.min(15, Math.max(0, explicitCell ?? row * 4 + column)),
  };
}

export function preferredWidgetWidth(widget: BoardWidget): BoardWidgetWidth {
  if (widget.layout?.width) return widget.layout.width;
  if (wide.includes(widget.kind)) return "wide";
  if (small.includes(widget.kind)) return "small";
  return boardWidgetRegistry[widget.kind].width;
}

export const widgetWidthClass: Record<BoardWidgetWidth, string> = {
  small: "col-span-12 sm:col-span-6 xl:col-span-3",
  medium: "col-span-12 md:col-span-6 xl:col-span-4",
  wide: "col-span-12 xl:col-span-8",
  full: "col-span-12",
};
