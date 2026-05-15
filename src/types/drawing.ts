// Drawing canvas types

// Tools available in the UI toolbar
export type DrawingToolType =
  | 'select'
  | 'pen'        // freehand
  | 'line'
  | 'rectangle'
  | 'circle'
  | 'ellipse'
  | 'triangle'
  | 'polygon'
  | 'star'
  | 'arrow'
  | 'text'
  | 'eraser';

// Style for drawing operations
export interface DrawStyle {
  stroke: string;
  fill: string | null;
  strokeWidth: number;
}

// Discriminated union for all drawable operations
export type DrawOp =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; style: DrawStyle }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; style: DrawStyle }
  | { kind: 'circle'; x: number; y: number; r: number; style: DrawStyle }
  | { kind: 'ellipse'; x: number; y: number; rx: number; ry: number; style: DrawStyle }
  | { kind: 'polygon'; points: Array<{ x: number; y: number }>; style: DrawStyle }
  | { kind: 'path'; points: Array<{ x: number; y: number }>; style: DrawStyle }
  | { kind: 'text'; x: number; y: number; size: number; text: string; style: DrawStyle }
  | { kind: 'arrow'; x1: number; y1: number; x2: number; y2: number; style: DrawStyle }
  | { kind: 'eraser'; points: Array<{ x: number; y: number }>; radius: number }
  | { kind: 'clear' }
  | { kind: 'bg'; color: string };

// Object tracking (for spatial awareness)
export interface CanvasObject {
  id: string;  // unique ID for each object
  kind: string;  // 'line', 'circle', 'rect', etc.
  bbox: [number, number, number, number];  // [x1, y1, x2, y2]
  createdAt: number;
  source: 'llm' | 'user';
}

// Canvas state
export interface DrawingCanvasState {
  id: string;
  name: string;
  width: number;
  height: number;
  backgroundColor: string;
  ops: DrawOp[];
  objects: CanvasObject[];  // spatial tracking for LLM context
  undoStack: DrawOp[][];  // snapshots for undo
  redoStack: DrawOp[][];  // snapshots for redo
  createdAt: number;
}

// Export formats
export type DrawingExportFormat = 'png' | 'svg' | 'json';