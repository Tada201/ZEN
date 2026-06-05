import React, { useRef, useEffect } from 'react';

interface VoiceOscilloscopeProps {
    analyserRef: React.RefObject<AnalyserNode | null>;
    isAiSpeaking: boolean;
    isActive: boolean;
}

const FFT_SIZE = 256;
const NUM_BARS = 19;
const BAR_WIDTH = 6;
const BAR_GAP = 5;

export const VoiceOscilloscope: React.FC<VoiceOscilloscopeProps> = ({ analyserRef, isAiSpeaking, isActive }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const frequencyDataRef = useRef(new Uint8Array(FFT_SIZE / 2));
    const requestRef = useRef<number | null>(null);
    const isMountedRef = useRef(false);
    
    // Sync props to refs to avoid stale closures in the animation loop
    const isAiSpeakingRef = useRef(isAiSpeaking);
    const isActiveRef = useRef(isActive);

    useEffect(() => {
        isAiSpeakingRef.current = isAiSpeaking;
        isActiveRef.current = isActive;
    }, [isAiSpeaking, isActive]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        isMountedRef.current = true;

        const drawRoundRect = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
            c.beginPath();
            if (c.roundRect) {
                c.roundRect(x, y, w, h, r);
            } else {
                // Fallback for older browsers
                let radius = r;
                if (w < 2 * radius) radius = w / 2;
                if (h < 2 * radius) radius = h / 2;
                c.moveTo(x + radius, y);
                c.arcTo(x + w, y, x + w, y + h, radius);
                c.arcTo(x + w, y + h, x, y + h, radius);
                c.arcTo(x, y + h, x, y, radius);
                c.arcTo(x, y, x + w, y, radius);
            }
            c.fill();
        };

        const animate = () => {
            if (!isMountedRef.current || !isActiveRef.current || document.hidden) {
                requestRef.current = null;
                return;
            }

            const width = canvas.width;
            const height = canvas.height;
            const analyser = analyserRef.current;
            const frequencyData = frequencyDataRef.current;

            ctx.clearRect(0, 0, width, height);

            const isSpeaking = isAiSpeakingRef.current;
            let currentGradient: CanvasGradient;

            // Generate GORGEOUS custom gradients matching user color guidelines
            const maxBarHeight = height * 0.7;
            const midY = height / 2;

            if (isSpeaking) {
                // Agent Speaking Gradient: Emerald to Cyan
                currentGradient = ctx.createLinearGradient(0, midY - maxBarHeight / 2, 0, midY + maxBarHeight / 2);
                currentGradient.addColorStop(0, '#06B6D4'); // Cyan
                currentGradient.addColorStop(0.5, '#10B981'); // Emerald
                currentGradient.addColorStop(1, '#06B6D4'); // Cyan
            } else if (analyser) {
                // User Speaking Gradient: Vibrant Pink to Purple
                currentGradient = ctx.createLinearGradient(0, midY - maxBarHeight / 2, 0, midY + maxBarHeight / 2);
                currentGradient.addColorStop(0, '#EC4899'); // Pink
                currentGradient.addColorStop(0.5, '#A855F7'); // Purple
                currentGradient.addColorStop(1, '#EC4899'); // Pink
            } else {
                // Idle Gradient: Muted Slate
                currentGradient = ctx.createLinearGradient(0, midY - 10, 0, midY + 10);
                currentGradient.addColorStop(0, '#64748B');
                currentGradient.addColorStop(1, '#475569');
            }

            ctx.fillStyle = currentGradient;

            // Calculate total width of the visualizer block to center it
            const totalWidth = NUM_BARS * BAR_WIDTH + (NUM_BARS - 1) * BAR_GAP;
            const startX = (width - totalWidth) / 2;

            if (!isSpeaking && analyser) {
                // Extract mic frequency data
                analyser.getByteFrequencyData(frequencyData);
            }

            const time = Date.now() * 0.004;

            for (let i = 0; i < NUM_BARS; i++) {
                // Center-mirror symmetric indices for cohesive wave movement
                const distFromCenter = Math.abs(i - Math.floor(NUM_BARS / 2));
                const sampleIndex = Math.max(0, Math.floor((NUM_BARS / 2 - distFromCenter) * 1.8));

                let scale = 0;
                
                if (isSpeaking) {
                    // AI speaking: Synthetic sine wave combined with breathing frequency
                    const baseWave = Math.sin(time * 1.5 + i * 0.3) * Math.cos(time * 0.7 - i * 0.15);
                    scale = Math.max(0.08, baseWave * (1.0 - (distFromCenter / NUM_BARS) * 0.6));
                } else if (analyser) {
                    // User speaking: Real-time frequency response
                    const rawVal = frequencyData[sampleIndex] || 0;
                    scale = rawVal / 255.0;
                    // Apply exponential smoothing for premium visual fluidity
                    scale = Math.pow(scale, 1.2);
                } else {
                    // Idle breathing state
                    scale = (Math.sin(time + i * 0.2) + 1) * 0.04;
                }

                // Smooth out the scale
                const barHeight = Math.max(6, scale * maxBarHeight);
                const x = startX + i * (BAR_WIDTH + BAR_GAP);
                const y = midY - barHeight / 2;

                drawRoundRect(ctx, x, y, BAR_WIDTH, barHeight, BAR_WIDTH / 2);
            }

            requestRef.current = requestAnimationFrame(animate);
        };

        const start = () => {
            if (!requestRef.current && isActiveRef.current && !document.hidden) {
                requestRef.current = requestAnimationFrame(animate);
            }
        };

        const stop = () => {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
                requestRef.current = null;
            }
        };

        const handleVisibilityChange = () => {
            if (document.hidden) stop();
            else start();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        start();

        return () => {
            isMountedRef.current = false;
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            stop();
        };
    }, [analyserRef, isActive]);

    return (
        <canvas 
            ref={canvasRef}
            width={600}
            height={96}
            className="w-full h-full block mx-auto filter drop-shadow-[0_0_12px_rgba(168,85,247,0.15)] dark:drop-shadow-[0_0_12px_rgba(6,182,212,0.15)]"
        />
    );
};
