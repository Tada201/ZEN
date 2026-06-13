import { create } from "zustand";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import type { BoardDocumentV1, BoardLayoutMode, BoardWidget, BoardWidgetKind } from "./board/types";

export type VoiceStageBlockKind = BoardWidgetKind;
export type VoiceStageLifecycle = "active" | "paused" | "cancelled" | "closed";
export type VoiceStageBoardRequest = "new" | "edit" | "replace";

interface VoiceStageBlockBase {
  id: string;
  kind: VoiceStageBlockKind;
  title: string;
  updatedAt: number;
  layout?: BoardWidget["layout"];
}

export interface VoiceStageNoteBlock extends VoiceStageBlockBase {
  kind: "note";
  body: string;
}

export interface VoiceStageMetricBlock extends VoiceStageBlockBase {
  kind: "metric";
  value: string;
  detail?: string;
}

export interface VoiceStageTableBlock extends VoiceStageBlockBase {
  kind: "table";
  columns: string[];
  rows: string[][];
}

export interface VoiceStageChartBlock extends VoiceStageBlockBase {
  kind: "chart";
  points: Array<{ label: string; value: number }>;
}

export interface VoiceStageEquationBlock extends VoiceStageBlockBase {
  kind: "equation";
  expression: string;
}

export interface VoiceStageCodeBlock extends VoiceStageBlockBase {
  kind: "code";
  language: string;
  code: string;
}

export interface VoiceStageMapPlaceholderBlock extends VoiceStageBlockBase {
  kind: "map";
  location: string;
  detail?: string;
  latitude?: number;
  longitude?: number;
  zoom?: number;
}

export interface VoiceStageImageBlock extends VoiceStageBlockBase {
  kind: "image";
  url: string;
  alt?: string;
  caption?: string;
}

export interface VoiceStageLinkPreviewBlock extends VoiceStageBlockBase {
  kind: "link-preview";
  url: string;
  description?: string;
  thumbnail?: string;
}

export interface VoiceStageVideoBlock extends VoiceStageBlockBase {
  kind: "video";
  url: string;
  thumbnail?: string;
  description?: string;
}

export interface VoiceStageCameraBlock extends VoiceStageBlockBase {
  kind: "camera";
  description?: string;
}

export interface VoiceStageGenUiBlock extends VoiceStageBlockBase {
  kind: "gen-ui";
  content: string;
}

export interface VoiceStagePremiumCardBlock extends VoiceStageBlockBase {
  kind: "premium-card";
  cardType: string;
  cardData: Record<string, unknown>;
}

export interface VoiceStageHtmlBlock extends VoiceStageBlockBase {
  kind: "html";
  content: string;
}

export interface VoiceStageProgressBlock extends VoiceStageBlockBase {
  kind: "progress";
  value: number;
  max?: number;
  label?: string;
}

export interface VoiceStageDividerBlock extends VoiceStageBlockBase {
  kind: "divider";
}

export interface VoiceStageSvgBlock extends VoiceStageBlockBase {
  kind: "svg";
  markup: string;
  viewBox?: string;
}

export interface VoiceStageQrBlock extends VoiceStageBlockBase {
  kind: "qr";
  data: string;
  size?: number;
}

export interface VoiceStagePaletteBlock extends VoiceStageBlockBase {
  kind: "palette";
  colors: string[];
  names?: string[];
}

export interface VoiceStageKrokiBlock extends VoiceStageBlockBase {
  kind: "kroki";
  diagram: string;
  content: string;
}

export interface VoiceStageDiffBlock extends VoiceStageBlockBase {
  kind: "diff";
  oldCode: string;
  newCode: string;
  oldLabel?: string;
  newLabel?: string;
}

export type VoiceStageBlock =
  | VoiceStageNoteBlock
  | VoiceStageMetricBlock
  | VoiceStageTableBlock
  | VoiceStageChartBlock
  | VoiceStageEquationBlock
  | VoiceStageCodeBlock
  | VoiceStageMapPlaceholderBlock
  | VoiceStageImageBlock
  | VoiceStageLinkPreviewBlock
  | VoiceStageVideoBlock
  | VoiceStageCameraBlock
  | VoiceStageGenUiBlock
  | VoiceStagePremiumCardBlock
  | VoiceStageHtmlBlock
  | VoiceStageProgressBlock
  | VoiceStageDividerBlock
  | VoiceStageSvgBlock
  | VoiceStageQrBlock
  | VoiceStagePaletteBlock
  | VoiceStageKrokiBlock
  | VoiceStageDiffBlock;

export type VoiceStageInput = VoiceStageBlock extends infer Block
  ? Block extends VoiceStageBlock
    ? Omit<Block, "updatedAt"> & { updatedAt?: number }
    : never
  : never;

type VoiceStageDocument = Omit<BoardDocumentV1, "widgets"> & { widgets: VoiceStageBlock[] };

export interface VoiceStageBoardSnapshot {
  id: string;
  title: string;
  blocks: VoiceStageBlock[];
  createdAt: number;
  updatedAt: number;
}

interface VoiceStageReplaceOptions {
  requestType?: VoiceStageBoardRequest;
  rememberCurrent?: boolean;
}

