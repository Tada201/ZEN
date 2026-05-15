
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type InspectorState = {
  liveLabOpen: boolean;
  setLiveLabOpen: (b: boolean) => void;
  fps: number;
  frameDelta: number;
  renderCount: number;
  gridOverlay: boolean;
  setGridOverlay: (b: boolean) => void;
};

const Ctx = createContext<InspectorState | null>(null);

export function InspectorProvider({ children }: { children: ReactNode }) {
  const [liveLabOpen, setLiveLabOpen] = useState(false);
  const [fps, setFps] = useState(60);
  const [frameDelta, setFrameDelta] = useState(16);
  const [renderCount, setRenderCount] = useState(0);
  const [gridOverlay, setGridOverlay] = useState(false);

  const frameRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const prevTimeRef = useRef(performance.now());
  const rafRef = useRef(0);

  // Track re-renders of the app (Removed due to infinite loop)

  // FPS monitor
  useEffect(() => {
    if (!liveLabOpen) return;
    let running = true;
    const loop = () => {
      if (!running) return;
      const now = performance.now();
      const delta = now - lastTimeRef.current;
      const frameTime = now - prevTimeRef.current;
      prevTimeRef.current = now;

      if (delta >= 500) {
        setFps(Math.round((frameRef.current / delta) * 1000));
        setFrameDelta(Math.round(frameTime));
        frameRef.current = 0;
        lastTimeRef.current = now;
      }
      frameRef.current++;
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [liveLabOpen]);

  // Grid overlay
  useEffect(() => {
    if (!gridOverlay) {
      const existing = document.getElementById("live-lab-grid");
      if (existing) existing.remove();
      return;
    }
    const div = document.createElement("div");
    div.id = "live-lab-grid";
    div.style.cssText = `
      position: fixed; inset: 0; z-index: 9998; pointer-events: none;
      background-image: linear-gradient(hsl(var(--primary) / 0.06) 1px, transparent 1px),
        linear-gradient(90deg, hsl(var(--primary) / 0.06) 1px, transparent 1px);
      background-size: 24px 24px;
    `;
    document.body.appendChild(div);
    return () => div.remove();
  }, [gridOverlay]);

  const value = useMemo<InspectorState>(() => ({
    liveLabOpen, setLiveLabOpen, fps, frameDelta, renderCount, gridOverlay, setGridOverlay,
  }), [liveLabOpen, fps, frameDelta, renderCount, gridOverlay]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInspector() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useInspector must be used inside InspectorProvider");
  return v;
}
