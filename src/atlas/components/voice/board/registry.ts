import type { BoardWidget, BoardWidgetKind, BoardWidgetWidth } from "./types";

interface BoardWidgetDefinition {
  width: BoardWidgetWidth;
  maturity: "production" | "partial" | "preview";
}

const wide: BoardWidgetKind[] = [
  "table", "chart", "map", "video", "camera", "gen-ui", "html", "svg", "kroki", "diff",
];
const small: BoardWidgetKind[] = ["metric", "progress", "qr", "palette"];

export const boardWidgetRegistry: Record<BoardWidgetKind, BoardWidgetDefinition> = {
  note: { width: "medium", maturity: "production" },
  metric: { width: "small", maturity: "production" },
  table: { width: "wide", maturity: "production" },
  chart: { width: "wide", maturity: "production" },
  equation: { width: "medium", maturity: "production" },
  code: { width: "wide", maturity: "production" },
  map: { width: "wide", maturity: "preview" },
  image: { width: "medium", maturity: "production" },
  "link-preview": { width: "medium", maturity: "production" },
  video: { width: "wide", maturity: "preview" },
  camera: { width: "wide", maturity: "preview" },
  "gen-ui": { width: "full", maturity: "partial" },
  "premium-card": { width: "medium", maturity: "partial" },
  html: { width: "full", maturity: "preview" },
  progress: { width: "small", maturity: "production" },
  divider: { width: "full", maturity: "production" },
  svg: { width: "wide", maturity: "production" },
  qr: { width: "small", maturity: "partial" },
  palette: { width: "small", maturity: "production" },
  kroki: { width: "wide", maturity: "partial" },
  diff: { width: "wide", maturity: "production" },
};

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
