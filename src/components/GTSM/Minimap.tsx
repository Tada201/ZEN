import React, { useRef, useEffect, useCallback } from 'react';
import { useGTSMStore } from '@/lib/stores/useGTSMStore';
import * as topojson from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';

// ─── Types ──────────────────────────────────────────────────────────
interface GeoCoord {
    type: string;
    coordinates: number[][][] | number[][][][];
}

// ─── Constants ──────────────────────────────────────────────────────
const CANVAS_W = 480;
const CANVAS_H = 240;
const ACCENT = '#00ffff';
const ACCENT_DIM = 'rgba(0,255,255,0.15)';
const LAND_FILL = 'rgba(0,255,255,0.04)';
const BORDER_COLOR = 'rgba(0,255,255,0.25)';
const GRID_COLOR = 'rgba(0,255,255,0.08)';
const CROSSHAIR_COLOR = 'rgba(0,255,255,0.7)';

// ─── Projection Helpers ─────────────────────────────────────────────
const lonToX = (lon: number) => ((lon + 180) / 360) * CANVAS_W;
const latToY = (lat: number) => ((90 - lat) / 180) * CANVAS_H;
const xToLon = (x: number) => (x / CANVAS_W) * 360 - 180;
const yToLat = (y: number) => 90 - (y / CANVAS_H) * 180;

// ─── Canvas Drawing Utilities ───────────────────────────────────────

function drawGrid(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 5]);

    for (let lon = -180; lon <= 180; lon += 30) {
        const x = lonToX(lon);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
    }
    for (let lat = -90; lat <= 90; lat += 30) {
        const y = latToY(lat);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(0,255,255,0.15)';
    ctx.lineWidth = 0.8;
    const eqY = latToY(0);
    ctx.beginPath(); ctx.moveTo(0, eqY); ctx.lineTo(CANVAS_W, eqY); ctx.stroke();
    const pmX = lonToX(0);
    ctx.beginPath(); ctx.moveTo(pmX, 0); ctx.lineTo(pmX, CANVAS_H); ctx.stroke();
}

function drawGeometry(ctx: CanvasRenderingContext2D, geo: GeoCoord, fill: boolean) {
    const rings: number[][][] =
        geo.type === 'MultiPolygon'
            ? (geo.coordinates as number[][][][]).flat()
            : (geo.coordinates as number[][][]);

    for (const ring of rings) {
        ctx.beginPath();
        for (let i = 0; i < ring.length; i++) {
            const x = lonToX(ring[i][0]);
            const y = latToY(ring[i][1]);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        if (fill) {
            ctx.fillStyle = LAND_FILL;
            ctx.fill();
        }
        ctx.strokeStyle = BORDER_COLOR;
        ctx.lineWidth = 0.6;
        ctx.stroke();
    }
}

function drawFOV(ctx: CanvasRenderingContext2D, lat: number, lon: number, alt: number) {
    const cx = lonToX(lon);
    const cy = latToY(lat);

    // Full-width crosshair lines through POV center
    ctx.save();
    ctx.strokeStyle = CROSSHAIR_COLOR;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([8, 4]);
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(CANVAS_W, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, CANVAS_H); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Scale FOV rectangle
    const maxAlt = 20_000_000;
    const scale = Math.min(0.40, Math.max(0.04, (alt / maxAlt) * 0.40));
    const boxW = CANVAS_W * scale;
    const boxH = CANVAS_H * scale;

    const x1 = cx - boxW / 2;
    const y1 = cy - boxH / 2;
    const cornerLen = Math.max(5, Math.min(boxW, boxH) * 0.2);

    ctx.fillStyle = 'rgba(0,255,255,0.03)';
    ctx.fillRect(x1, y1, boxW, boxH);

    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = ACCENT;
    ctx.shadowBlur = 4;

    // Corner brackets
    ctx.beginPath(); ctx.moveTo(x1, y1 + cornerLen); ctx.lineTo(x1, y1); ctx.lineTo(x1 + cornerLen, y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1 + boxW - cornerLen, y1); ctx.lineTo(x1 + boxW, y1); ctx.lineTo(x1 + boxW, y1 + cornerLen); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, y1 + boxH - cornerLen); ctx.lineTo(x1, y1 + boxH); ctx.lineTo(x1 + cornerLen, y1 + boxH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1 + boxW - cornerLen, y1 + boxH); ctx.lineTo(x1 + boxW, y1 + boxH); ctx.lineTo(x1 + boxW, y1 + boxH - cornerLen); ctx.stroke();

    // Center POV dot
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
}


// ═══════════════════════════════════════════════════════════════════
//  MINIMAP COMPONENT
// ═══════════════════════════════════════════════════════════════════