interface VoiceStageState {
  document: VoiceStageDocument;
  retainedBoards: VoiceStageBoardSnapshot[];
  focusedBlockId: string | null;
  generation: number;
  lifecycle: VoiceStageLifecycle;
  start: () => void;
  clear: () => void;
  resetCurrent: () => void;
  replace: (blocks: VoiceStageInput[], options?: VoiceStageReplaceOptions) => void;
  append: (block: VoiceStageInput) => void;
  upsert: (block: VoiceStageInput) => void;
  saveCurrentBoard: (title?: string) => void;
  forgetBoards: () => void;
  focus: (id: string | null) => void;
  setLayout: (layout: BoardLayoutMode) => void;
  pause: () => void;
  cancel: (reason?: string) => void;
  close: () => void;
  incrementGeneration: () => void;
}

const now = () => Date.now();
const MAX_BOARD_MEMORY_LIMIT = 3;

function boardMemoryLimit() {
  const configured = useSettingsStore.getState().voiceDisplayAgentBoardMemoryLimit;
  return Math.min(MAX_BOARD_MEMORY_LIMIT, Math.max(1, configured || MAX_BOARD_MEMORY_LIMIT));
}

function normalizeBlock(block: VoiceStageInput): VoiceStageBlock {
  return { ...block, updatedAt: block.updatedAt ?? now() } as VoiceStageBlock;
}

function createBoardSnapshot(blocks: VoiceStageBlock[], title?: string): VoiceStageBoardSnapshot | null {
  if (blocks.length === 0) return null;
  const timestamp = now();
  return {
    id: `voice-board-${timestamp}`,
    title: title || blocks[0]?.title || "Voice board",
    blocks,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function rememberBoard(
  retainedBoards: VoiceStageBoardSnapshot[],
  blocks: VoiceStageBlock[],
  title?: string
) {
  const snapshot = createBoardSnapshot(blocks, title);
  if (!snapshot) return retainedBoards;
  return [...retainedBoards, snapshot].slice(-boardMemoryLimit());
}

export const useVoiceStageStore = create<VoiceStageState>((set) => ({
  document: {
    version: 1,
    id: "voice-board-current",
    title: "Voice board",
    layout: "grid",
    widgets: [],
    createdAt: now(),
    updatedAt: now(),
  },
  retainedBoards: [],
  focusedBlockId: null,
  generation: 0,
  lifecycle: "closed",
  start: () => set((state) => ({ lifecycle: "active", generation: state.generation + 1 })),
  clear: () => set((state) => ({ document: { ...state.document, widgets: [], updatedAt: now() }, retainedBoards: [], focusedBlockId: null, generation: state.generation + 1 })),
  resetCurrent: () => set((state) => ({ document: { ...state.document, widgets: [], updatedAt: now() }, focusedBlockId: null, generation: state.generation + 1 })),
  replace: (blocks, options = {}) => {
    const normalized = blocks.map(normalizeBlock);
    set((state) => {
      const requestType = options.requestType ?? "replace";
      const retainedBoards =
        requestType === "new"
          ? []
          : options.rememberCurrent
            ? rememberBoard(state.retainedBoards, state.document.widgets)
            : state.retainedBoards.slice(-boardMemoryLimit());

      return {
        document: { ...state.document, widgets: normalized, updatedAt: now() },
        retainedBoards,
        focusedBlockId: normalized[0]?.id ?? null,
      };
    });
  },
  append: (block) => {
    const normalized = normalizeBlock(block);
    set((state) => {
      const widgets = [...state.document.widgets, normalized].slice(-12);
      return { document: { ...state.document, widgets, updatedAt: now() }, focusedBlockId: normalized.id };
    });
  },
  upsert: (block) => {
    const normalized = normalizeBlock(block);
    set((state) => {
      const widgets = state.document.widgets;
      const index = widgets.findIndex((item) => item.id === normalized.id);
      if (index === -1) {
        const next = [...widgets, normalized].slice(-12);
        return { document: { ...state.document, widgets: next, updatedAt: now() }, focusedBlockId: normalized.id };
      }
      const next = widgets.slice();
      next[index] = normalized;
      return { document: { ...state.document, widgets: next, updatedAt: now() }, focusedBlockId: normalized.id };
    });
  },
  saveCurrentBoard: (title) =>
    set((state) => ({
      retainedBoards: rememberBoard(state.retainedBoards, state.document.widgets, title),
    })),
  forgetBoards: () => set({ retainedBoards: [] }),
  focus: (id) => set({ focusedBlockId: id }),
  setLayout: (layout) => set((state) => ({ document: { ...state.document, layout, updatedAt: now() } })),
  pause: () => set((state) => ({ lifecycle: "paused", generation: state.generation + 1 })),
  cancel: (reason = "Voice run stopped.") => {
    const stoppedBlock: VoiceStageNoteBlock = {
      id: "voice-run-stopped",
      kind: "note",
      title: "Run stopped",
      body: reason,
      updatedAt: now(),
    };
    set((state) => ({
      document: {
        ...state.document,
        widgets: [...state.document.widgets.filter((block) => block.id !== stoppedBlock.id), stoppedBlock].slice(-12),
        updatedAt: now(),
      },
      focusedBlockId: stoppedBlock.id,
      lifecycle: "cancelled",
      generation: state.generation + 1,
    }));
  },
  close: () => set((state) => ({ lifecycle: "closed", generation: state.generation + 1 })),
  incrementGeneration: () => set((state) => ({ generation: state.generation + 1 })),
}));
