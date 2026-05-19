import { create } from 'zustand';
import type { DrawOp, DrawingCanvasState, DrawingToolType, DrawStyle } from '../../types/drawing';

const MAX_UNDO = 50;

/**
 * Compute bounding box [x1, y1, x2, y2] for a DrawOp
 */
function computeBbox(op: DrawOp): [number, number, number, number] | null {
  switch (op.kind) {
    case 'line':
      return [
        Math.min(op.x1, op.x2),
        Math.min(op.y1, op.y2),
        Math.max(op.x1, op.x2),
        Math.max(op.y1, op.y2),
      ];
    case 'rect':
      return [op.x, op.y, op.x + op.w, op.y + op.h];
    case 'circle':
      return [op.x - op.r, op.y - op.r, op.x + op.r, op.y + op.r];
    case 'ellipse':
      return [op.x - op.rx, op.y - op.ry, op.x + op.rx, op.y + op.ry];
    case 'polygon': {
      if (op.points.length === 0) return null;
      const xs = op.points.map((p) => p.x);
      const ys = op.points.map((p) => p.y);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    case 'path': {
      if (op.points.length === 0) return null;
      const xs = op.points.map((p) => p.x);
      const ys = op.points.map((p) => p.y);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    case 'text': {
      // Estimate text bbox (rough)
      const textWidth = op.text.length * (op.size * 0.6);
      return [op.x, op.y - op.size, op.x + textWidth, op.y + op.size];
    }
    case 'arrow':
      return [
        Math.min(op.x1, op.x2),
        Math.min(op.y1, op.y2),
        Math.max(op.x1, op.x2),
        Math.max(op.y1, op.y2),
      ];
    case 'eraser': {
      if (op.points.length === 0) return null;
      const xs = op.points.map((p) => p.x);
      const ys = op.points.map((p) => p.y);
      const minX = Math.min(...xs) - op.radius;
      const minY = Math.min(...ys) - op.radius;
      const maxX = Math.max(...xs) + op.radius;
      const maxY = Math.max(...ys) + op.radius;
      return [minX, minY, maxX, maxY];
    }
    case 'clear':
    case 'bg':
      return null;
  }
}

interface DrawingStore {
  // Canvas management
  canvases: Record<string, DrawingCanvasState>;
  activeCanvasId: string | null;

  // Active tool state
  activeTool: DrawingToolType;
  toolStyle: DrawStyle;

  // Draft state (for live preview during drag)
  draftOp: DrawOp | null;

  // Actions
  createCanvas: (name?: string, width?: number, height?: number) => string;
  deleteCanvas: (id: string) => void;
  setActiveCanvas: (id: string | null) => void;

  // Drawing
  applyOps: (canvasId: string, ops: DrawOp[], source: 'llm' | 'user') => void;
  setDraftOp: (op: DrawOp | null) => void;

  // Tool selection
  setActiveTool: (tool: DrawingToolType) => void;
  setToolStyle: (style: Partial<DrawStyle>) => void;

  // Undo/Redo
  undo: (canvasId: string) => void;
  redo: (canvasId: string) => void;
  canUndo: (canvasId: string) => boolean;
  canRedo: (canvasId: string) => boolean;

  // Clear
  clearCanvas: (canvasId: string) => void;
}

export const useDrawingStore = create<DrawingStore>((set, get) => ({
  canvases: {},
  activeCanvasId: null,
  activeTool: 'pen',
  toolStyle: { stroke: '#00e5ff', fill: null, strokeWidth: 2 },
  draftOp: null,

  createCanvas: (name?: string, width = 800, height = 600) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const canvas: DrawingCanvasState = {
      id,
      name: name ?? `Canvas ${Object.keys(get().canvases).length + 1}`,
      width,
      height,
      backgroundColor: '#1a1a2e',
      ops: [],
      objects: [],
      undoStack: [],
      redoStack: [],
      createdAt: Date.now(),
    };
    set((s) => ({
      canvases: { ...s.canvases, [id]: canvas },
      activeCanvasId: id,
    }));
    return id;
  },

  deleteCanvas: (id: string) => {
    set((s) => {
      const rest = { ...s.canvases };
      delete rest[id];
      return {
        canvases: rest,
        activeCanvasId: s.activeCanvasId === id ? null : s.activeCanvasId,
      };
    });
  },

  setActiveCanvas: (id: string | null) => {
    set({ activeCanvasId: id });
  },

  applyOps: (canvasId: string, ops: DrawOp[], source: 'llm' | 'user') => {
    set((s) => {
      const canvas = s.canvases[canvasId];
      if (!canvas) return s;

      const undoSnapshot = [...canvas.ops];
      const undoStack = [...canvas.undoStack, undoSnapshot].slice(-MAX_UNDO);

      let newOps = [...canvas.ops];
      let newObjects = [...canvas.objects];
      let newBg = canvas.backgroundColor;

      for (const op of ops) {
        if (op.kind === 'clear') {
          newOps = [];
          newObjects = [];
        } else if (op.kind === 'bg') {
          newBg = op.color;
        } else {
          // Add operation
          newOps.push(op);
          
          // Compute and track bounding box
          const bbox = computeBbox(op);
          if (bbox) {
            const objId = `obj_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            newObjects.push({
              id: objId,
              kind: op.kind,
              bbox,
              createdAt: Date.now(),
              source,
            });
          }
        }
      }

      return {
        canvases: {
          ...s.canvases,
          [canvasId]: {
            ...canvas,
            ops: newOps,
            objects: newObjects,
            backgroundColor: newBg,
            undoStack,
            redoStack: [],
          },
        },
      };
    });
  },

  setDraftOp: (op: DrawOp | null) => {
    set({ draftOp: op });
  },

  setActiveTool: (tool: DrawingToolType) => {
    set({ activeTool: tool });
  },

  setToolStyle: (style: Partial<DrawStyle>) => {
    set((s) => ({ toolStyle: { ...s.toolStyle, ...style } }));
  },

  undo: (canvasId: string) => {
    set((s) => {
      const canvas = s.canvases[canvasId];
      if (!canvas || canvas.undoStack.length === 0) return s;

      const undoStack = [...canvas.undoStack];
      const prevOps = undoStack.pop()!;
      const redoStack = [...canvas.redoStack, [...canvas.ops]];

      return {
        canvases: {
          ...s.canvases,
          [canvasId]: { ...canvas, ops: prevOps, undoStack, redoStack },
        },
      };
    });
  },

  redo: (canvasId: string) => {
    set((s) => {
      const canvas = s.canvases[canvasId];
      if (!canvas || canvas.redoStack.length === 0) return s;

      const redoStack = [...canvas.redoStack];
      const nextOps = redoStack.pop()!;
      const undoStack = [...canvas.undoStack, [...canvas.ops]];

      return {
        canvases: {
          ...s.canvases,
          [canvasId]: { ...canvas, ops: nextOps, undoStack, redoStack },
        },
      };
    });
  },

  canUndo: (canvasId: string) => {
    const canvas = get().canvases[canvasId];
    return !!canvas && canvas.undoStack.length > 0;
  },

  canRedo: (canvasId: string) => {
    const canvas = get().canvases[canvasId];
    return !!canvas && canvas.redoStack.length > 0;
  },

  clearCanvas: (canvasId: string) => {
    set((s) => {
      const canvas = s.canvases[canvasId];
      if (!canvas) return s;
      return {
        canvases: {
          ...s.canvases,
          [canvasId]: {
            ...canvas,
            ops: [],
            objects: [],
            undoStack: [...canvas.undoStack, [...canvas.ops]].slice(-MAX_UNDO),
            redoStack: [],
          },
        },
      };
    });
  },
}));