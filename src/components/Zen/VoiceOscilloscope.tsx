import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils/style';

interface VoiceOscilloscopeProps {
  analyserRef?: React.RefObject<AnalyserNode | null>;
  isAiSpeaking?: boolean;
  isActive?: boolean;
  className?: string;
}

const FFT_SIZE = 256;

export const VoiceOscilloscope: React.FC<VoiceOscilloscopeProps> = ({
  analyserRef,
  isAiSpeaking = false,
  isActive = true,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeDataRef = useRef(new Uint8Array(FFT_SIZE));
  const requestRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);
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
      if (!isActiveRef.current) {
        requestRef.current = requestAnimationFrame(animate);
        return;
      }

      const width = canvas.width;
      const height = canvas.height;
      const analyser = analyserRef?.current;
      const timeData = timeDataRef.current;

      ctx.clearRect(0, 0, width, height);

      if (isAiSpeakingRef.current) {
        // AI Wave — UI Atlas primary color
        ctx.beginPath();
        ctx.strokeStyle = 'hsl(262 83% 65%)';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'hsl(262 83% 65%)';
        ctx.shadowBlur = 6;
        const time = Date.now();
        for (let i = 0; i < width; i++) {
          const x = i;
          const val = Math.sin(i * 0.05 + time * 0.01) * Math.cos(i * 0.01 + time * 0.005);
          const y = (height / 2) + val * (height / 3);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (analyser) {
        // Mic Data — UI Atlas success green
        analyser.getByteTimeDomainData(timeData);
        ctx.beginPath();
        ctx.strokeStyle = 'hsl(160 84% 39%)';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'hsl(160 84% 39%)';
        ctx.shadowBlur = 4;
        const sliceWidth = width / FFT_SIZE;
        let x = 0;

        for (let i = 0; i < FFT_SIZE; i++) {
          const v = timeData[i] / 128.0;
          const y = (v * height) / 2;
          const nx = (i / FFT_SIZE) * 2 - 1;
          const window = Math.exp(-4 * nx * nx);
          const smoothedY = (height / 2) + (y - height / 2) * window;

          if (i === 0) ctx.moveTo(x, smoothedY);
          else ctx.lineTo(x, smoothedY);
          x += sliceWidth;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        // Static baseline
        ctx.beginPath();
        ctx.strokeStyle = 'hsl(262 83% 65% / 0.15)';
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
      className={cn('w-full h-full block', className)}
    />
  );
};