import { useRef, useEffect, useCallback, useState } from 'react';
import { useDrawingStore } from '../../lib/stores/drawingStore';
import type { DrawOp, DrawingToolType } from '../../types/drawing';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { motion, AnimatePresence } from 'framer-motion';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';

// ── Color Palette ────────────────────────────────────────────────────────────
const COLOR_PALETTE = [
  '#00FF9F', '#00CCFF', '#FF00FF', '#FFCC00', '#FF3E3E', '#ffffff',
  '#000000', '#1A1A1A', '#333333', '#666666', '#999999', '#CCCCCC',
  '#FF5E00', '#BF00FF', '#00FFA3', '#4DFF00', '#FFDE00', '#0070FF',
];

const STROKE_WIDTHS = [1, 2, 4, 8, 12, 16];

// ── Render a single DrawOp ──────────────────────────────────────────────────
function renderOp(ctx: CanvasRenderingContext2D, op: DrawOp) {
  if (op.kind === 'clear' || op.kind === 'bg') return;
  ctx.save();
  switch (op.kind) {
    case 'line': {
      if (op.style.stroke) {
        ctx.strokeStyle = op.style.stroke;
        ctx.lineWidth = op.style.strokeWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(op.x1, op.y1);
        ctx.lineTo(op.x2, op.y2);
        ctx.stroke();
      }
      break;
    }
    case 'rect': {
      if (op.style.fill) {
        ctx.fillStyle = op.style.fill;
        ctx.fillRect(op.x, op.y, op.w, op.h);
      }
      if (op.style.stroke) {
        ctx.strokeStyle = op.style.stroke;
        ctx.lineWidth = op.style.strokeWidth;
        ctx.strokeRect(op.x, op.y, op.w, op.h);
      }
      break;
    }
    case 'circle': {
      ctx.beginPath();
      ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2);
      if (op.style.fill) {
        ctx.fillStyle = op.style.fill;
        ctx.fill();
      }
      if (op.style.stroke) {
        ctx.strokeStyle = op.style.stroke;
        ctx.lineWidth = op.style.strokeWidth;
        ctx.stroke();
      }
      break;
    }
    case 'ellipse': {
      ctx.beginPath();
      ctx.ellipse(op.x, op.y, Math.max(op.rx, 0.1), Math.max(op.ry, 0.1), 0, 0, Math.PI * 2);
      if (op.style.fill) {
        ctx.fillStyle = op.style.fill;
        ctx.fill();
      }
      if (op.style.stroke) {
        ctx.strokeStyle = op.style.stroke;
        ctx.lineWidth = op.style.strokeWidth;
        ctx.stroke();
      }
      break;
    }
    case 'polygon': {
      if (op.points.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(op.points[0].x, op.points[0].y);
      for (let i = 1; i < op.points.length; i++) ctx.lineTo(op.points[i].x, op.points[i].y);
      ctx.closePath();
      if (op.style.fill) {
        ctx.fillStyle = op.style.fill;
        ctx.fill();
      }
      if (op.style.stroke) {
        ctx.strokeStyle = op.style.stroke;
        ctx.lineWidth = op.style.strokeWidth;
        ctx.stroke();
      }
      break;
    }
    case 'path': {
      if (op.points.length < 2) break;
      if (op.style.stroke) {
        ctx.strokeStyle = op.style.stroke;
        ctx.lineWidth = op.style.strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(op.points[0].x, op.points[0].y);
        for (let i = 1; i < op.points.length; i++) ctx.lineTo(op.points[i].x, op.points[i].y);
        ctx.stroke();
      }
      break;
    }
    case 'text': {
      ctx.font = `${op.size}px 'JetBrains Mono', monospace`;
      ctx.fillStyle = op.style.stroke;
      ctx.textBaseline = 'top';
      ctx.fillText(op.text, op.x, op.y);
      break;
    }
    case 'arrow': {
      if (op.style.stroke) {
        const headLen = Math.max(10, op.style.strokeWidth * 4);
        const angle = Math.atan2(op.y2 - op.y1, op.x2 - op.x1);
        ctx.strokeStyle = op.style.stroke;
        ctx.lineWidth = op.style.strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(op.x1, op.y1);
        ctx.lineTo(op.x2, op.y2);
        ctx.stroke();
        ctx.fillStyle = op.style.stroke;
        ctx.beginPath();
        ctx.moveTo(op.x2, op.y2);
        ctx.lineTo(op.x2 - headLen * Math.cos(angle - Math.PI / 7), op.y2 - headLen * Math.sin(angle - Math.PI / 7));
        ctx.lineTo(op.x2 - headLen * Math.cos(angle + Math.PI / 7), op.y2 - headLen * Math.sin(angle + Math.PI / 7));
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'eraser': {
      if (op.points.length < 1) break;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = op.radius * 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(op.points[0].x, op.points[0].y);
      for (let i = 1; i < op.points.length; i++) ctx.lineTo(op.points[i].x, op.points[i].y);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function generateStarPoints(cx: number, cy: number, outerR: number, innerR: number, numPoints: number) {
  const points = [];
  for (let i = 0; i < numPoints * 2; i++) {
    const angle = (Math.PI / numPoints) * i - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return points;
}

interface InteractiveDrawingCanvasProps {
  minimal?: boolean;
}

export default function InteractiveDrawingCanvas({ minimal = false }: InteractiveDrawingCanvasProps) {
  const {
    canvases, activeCanvasId, activeTool, toolStyle, draftOp,
    createCanvas, setActiveTool, setToolStyle, setDraftOp,
    applyOps, undo, redo, canUndo, canRedo, clearCanvas,
  } = useDrawingStore();

  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Viewport state
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPos = useRef({ x: 0, y: 0 });

  const isDrawing = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const currentPoints = useRef<{ x: number; y: number }[]>([]);

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [colorPickerOpen, setColorPickerOpen] = useState<'stroke' | 'fill' | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });

  const canvasState = activeCanvasId ? canvases[activeCanvasId] : null;

  // ── Resize Observer ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Viewport Coordinate Conversion ───────────────────────────────────────
  const getCanvasCoords = useCallback((e: React.MouseEvent | MouseEvent) => {
    const el = viewportRef.current;
    if (!el || !canvasState) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    
    // Position relative to viewport center
    const rx = e.clientX - rect.left - viewportSize.width / 2;
    const ry = e.clientY - rect.top - viewportSize.height / 2;
    
    // Inverse transform
    const x = (rx - panOffset.x) / zoom + canvasState.width / 2;
    const y = (ry - panOffset.y) / zoom + canvasState.height / 2;
    
    return { x, y };
  }, [canvasState, zoom, panOffset, viewportSize]);

  // ── Redraw loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = baseCanvasRef.current?.getContext('2d');
    if (!ctx || !canvasState) return;

    ctx.canvas.width = viewportSize.width;
    ctx.canvas.height = viewportSize.height;

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.save();
    
    ctx.translate(viewportSize.width / 2, viewportSize.height / 2);
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-canvasState.width / 2, -canvasState.height / 2);

    ctx.fillStyle = canvasState.backgroundColor || '#0A0F0A';
    ctx.fillRect(0, 0, canvasState.width, canvasState.height);
    
    ctx.strokeStyle = 'rgba(0, 255, 159, 0.3)';
    ctx.lineWidth = 1 / zoom;
    ctx.strokeRect(0, 0, canvasState.width, canvasState.height);

    for (const op of canvasState.ops) renderOp(ctx, op);
    ctx.restore();
  }, [canvasState, zoom, panOffset, viewportSize]);

  useEffect(() => {
    const ctx = previewCanvasRef.current?.getContext('2d');
    if (!ctx || !canvasState) return;

    ctx.canvas.width = viewportSize.width;
    ctx.canvas.height = viewportSize.height;

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (!draftOp) return;

    ctx.save();
    ctx.translate(viewportSize.width / 2, viewportSize.height / 2);
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-canvasState.width / 2, -canvasState.height / 2);

    renderOp(ctx, draftOp);
    ctx.restore();
  }, [draftOp, canvasState, zoom, panOffset, viewportSize]);

  // ── Viewport Events ──────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(z => Math.max(0.1, Math.min(10, z * delta)));
    } else {
      setPanOffset(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  }, []);

  const handlePointerDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      lastPanPos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (!canvasState || !activeCanvasId) return;
    const pos = getCanvasCoords(e);
    isDrawing.current = true;
    startPos.current = pos;

    if (activeTool === 'pen' || activeTool === 'eraser') {
      currentPoints.current = [pos];
    }
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasCoords(e);
    setMousePos({ x: Math.round(pos.x), y: Math.round(pos.y) });

    if (isPanning) {
      const dx = e.clientX - lastPanPos.current.x;
      const dy = e.clientY - lastPanPos.current.y;
      setPanOffset(p => ({ x: p.x + dx, y: p.y + dy }));
      lastPanPos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (!isDrawing.current || !canvasState) return;

    const style = { stroke: toolStyle.stroke, fill: toolStyle.fill, strokeWidth: toolStyle.strokeWidth };

    if (activeTool === 'pen') {
      currentPoints.current.push(pos);
      setDraftOp({ kind: 'path', points: [...currentPoints.current], style });
    } else if (activeTool === 'eraser') {
      currentPoints.current.push(pos);
      setDraftOp({ kind: 'eraser', points: [...currentPoints.current], radius: toolStyle.strokeWidth * 4 });
    } else {
      const dx = pos.x - startPos.current.x;
      const dy = pos.y - startPos.current.y;
      let op: DrawOp | null = null;
      
      switch (activeTool) {
        case 'line': op = { kind: 'line', x1: startPos.current.x, y1: startPos.current.y, x2: pos.x, y2: pos.y, style }; break;
        case 'rectangle': op = { kind: 'rect', x: Math.min(startPos.current.x, pos.x), y: Math.min(startPos.current.y, pos.y), w: Math.abs(dx), h: Math.abs(dy), style }; break;
        case 'circle': op = { kind: 'circle', x: startPos.current.x, y: startPos.current.y, r: Math.sqrt(dx*dx+dy*dy), style }; break;
        case 'ellipse': op = { kind: 'ellipse', x: (startPos.current.x+pos.x)/2, y: (startPos.current.y+pos.y)/2, rx: Math.abs(dx)/2, ry: Math.abs(dy)/2, style }; break;
        case 'triangle': op = { kind: 'polygon', points: [{x:(startPos.current.x+pos.x)/2, y:Math.min(startPos.current.y,pos.y)}, {x:Math.min(startPos.current.x,pos.x), y:Math.max(startPos.current.y,pos.y)}, {x:Math.max(startPos.current.x,pos.x), y:Math.max(startPos.current.y,pos.y)}], style }; break;
        case 'star': op = { kind: 'polygon', points: generateStarPoints(startPos.current.x, startPos.current.y, Math.sqrt(dx*dx+dy*dy), Math.sqrt(dx*dx+dy*dy)/2.5, 5), style }; break;
        case 'arrow': op = { kind: 'arrow', x1: startPos.current.x, y1: startPos.current.y, x2: pos.x, y2: pos.y, style }; break;
      }
      if (op) setDraftOp(op);
    }
  };

  const handlePointerUp = () => {
    setIsPanning(false);
    if (!isDrawing.current || !canvasState || !activeCanvasId) return;
    isDrawing.current = false;

    const style = { stroke: toolStyle.stroke, fill: toolStyle.fill, strokeWidth: toolStyle.strokeWidth };

    if (activeTool === 'pen' && currentPoints.current.length >= 2) {
      applyOps(activeCanvasId, [{ kind: 'path', points: [...currentPoints.current], style }], 'user');
    } else if (activeTool === 'eraser' && currentPoints.current.length >= 1) {
      applyOps(activeCanvasId, [{ kind: 'eraser', points: [...currentPoints.current], radius: toolStyle.strokeWidth * 4 }], 'user');
    } else if (draftOp && draftOp.kind !== 'clear' && draftOp.kind !== 'bg') {
      applyOps(activeCanvasId, [draftOp], 'user');
    }

    currentPoints.current = [];
    setDraftOp(null);
  };

  if (!canvasState) {
    if (minimal) return null;
    return (
      <div className="flex-1 flex items-center justify-center bg-[#050505] font-mono">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center gap-6 p-12 sm:p-16 border border-[#00FF9F]/20 rounded-sm bg-[#0A0F0A] relative overflow-hidden"
        >
          <WorkbenchIcon name="codicon:edit" size={48} className="text-[#00FF9F] mb-2" />

          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-widest uppercase mb-2">Workspace Offline</h2>
            <p className="text-[#00FF9F]/60 text-sm font-mono tracking-tighter">INITIALIZE NEW CANVAS TO PROCEED</p>
          </div>
          <WorkbenchButton onClick={() => createCanvas()} className="flex items-center gap-3 px-8 py-3 bg-transparent border border-[#00FF9F] text-[#00FF9F] font-bold text-sm tracking-widest rounded-sm hover:bg-[#00FF9F]/10 hover:shadow-[0_0_15px_rgba(0,255,159,0.3)] active:scale-95 transition-all">
            <WorkbenchIcon name="codicon:add" size={18} />
            GENERATE CANVAS
          </WorkbenchButton>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full bg-[#050505] overflow-hidden group/draw font-mono">
      
      {/* ─── Top Floating HUD ─── */}
      {!minimal && (
        <AnimatePresence>
          <motion.div 
            initial={{ y: -50, opacity: 0 }} 
            animate={{ y: 0, opacity: 1 }}
            className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-1.5 bg-[#0A0F0A]/60 backdrop-blur-md border border-[#00FF9F]/20 rounded-xl shadow-2xl animate-fade-in"
          >
            <div className="flex items-center gap-1 border-r border-[#00FF9F]/10 pr-2 mr-2">
              <WorkbenchButton onClick={() => undo(activeCanvasId!)} disabled={!canUndo(activeCanvasId!)} className="p-2 text-[#00FF9F] hover:bg-[#00FF9F]/10 disabled:opacity-20 rounded-lg transition-colors"><WorkbenchIcon name="codicon:discard" size={16} /></WorkbenchButton>
              <WorkbenchButton onClick={() => redo(activeCanvasId!)} disabled={!canRedo(activeCanvasId!)} className="p-2 text-[#00FF9F] hover:bg-[#00FF9F]/10 disabled:opacity-20 rounded-lg transition-colors"><WorkbenchIcon name="codicon:redo" size={16} /></WorkbenchButton>
            </div>
            
            <div className="flex flex-col items-center min-w-[120px]">
              <span className="text-[10px] text-[#00FF9F]/40 leading-none mb-1">DATASTREAM: {activeCanvasId?.slice(0, 8)}</span>
              <span className="text-xs font-bold text-[#00FF9F] tracking-widest">{canvasState.name.toUpperCase()}</span>
            </div>

            <div className="flex items-center gap-1 border-l border-[#00FF9F]/10 pl-2 ml-2">
              <WorkbenchButton onClick={() => clearCanvas(activeCanvasId!)} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"><WorkbenchIcon name="codicon:trash" size={16} /></WorkbenchButton>
              <WorkbenchButton onClick={() => {
                const el = baseCanvasRef.current;
                if (el) {
                  const a = document.createElement('a');
                  a.href = el.toDataURL('image/png');
                  a.download = `${canvasState.name}.png`;
                  a.click();
                }
              }} className="p-2 text-[#b070ff] hover:bg-[#b070ff]/10 rounded-lg transition-colors"><WorkbenchIcon name="codicon:cloud-download" size={16} /></WorkbenchButton>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* ─── Main Viewport ─── */}
      <div 
        ref={viewportRef}
        onWheel={handleWheel}
        className="relative flex-1 cursor-crosshair overflow-hidden touch-none"
      >
        <canvas ref={baseCanvasRef} width={viewportSize.width} height={viewportSize.height} className="absolute inset-0 pointer-events-none" />
        <canvas 
          ref={previewCanvasRef} 
          width={viewportSize.width} 
          height={viewportSize.height} 
          className="absolute inset-0" 
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
        />
        
        {/* Viewport Info */}
        <div className="absolute top-6 right-6 flex flex-col items-end gap-1 opacity-40 select-none">
          <span className="text-[10px] text-[#00FF9F]">ZOOM: {Math.round(zoom * 100)}%</span>
          <span className="text-[10px] text-[#00FF9F]">POS: {Math.round(panOffset.x)}, {Math.round(panOffset.y)}</span>
        </div>
      </div>

      {/* ─── Bottom Floating ToolHUD ─── */}
      {!minimal && (
        <motion.div 
          initial={{ y: 100, opacity: 0 }} 
          animate={{ y: 0, opacity: 1 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-4 w-full max-w-2xl px-6"
        >
          <div className="flex items-center gap-2 p-1.5 bg-[#0A0F0A]/80 backdrop-blur-xl border border-[#00FF9F]/30 rounded-2xl shadow-[0_-20px_40px_-10px_rgba(0,0,0,0.5)]">
            {/* Main Tools */}
            <div className="flex items-center gap-1 p-1 bg-black/40 rounded-xl border border-[#00FF9F]/5">
              {[
                { id: 'select', icon: 'codicon:cursor-pointer', label: 'V' },
                { id: 'pen', icon: 'codicon:edit', label: 'P' },
                { id: 'line', icon: 'codicon:graph-line', label: 'L' },
                { id: 'rectangle', icon: 'codicon:symbol-rectangle', label: 'R' },
                { id: 'circle', icon: 'codicon:symbol-circle', label: 'C' },
                { id: 'star', icon: 'codicon:star-full', label: 'S' },
                { id: 'eraser', icon: 'codicon:diff-removed', label: 'E' },
              ].map(t => (
                <WorkbenchButton
                  key={t.id}
                  onClick={() => setActiveTool(t.id as DrawingToolType)}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-lg transition-all relative ${
                    activeTool === t.id ? 'bg-[#00FF9F] text-[#050505] shadow-[0_0_15px_rgba(0,255,159,0.4)]' : 'text-[#00FF9F]/60 hover:text-[#00FF9F] hover:bg-[#00FF9F]/10'
                  }`}
                >
                  <WorkbenchIcon name={t.icon} size={18} />
                  <span className="text-[8px] font-bold opacity-50 leading-none">{t.label}</span>
                  {activeTool === t.id && <motion.div layoutId="tool-glow" className="absolute inset-0 rounded-lg border-2 border-[#00FF9F] opacity-50" />}
                </WorkbenchButton>
              ))}
            </div>

            {/* Style Toggles */}
            <div className="flex items-center gap-1 ml-2 border-l border-[#00FF9F]/10 pl-2">
              <WorkbenchButton 
                onClick={() => setColorPickerOpen(colorPickerOpen === 'stroke' ? null : 'stroke')}
                className={`p-2.5 rounded-lg transition-all ${colorPickerOpen === 'stroke' ? 'bg-[#00FF9F]/20' : 'hover:bg-[#00FF9F]/10'}`}
              >
                <div className="w-5 h-5 rounded border border-white/20" style={{ backgroundColor: toolStyle.stroke }} title="Stroke Color" />
              </WorkbenchButton>
              <WorkbenchButton 
                onClick={() => setColorPickerOpen(colorPickerOpen === 'fill' ? null : 'fill')}
                className={`p-2.5 rounded-lg transition-all ${colorPickerOpen === 'fill' ? 'bg-[#00FF9F]/20' : 'hover:bg-[#00FF9F]/10'}`}
              >
                <div className="w-5 h-5 rounded border border-white/20 overflow-hidden relative" style={{ backgroundColor: toolStyle.fill || 'transparent' }} title="Fill Color">
                  {!toolStyle.fill && <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-rose-500/40 to-transparent rotate-45" />}
                </div>
              </WorkbenchButton>
              <select 
                value={toolStyle.strokeWidth}
                onChange={(e) => setToolStyle({ strokeWidth: Number(e.target.value) })}
                className="bg-transparent text-[#00FF9F] text-xs font-bold px-2 py-1 outline-none appearance-none hover:bg-[#00FF9F]/10 rounded transition-colors"
                title="Stroke Width"
              >
                {STROKE_WIDTHS.map(w => <option key={w} value={w}>{w}PX</option>)}
              </select>
            </div>
          </div>

          <AnimatePresence>
            {colorPickerOpen && (
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 10, opacity: 0 }}
                className="absolute bottom-24 p-4 bg-[#0A0F0A]/95 backdrop-blur-2xl border border-[#00FF9F]/40 rounded-2xl shadow-3xl"
              >
                <div className="grid grid-cols-6 gap-2">
                  {COLOR_PALETTE.map(c => (
                    <WorkbenchButton 
                      key={c}
                      onClick={() => {
                        setToolStyle(colorPickerOpen === 'stroke' ? { stroke: c } : { fill: c });
                        setColorPickerOpen(null);
                      }}
                      className={`w-8 h-8 rounded-lg shadow-lg hover:scale-110 transition-transform ${
                        (colorPickerOpen === 'stroke' ? toolStyle.stroke : toolStyle.fill) === c ? 'ring-2 ring-[#00FF9F] ring-offset-2 ring-offset-[#0A0F0A]' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  {colorPickerOpen === 'fill' && (
                    <WorkbenchButton 
                      onClick={() => { setToolStyle({ fill: null }); setColorPickerOpen(null); }}
                      className="w-8 h-8 rounded-lg border border-[#00FF9F]/20 flex items-center justify-center hover:bg-rose-500/10 hover:border-rose-500/50 transition-colors"
                    >
                      <WorkbenchIcon name="codicon:close" size={16} className="text-white/40" />
                    </WorkbenchButton>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ─── Cursor HUD ─── */}
      <div className="absolute bottom-4 right-6 text-[9px] text-[#00FF9F]/40 flex gap-4 select-none">
        <span>X:{mousePos.x} Y:{mousePos.y}</span>
        <span>GRID_LOCK: ON</span>
        <span>RENDER: GPU_ACCEL</span>
        <span>REFRESH: 60FPS</span>
      </div>
    </div>
  );
}
