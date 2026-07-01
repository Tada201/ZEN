import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { VOICE_PTT_TOGGLE_EVENT } from "./usePushToTalk";

interface VoiceOscilloscopeProps {
  analyserRef: React.RefObject<AnalyserNode | null>;
  isAiSpeaking: boolean;
  isActive: boolean;
  isCapturing: boolean;
  voiceInputMode: boolean;
  amplitude?: number;
  playbackEnergy?: number;
}

const LIMIT_MS = 20_000;
const layers = [
  { width: 0.5, opacity: 0.14, harmonic: 8, freq: 14, burst: 0.9, sharp: 0.18, decay: 3.2, seed: 10 },
  { width: 0.9, opacity: 0.24, harmonic: 4, freq: 7, burst: 0.6, sharp: 0.34, decay: 2.4, seed: 200 },
  { width: 1.5, opacity: 0.42, harmonic: 2, freq: 3.5, burst: 0.4, sharp: 0.5, decay: 1.7, seed: 350 },
  { width: 3.0, opacity: 0.96, harmonic: 1, freq: 1.4, burst: 0.25, sharp: 0.65, decay: 1.2, seed: 500 },
];
const WAVE_RGB = "255,255,255";

const fract = (value: number) => value - Math.floor(value);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const hash = (x: number, seed: number) => fract(Math.sin(x * 127.1 + seed * 311.7) * 43758.5453);
function smoothNoise(x: number, seed: number) {
  const floor = Math.floor(x);
  return mix(hash(floor, seed), hash(floor + 1, seed), smoothstep(fract(x)));
}
function fbm(x: number, seed: number, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * (smoothNoise(x * freq, seed + i * 17) * 2 - 1);
    amp *= 0.5;
    freq *= 2.05;
  }
  return sum;
}
function rms(samples: Float32Array) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

function MicGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <path d="M12 14.5a3 3 0 0 0 3-3v-5a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" fill="currentColor" />
      <path d="M6.8 10.7a.9.9 0 0 1 1.8 0 3.4 3.4 0 0 0 6.8 0 .9.9 0 0 1 1.8 0 5.2 5.2 0 0 1-4.3 5.1v2h2.2a.9.9 0 0 1 0 1.8H8.9a.9.9 0 1 1 0-1.8h2.2v-2a5.2 5.2 0 0 1-4.3-5.1Z" fill="currentColor" opacity=".72" />
    </svg>
  );
}

