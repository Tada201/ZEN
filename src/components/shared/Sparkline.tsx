import { useRef, useEffect } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';

interface SparklineProps {
    data: number[];
    color: string;
    height?: number;
    showDot?: boolean;
    millisPerPixel?: number;
    lineWidth?: number;
    shadowBlur?: number;
    maxValue?: number;
    delay?: number; // Delay in ms to allow for smooth interpolation
}

export function Sparkline({
    data,
    color,
    height = 30,
    showDot = false,
    millisPerPixel = 50,
    lineWidth = 1.5,
    shadowBlur = 0,
    maxValue,
    delay = 1000
}: SparklineProps) {
    const animationFps = useSettingsStore(state => state.animationFpsCap ?? 30);
    const widgetAnimations = useSettingsStore(state => state.animationsEnabled ?? true);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const bufferRef = useRef<{ val: number, time: number }[]>([]);
    const requestRef = useRef<number | null>(null);
    const renderFnRef = useRef<(() => void) | null>(null);
    const margin = 4;

    // Update buffer when new data arrives
    useEffect(() => {
        if (data.length === 0) return;
        const lastVal = data[data.length - 1];
        bufferRef.current.push({ val: lastVal, time: Date.now() });

        // Keep buffer reasonably sized (e.g., 60 seconds of historical context)
        const cutoff = Date.now() - (1000 * 60);
        if (bufferRef.current.length > 500) {
            bufferRef.current = bufferRef.current.filter(d => d.time > cutoff);
        }

        // When animations are off, trigger a single render on data change
        if (!widgetAnimations && renderFnRef.current) {
            requestRef.current = requestAnimationFrame(renderFnRef.current);
        }
    }, [data, widgetAnimations]);

    useEffect(() => {
        const frameInterval = 1000 / animationFps;
        let lastFrameTime = 0;
        // Guards the self-rescheduling rAF loop: once cleanup runs, in-flight
        // render() calls must not queue another frame on an unmounted canvas.
        let cancelled = false;

        const render = () => {
            if (cancelled) return;
            // Throttle to animationFps when running in rAF loop
            if (widgetAnimations) {
                const now = performance.now();
                if (now - lastFrameTime < frameInterval) {
                    requestRef.current = requestAnimationFrame(render);
                    return;
                }
                lastFrameTime = now;
            }

            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const width = rect.width;
            const displayHeight = height;

            if (canvas.width !== width * dpr || canvas.height !== displayHeight * dpr) {
                canvas.width = width * dpr;
                canvas.height = displayHeight * dpr;
                ctx.scale(dpr, dpr);
            }

            ctx.clearRect(0, 0, width, displayHeight);

            const now = Date.now();
            const renderTime = now - delay;
            const effectiveHeight = displayHeight - (margin * 2);
            const points = bufferRef.current;

            if (points.length < 1) {
                if (widgetAnimations) {
                    requestRef.current = requestAnimationFrame(render);
                }
                return;
            }

            // Determine max in currently visible range for scaling
            const visibleCutoff = renderTime - (width * millisPerPixel);
            const visiblePoints = points.filter(p => p.time >= visibleCutoff - 2000);
            const currentMax = maxValue || Math.max(...visiblePoints.map(p => p.val), 1);

            // Resolve any var(--x) occurrences (bare or wrapped, e.g. hsl(var(--primary)))
            // since canvas strokeStyle cannot resolve CSS custom properties itself.
            let resolvedColor = color;
            if (color.includes('var(')) {
                const rootStyle = getComputedStyle(document.documentElement);
                resolvedColor = color.replace(/var\((--[^),]+)\)/g, (_, name) =>
                    rootStyle.getPropertyValue(name).trim() || '0 0% 100%'
                );
            }

            // Step 1: Determine the horizon point (interpolated value at now - delay)
            const horizonPoints = points.filter(p => p.time <= renderTime).slice(-1);
            const futurePoints = points.filter(p => p.time > renderTime).slice(0, 1);

            let horizonY: number | null = null;
            if (horizonPoints.length && futurePoints.length) {
                const pPrev = horizonPoints[0];
                const pNext = futurePoints[0];
                const ratio = (renderTime - pPrev.time) / (pNext.time - pPrev.time);
                const interpVal = pPrev.val + (pNext.val - pPrev.val) * ratio;
                horizonY = displayHeight - margin - ((interpVal / currentMax) * effectiveHeight);
            } else if (horizonPoints.length) {
                horizonY = displayHeight - margin - ((horizonPoints[0].val / currentMax) * effectiveHeight);
            }

            ctx.beginPath();
            ctx.lineWidth = lineWidth;
            ctx.strokeStyle = resolvedColor;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            if (shadowBlur > 0) {
                ctx.shadowBlur = shadowBlur;
                ctx.shadowColor = resolvedColor;
            }

            // Filter points: We need points up to the renderTime
            const ptsToDraw = points.filter(p => p.time <= renderTime + 500);

            if (ptsToDraw.length >= 2) {
                let first = true;
                for (let i = 0; i < ptsToDraw.length - 1; i++) {
                    const p1 = ptsToDraw[i];
                    const p2 = ptsToDraw[i + 1];

                    const x1 = width - ((renderTime - p1.time) / millisPerPixel);
                    const y1 = displayHeight - margin - ((p1.val / currentMax) * effectiveHeight);
                    const x2 = width - ((renderTime - p2.time) / millisPerPixel);
                    const y2 = displayHeight - margin - ((p2.val / currentMax) * effectiveHeight);

                    if (x1 < -width && x2 < -width) continue;

                    if (first) {
                        ctx.moveTo(x1, y1);
                        first = false;
                    }

                    const xc = (x1 + x2) / 2;
                    const yc = (y1 + y2) / 2;
                    ctx.quadraticCurveTo(x1, y1, xc, yc);

                    if (x2 > width) break;
                }
            }

            // Ensure the line connects to the horizonY at x=width
            if (horizonY !== null) {
                if (ptsToDraw.length < 2) {
                    ctx.moveTo(0, horizonY);
                }
                ctx.lineTo(width, horizonY);
            }

            ctx.stroke();

            // Draw active dot at the horizon
            if (showDot && horizonY !== null) {
                ctx.beginPath();
                ctx.arc(width - 2, horizonY, 2, 0, Math.PI * 2);
                ctx.fillStyle = resolvedColor;
                ctx.fill();
            }

            if (widgetAnimations) {
                requestRef.current = requestAnimationFrame(render);
            }
        };

        renderFnRef.current = render;

        if (widgetAnimations) {
            requestRef.current = requestAnimationFrame(render);
        } else {
            render();
        }

        return () => {
            cancelled = true;
            renderFnRef.current = null;
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [color, height, showDot, millisPerPixel, lineWidth, shadowBlur, maxValue, delay, animationFps, widgetAnimations]);

    return (
        <canvas
            ref={canvasRef}
            style={{ width: '100%', height: `${height}px`, display: 'block' }}
        />
    );
}