export const Minimap: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const offscreenRef = useRef<HTMLCanvasElement | null>(null);
    const geoLoadedRef = useRef(false);
    const rafRef = useRef<number>(0);
    const idleTimerRef = useRef<number | null>(null);
    const isVisibleRef = useRef(true);
    const renderFrameRef = useRef<() => void>(() => {});

    const setFlyToRequest = useGTSMStore(state => state.setFlyToRequest);
    const animationFps = 30; // Solid performance default

    // Visibility Observer
    useEffect(() => {
        if (!canvasRef.current) return;
        const observer = new IntersectionObserver(([entry]) => {
            isVisibleRef.current = entry.isIntersecting;
            if (entry.isIntersecting && rafRef.current === 0) {
                rafRef.current = requestAnimationFrame(renderFrameRef.current);
            }
        });
        observer.observe(canvasRef.current);
        return () => observer.disconnect();
    }, []);

    // ── Click-to-fly handler ────────────────────────────────────
    const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const clickX = ((e.clientX - rect.left) / rect.width) * CANVAS_W;
        const clickY = ((e.clientY - rect.top) / rect.height) * CANVAS_H;

        const lon = xToLon(clickX);
        const lat = yToLat(clickY);

        const currentAlt = useGTSMStore.getState().viewportCenter.alt;
        setFlyToRequest({ lat, lon, alt: currentAlt });
    }, [setFlyToRequest]);

    // ── Build the static world layer once ────────────────────────
    const buildWorldLayer = useCallback(async () => {
        if (geoLoadedRef.current) return;

        const offscreen = document.createElement('canvas');
        offscreen.width = CANVAS_W;
        offscreen.height = CANVAS_H;
        const ctx = offscreen.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        drawGrid(ctx);

        try {
            // Load natural earth high-performance topological boundaries
            const [landRes, countriesRes] = await Promise.all([
                fetch('/geo/land-110m.json'),
                fetch('/geo/countries-110m.json'),
            ]);

            const landTopo: Topology = await landRes.json();
            const countriesTopo: Topology = await countriesRes.json();

            const landGeo = topojson.feature(landTopo, landTopo.objects.land as GeometryCollection) as any;
            const countriesGeo = topojson.feature(countriesTopo, countriesTopo.objects.countries as GeometryCollection) as any;

            const landFeatures = landGeo.type === 'FeatureCollection' ? landGeo.features : [landGeo];
            for (const feature of landFeatures) {
                drawGeometry(ctx, feature.geometry as GeoCoord, true);
            }

            ctx.strokeStyle = ACCENT_DIM;
            ctx.lineWidth = 0.4;
            if (countriesGeo.type === 'FeatureCollection') {
                for (const feature of countriesGeo.features) {
                    drawGeometry(ctx, feature.geometry as GeoCoord, false);
                }
            }
        } catch (err) {
            console.warn('[Minimap] Failed to load Natural Earth data, falling back to grid:', err);
        }

        offscreenRef.current = offscreen;
        geoLoadedRef.current = true;
    }, []);

    useEffect(() => {
        buildWorldLayer();
    }, [buildWorldLayer]);

    // ── Throttled rAF render loop (gated by animationFps) ─────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const frameInterval = 1000 / animationFps;
        let lastFrameTime = 0;

        const stopIdleTimer = () => {
            if (idleTimerRef.current) {
                window.clearTimeout(idleTimerRef.current);
                idleTimerRef.current = null;
            }
        };

        const renderFrame = () => {
            if (!isVisibleRef.current) {
                rafRef.current = 0;
                stopIdleTimer();
                idleTimerRef.current = window.setTimeout(() => {
                    if (canvasRef.current && isVisibleRef.current && rafRef.current === 0) {
                        rafRef.current = requestAnimationFrame(renderFrame);
                    }
                }, 500);
                return;
            }

            const now = performance.now();
            if (now - lastFrameTime < frameInterval) {
                rafRef.current = requestAnimationFrame(renderFrame);
                return;
            }
            lastFrameTime = now;

            ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
            if (offscreenRef.current) {
                ctx.drawImage(offscreenRef.current, 0, 0);
            } else {
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
                drawGrid(ctx);
            }

            const center = useGTSMStore.getState().viewportCenter || { lat: 40.7127, lon: -74.0060, alt: 1280 };
            drawFOV(ctx, center.lat, center.lon, center.alt);

            rafRef.current = requestAnimationFrame(renderFrame);
        };

        renderFrameRef.current = renderFrame;
        rafRef.current = requestAnimationFrame(renderFrame);
        return () => {
            stopIdleTimer();
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = 0;
        };
    }, [animationFps]);

    return (
        <div className="w-full border border-border bg-background/40 p-0.5 backdrop-blur-md">
            <canvas
                ref={canvasRef}
                width={CANVAS_W}
                height={CANVAS_H}
                className="w-full h-auto cursor-crosshair opacity-85 hover:opacity-100 transition-opacity"
                onClick={handleCanvasClick}
            />
        </div>
    );
};

export default Minimap;