export const VoiceOscilloscope: React.FC<VoiceOscilloscopeProps> = ({
  analyserRef,
  isAiSpeaking,
  isActive,
  isCapturing,
  voiceInputMode,
  amplitude = 0,
  playbackEnergy = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const timeDataRef = useRef(new Float32Array(1024));
  const frequencyRef = useRef(new Uint8Array(512));
  const energyRef = useRef(0);
  const previousEnergyRef = useRef(0);
  const playbackLevelRef = useRef(0);
  const captureStartRef = useRef<number | null>(null);
  const lastProgressRef = useRef(0);
  const [expanded, setExpanded] = useState(false);
  const [limitProgress, setLimitProgress] = useState(0);
  const refs = useRef({ isAiSpeaking, isActive, isCapturing, amplitude, playbackEnergy });

  useEffect(() => { refs.current = { isAiSpeaking, isActive, isCapturing, amplitude, playbackEnergy }; }, [isAiSpeaking, isActive, isCapturing, amplitude, playbackEnergy]);
  useEffect(() => {
    captureStartRef.current = isCapturing ? performance.now() : null;
    if (!isCapturing) {
      lastProgressRef.current = 0;
      setLimitProgress(0);
    }
  }, [isCapturing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !ctx) return;
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * pixelRatio));
      canvas.height = Math.max(1, Math.floor(rect.height * pixelRatio));
    };
    const drawLayer = (layer: typeof layers[number], time: number, energy: number, width: number, height: number, fill = false) => {
      const centerY = height / 2;
      const maxAmp = height * 0.4;
      const points: Array<[number, number]> = [];
      const dataLen = timeDataRef.current.length;
      const state = refs.current;
      const isMicActive = (state.isCapturing || (!voiceInputMode && energy > 0.015));

      for (let px = 0; px <= width; px += pixelRatio * 2) {
        const nx = px / width;

        // 1. Real Microphone Oscilloscope
        const sampleIndex = Math.min(dataLen - 1, Math.max(0, Math.floor(nx * dataLen)));
        const nextSampleIndex = Math.min(dataLen - 1, sampleIndex + 1);
        const sampleFraction = (nx * dataLen) - sampleIndex;
        const rawAudio = isMicActive ? (timeDataRef.current[sampleIndex] * (1 - sampleFraction) + timeDataRef.current[nextSampleIndex] * sampleFraction) : 0;

        // 2. Synthesized AI Oscilloscope (Modulated by real TTS RMS envelope)
        const baseFreq = 40 + layer.harmonic * 4;
        const aiPhase = nx * baseFreq - time * 15;
        const breath = fbm(nx * 50 - time * 5, layer.seed, 2) * 0.15;
        const aiWave = Math.sin(aiPhase) * 0.5 + Math.sin(aiPhase * 2.13) * 0.3 + Math.sin(aiPhase * 3.74) * 0.2 + breath;
        const aiAmplitude = state.isAiSpeaking ? playbackLevelRef.current * 2.2 : 0;

        // 3. Ambient Organic Fluidity
        const micro = fbm(nx * 12 + time * 0.6, layer.seed + 11, 2) * maxAmp * 0.04;

        // Combine contributions with layer variations for 3D stereoscopic effect
        const layerPhaseShift = layer.harmonic * 0.05;
        const audioContribution = rawAudio * maxAmp * 2.5 * (1 + layerPhaseShift);
        const aiContribution = aiWave * maxAmp * aiAmplitude * (0.8 + layer.width * 0.1);
        
        // Taper the ends of the wave smoothly into the edges
        const windowMultiplier = Math.pow(Math.sin(nx * Math.PI), 0.8);

        const value = (audioContribution + aiContribution + micro) * windowMultiplier;

        points.push([px, centerY + value]);
      }

      if (fill && points.length > 1) {
        const gradient = ctx.createLinearGradient(0, centerY - maxAmp, 0, centerY + maxAmp);
        gradient.addColorStop(0, `rgba(${WAVE_RGB}, 0)`);
        gradient.addColorStop(0.5, `rgba(${WAVE_RGB}, 0.08)`);
        gradient.addColorStop(1, `rgba(${WAVE_RGB}, 0)`);
        ctx.beginPath();
        points.forEach(([x, y], index) => index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      ctx.beginPath();
      points.forEach(([x, y], index) => index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = layer.width * pixelRatio * (energy < 0.015 ? 0.6 : 1.2);
      ctx.strokeStyle = `rgba(${WAVE_RGB}, ${energy < 0.015 ? 0.18 : layer.opacity * 1.2})`;
      ctx.stroke();
    };
    const draw = () => {
      const state = refs.current;
      if (!state.isActive || document.hidden) { rafRef.current = null; return; }
      resize();
      const width = canvas.width;
      const height = canvas.height;
      const analyser = analyserRef.current;
      let audioEnergy = 0;
      if ((state.isCapturing || !voiceInputMode) && analyser) {
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.2;
        analyser.getFloatTimeDomainData(timeDataRef.current);
        analyser.getByteFrequencyData(frequencyRef.current);
        const speechBins = frequencyRef.current.slice(5, 48);
        audioEnergy = Math.max(rms(timeDataRef.current) * 12, speechBins.reduce((a, b) => a + b, 0) / Math.max(1, speechBins.length) / 140);
      }
      playbackLevelRef.current += (state.playbackEnergy - playbackLevelRef.current) * (state.playbackEnergy > playbackLevelRef.current ? 0.45 : 0.12);
      const playbackPulse = state.isAiSpeaking
        ? Math.max(playbackLevelRef.current * 1.5, Math.max(0, fbm(performance.now() / 100, 880, 4)) * 0.3)
        : 0;
      const activeTarget = state.isAiSpeaking || state.isCapturing || (!voiceInputMode && audioEnergy > 0.025);
      const target = activeTarget ? Math.min(1, Math.max(audioEnergy, state.amplitude * 1.8, playbackPulse)) : 0;

      previousEnergyRef.current += (target - previousEnergyRef.current) * 0.35;
      energyRef.current += (target - energyRef.current) * 0.18;
      const time = performance.now() / 1000;
      const finalEnergy = energyRef.current * (0.9 + Math.sin(time * 0.8) * 0.1);
      setExpanded((current) => current === activeTarget ? current : activeTarget);
      const nextProgress = captureStartRef.current ? Math.min(1, (performance.now() - captureStartRef.current) / LIMIT_MS) : 0;
      if (Math.abs(nextProgress - lastProgressRef.current) > 0.01 || nextProgress === 0 || nextProgress === 1) {
        lastProgressRef.current = nextProgress;
        setLimitProgress(nextProgress);
      }
      ctx.clearRect(0, 0, width, height);
      layers.forEach((layer, index) => {
        drawLayer(layer, time, finalEnergy, width, height, index >= 2 && finalEnergy > 0.02);
      });
      rafRef.current = requestAnimationFrame(draw);
    };
    window.addEventListener("resize", resize);
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [analyserRef, voiceInputMode]);

  const togglePtt = () => {
    if (!voiceInputMode || !isActive) return;
    window.dispatchEvent(new Event(VOICE_PTT_TOGGLE_EVENT));
  };

  return (
    <button
      type="button"
      onClick={togglePtt}
      className={cn(
        "relative h-[70px] overflow-hidden border border-border/20 bg-card/[0.025] p-2 text-primary-foreground shadow-[0_0_24px_hsl(var(--foreground) / 0.04)] transition-[width,border-radius,background-color,box-shadow] duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)]",
        expanded ? "w-[280px] rounded-[35px] bg-card/[0.035]" : "w-[70px] rounded-[22px]",
        voiceInputMode ? "cursor-pointer hover:border-border/45" : "cursor-default",
      )}
      title={voiceInputMode ? (isCapturing ? "Stop speaking" : "Click or hold Space to speak") : "Voice activity mode"}
      aria-label={voiceInputMode ? (isCapturing ? "Stop speaking" : "Start speaking") : "Voice waveform"}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-80"
        style={{
          background: isCapturing ? `conic-gradient(from -90deg, hsl(var(--foreground) / .95) ${limitProgress * 360}deg, hsl(var(--foreground) / .12) 0deg)` : "transparent",
          mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          padding: 1,
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />
      <span className={cn("absolute inset-0 flex items-center justify-center transition-opacity duration-200", expanded ? "opacity-0" : "opacity-100")}>
        <MicGlyph />
      </span>
      <canvas ref={canvasRef} className={cn("block h-full w-full transition-opacity duration-300", expanded ? "opacity-100" : "opacity-0")} />
    </button>
  );
};
