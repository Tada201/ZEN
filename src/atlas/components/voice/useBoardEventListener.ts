import { useEffect } from "react";
import { listenAppEvent } from "@/api/events";
import { useVoiceStageStore, type VoiceStageBlock } from "./voiceStageStore";

interface BoardBlockUpdate {
  id: string;
  kind: string;
  title?: string;
  body?: string;
  value?: string | number;
  detail?: string;
  language?: string;
  expression?: string;
  columns?: string[];
  rows?: string[][];
  points?: Array<{ label: string; value: number }>;
  chart_type?: "bar" | "line";
  chartType?: "bar" | "line";
  
  // Media & new properties
  url?: string;
  thumbnail?: string;
  description?: string;
  size?: number;
  alt?: string;
  caption?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  zoom?: number;
  markup?: string;
  data?: string;
  colors?: string[];
  names?: string[];
  diagram?: string;
  content?: string;
  old_code?: string;
  new_code?: string;
  old_label?: string;
  new_label?: string;
  oldCode?: string;
  newCode?: string;
  oldLabel?: string;
  newLabel?: string;
  code?: string;
  max?: number;
  label?: string;
  layout?: {
    width?: "small" | "medium" | "wide" | "full";
    order?: number;
    col_span?: number;
    row_span?: number;
    colSpan?: number;
    rowSpan?: number;
    cell?: number;
    row?: number;
    column?: number;
  };
  card_type?: string;
  card_data?: Record<string, unknown>;
  cardType?: string;
  cardData?: Record<string, unknown>;
}

interface BoardOperation {
  version?: 1;
  chat_id?: string;
  action: "set" | "add" | "update" | "remove" | "clear" | "focus";
  id?: string;
  blocks?: BoardBlockUpdate[];
  block?: BoardBlockUpdate;
  title?: string;
  layout?: "grid" | "dashboard" | "focus";
}

function mapBlock(block: BoardBlockUpdate): VoiceStageBlock {
  const normalizedKind = block.kind === "map_placeholder" || block.kind === "map-placeholder"
    ? "map"
    : block.kind?.replace(/_/g, "-");
  const kind = (normalizedKind || "note") as VoiceStageBlock["kind"];
  
  let value = block.value;
  if (kind === "progress" && value !== undefined) {
    value = Number(value);
  }

  return {
    id: block.id,
    kind,
    title: block.title || "",
    body: block.body,
    value,
    detail: block.detail,
    language: block.language,
    expression: block.expression,
    columns: block.columns,
    rows: block.rows,
    points: block.points,
    chartType: block.chart_type || block.chartType,
    url: block.url,
    thumbnail: block.thumbnail,
    description: block.description,
    size: block.size,
    alt: block.alt,
    caption: block.caption,
    location: block.location,
    latitude: block.latitude,
    longitude: block.longitude,
    zoom: block.zoom,
    markup: block.markup,
    data: block.data,
    colors: block.colors,
    names: block.names,
    diagram: block.diagram,
    content: block.content,
    // snake_case to camelCase conversion for diff blocks
    oldCode: block.old_code || block.oldCode,
    newCode: block.new_code || block.newCode,
    oldLabel: block.old_label || block.oldLabel,
    newLabel: block.new_label || block.newLabel,
    code: block.code,
    max: block.max,
    label: block.label,
    layout: block.layout ? {
      width: block.layout.width,
      order: block.layout.order,
      colSpan: block.layout.col_span ?? block.layout.colSpan,
      rowSpan: block.layout.row_span ?? block.layout.rowSpan,
      cell: block.layout.cell,
      row: block.layout.row,
      column: block.layout.column,
    } : undefined,
    cardType: block.card_type || block.cardType,
    cardData: block.card_data || block.cardData,
    updatedAt: Date.now(),
  } as VoiceStageBlock;
}

function hasPayloadForKind(block: BoardBlockUpdate, kind: VoiceStageBlock["kind"]): boolean {
  switch (kind) {
    case "svg": return Boolean(block.markup);
    case "chart": return Boolean(block.points);
    case "table": return Boolean(block.columns || block.rows);
    case "equation": return Boolean(block.expression);
    case "code": return Boolean(block.code);
    case "map": return block.latitude != null && block.longitude != null;
    case "image":
    case "link-preview":
    case "video": return Boolean(block.url);
    case "gen-ui":
    case "html": return Boolean(block.content);
    case "premium-card": return Boolean(block.card_type || block.cardType);
    default: return true;
  }
}

export function applyBoardOperation(op: BoardOperation) {
  if (!op?.action) return;
  const store = useVoiceStageStore.getState();

  switch (op.action) {
    case "set":
      if (op.blocks) {
        store.replace(op.blocks.map(mapBlock), { requestType: "replace" });
        if (op.layout) store.setLayout(op.layout);
      }
      break;
    case "add":
      if (op.block) store.append(mapBlock(op.block));
      break;
    case "update":
      if (op.id && op.block) {
        const current = store.document.widgets.find((block) => block.id === op.id);
        const requestedKind = op.block.kind?.replace(/_/g, "-") as VoiceStageBlock["kind"] | undefined;
        const kind = current && requestedKind && !hasPayloadForKind(op.block, requestedKind)
          ? current.kind
          : requestedKind || current?.kind || "note";
        const updated = mapBlock({
          ...(current as BoardBlockUpdate | undefined),
          ...op.block,
          id: op.id,
          kind,
        });
        store.upsert(updated);
      }
      break;
    case "remove":
      if (op.id) store.remove(op.id);
      break;
    case "clear":
      store.resetCurrent();
      break;
    case "focus":
      if (op.id) store.focus(op.id);
      break;
  }
}

/**
 * Listens for board:update Tauri IPC events and applies them to the voice stage store.
 */
export function useBoardEventListener(chatId?: string) {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    void listenAppEvent("board:update", (event) => {
      const op = event.payload as unknown as BoardOperation;
      if (!op?.action) return;
      if (chatId && op.chat_id && op.chat_id !== chatId && op.chat_id !== `voice-display:${chatId}`) {
        return;
      }

      applyBoardOperation(op);
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [chatId]);
}
