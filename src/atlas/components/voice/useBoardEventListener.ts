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
  layout?: { width?: "small" | "medium" | "wide" | "full"; order?: number };
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
    layout: block.layout,
    cardType: block.card_type || block.cardType,
    cardData: block.card_data || block.cardData,
    updatedAt: Date.now(),
  } as VoiceStageBlock;
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

      const store = useVoiceStageStore.getState();

      switch (op.action) {
        case "set":
          if (op.blocks) {
            store.replace(op.blocks.map(mapBlock), { requestType: "replace" });
            if (op.layout) store.setLayout(op.layout);
          }
          break;
        case "add":
          if (op.block) {
            store.append(mapBlock(op.block));
          }
          break;
        case "update":
          if (op.id && op.block) {
            const updated = mapBlock(op.block);
            updated.id = op.id;
            store.upsert(updated);
          }
          break;
        case "remove":
          if (op.id) {
            store.replace(
              store.document.widgets.filter((b) => b.id !== op.id),
              { requestType: "edit" }
            );
          }
          break;
        case "clear":
          store.clear();
          break;
        case "focus":
          if (op.id) {
            store.focus(op.id);
          }
          break;
      }
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
