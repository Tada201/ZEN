import React, { useRef, useEffect } from 'react';

interface VoiceOscilloscopeProps {
    analyserRef: React.RefObject<AnalyserNode | null>;
    isAiSpeaking: boolean;
    isActive: boolean;
}

const FFT_SIZE = 256;

export const VoiceOscilloscope: React.FC<VoiceOscilloscopeProps> = ({ analyserRef, isAiSpeaking, isActive }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const timeDataRef = useRef(new Uint8Array(FFT_SIZE));
    const requestRef = useRef<number | null>(null);
    const isRunningRef = useRef(false);
    
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

        isRunningRef.current = true;

        const animate = () => {
            if (!isRunningRef.current) return;
            
            // If not active, just pulse the loop but don't draw
            if (!isActiveRef.current) {
                requestRef.current = requestAnimationFrame(animate);
                return;
            }

            const width = canvas.width;
            const height = canvas.height;
            const analyser = analyserRef.current;
            const timeData = timeDataRef.current;

            ctx.clearRect(0, 0, width, height);

            if (isAiSpeakingRef.current) {
                // Synthetic Wave for AI (Cyan)
                ctx.beginPath();
                ctx.strokeStyle = '#00FF9F';
                ctx.lineWidth = 2;
                const time = Date.now();
                for (let i = 0; i < width; i++) {
                    const x = i;
                    const val = Math.sin(i * 0.05 + time * 0.01) * Math.cos(i * 0.01 + time * 0.005);
                    const y = (height / 2) + val * (height / 3);
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
            } else if (analyser) {
                // Mic Data (Lime)
                analyser.getByteTimeDomainData(timeData);
                ctx.beginPath();
                ctx.strokeStyle = '#39FF14';
                ctx.lineWidth = 2;
                const sliceWidth = width / FFT_SIZE;
                let x = 0;

                for (let i = 0; i < FFT_SIZE; i++) {
                    const v = timeData[i] / 128.0;
                    const y = (v * height) / 2;
                    // Apply Gaussian window to smooth edges
                    const nx = (i / FFT_SIZE) * 2 - 1; 
                    const window = Math.exp(-4 * nx * nx); 
                    const smoothedY = (height / 2) + (y - height / 2) * window;

                    if (i === 0) ctx.moveTo(x, smoothedY);
                    else ctx.lineTo(x, smoothedY);
                    x += sliceWidth;
                }
                ctx.stroke();
            } else {
                // Static baseline if no data
                ctx.beginPath();
                ctx.strokeStyle = '#00FF9F22'; // Faint cyan
                ctx.moveTo(0, height / 2);
                ctx.lineTo(width, height / 2);
                ctx.stroke();
            }

            requestRef.current = requestAnimationFrame(animate);
        };

        requestRef.current = requestAnimationFrame(animate);

        return () => {
            isRunningRef.current = false;
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
                requestRef.current = null;
            }
        };
    }, [analyserRef]); 

    return (
        <canvas 
            ref={canvasRef}
            width={600}
            height={160}
            className="w-full h-full block"
        />
    );
};
