export type BoardLayoutMode = "grid" | "dashboard" | "focus";
export type BoardWidgetWidth = "small" | "medium" | "wide" | "full";

export interface BoardWidgetLayout {
  width?: BoardWidgetWidth;
  order?: number;
  colSpan?: number;
  rowSpan?: number;
  cell?: number;
  row?: number;
  column?: number;
}

export type BoardWidgetKind =
  | "note"
  | "metric"
  | "table"
  | "chart"
  | "equation"
  | "code"
  | "map"
  | "image"
  | "link-preview"
  | "video"
  | "camera"
  | "gen-ui"
  | "premium-card"
  | "html"
  | "progress"
  | "divider"
  | "svg"
  | "qr"
  | "palette"
  | "kroki"
  | "diff";

export interface BoardWidgetBase {
  id: string;
  kind: BoardWidgetKind;
  title: string;
  layout?: BoardWidgetLayout;
  updatedAt: number;
}

export type BoardWidget = BoardWidgetBase & {
  body?: string;
  value?: string | number;
  detail?: string;
  language?: string;
  expression?: string;
  columns?: string[];
  rows?: string[][];
  points?: Array<{ label: string; value: number }>;
  chartType?: "bar" | "line";
  url?: string;
  thumbnail?: string;
  description?: string;
  alt?: string;
  caption?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  zoom?: number;
  code?: string;
  max?: number;
  label?: string;
  markup?: string;
  data?: string;
  colors?: string[];
  names?: string[];
  diagram?: string;
  content?: string;
  oldCode?: string;
  newCode?: string;
  oldLabel?: string;
  newLabel?: string;
  cardType?: string;
  cardData?: Record<string, unknown>;
};

export interface BoardDocumentV1 {
  version: 1;
  id: string;
  title: string;
  layout: BoardLayoutMode;
  widgets: BoardWidget[];
  createdAt: number;
  updatedAt: number;
}
