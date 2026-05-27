import type { DrawOp } from '@/types/drawing';

export const COLOR_PALETTE = [
  '#00FF9F', '#00CCFF', '#FF00FF', '#FFCC00', '#FF3E3E', '#ffffff',
  '#000000', '#1A1A1A', '#333333', '#666666', '#999999', '#CCCCCC',
  '#FF5E00', '#BF00FF', '#00FFA3', '#4DFF00', '#FFDE00', '#0070FF',
];

export const STROKE_WIDTHS = [1, 2, 4, 8, 12, 16];

export function renderOp(ctx: CanvasRenderingContext2D, op: DrawOp) {
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

export function generateStarPoints(cx: number, cy: number, outerR: number, innerR: number, numPoints: number) {
  const points = [];
  for (let i = 0; i < numPoints * 2; i++) {
    const angle = (Math.PI / numPoints) * i - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return points;
}
