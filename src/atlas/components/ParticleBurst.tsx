import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../hooks/useReducedMotion";

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export function useParticleBurst() {
  const [particles, setParticles] = useState<Particle[]>([]);
  const idRef = useRef(0);
  const reduced = useReducedMotion();
  const rafRef = useRef<number>(0);

  const spawn = useCallback((x: number, y: number, count = 12) => {
    if (reduced) return;
    const next: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 2 + Math.random() * 4;
      next.push({
        id: idRef.current++,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color: `hsl(var(--primary) / ${0.6 + Math.random() * 0.4})`,
      });
    }
    setParticles((prev) => [...prev, ...next]);
  }, [reduced]);

  useEffect(() => {
    if (particles.length === 0) return;
    let running = true;
    const tick = () => {
      if (!running) return;
      setParticles((prev) => {
        const updated = prev
          .map((p) => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
            vy: p.vy + 0.15,
            life: p.life - 0.03,
          }))
          .filter((p) => p.life > 0);
        return updated;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [particles.length]);

  const canvas = particles.length > 0 ? (
    <svg className="pointer-events-none fixed inset-0 z-[100]" style={{ width: "100vw", height: "100vh" }}>
      {particles.map((p) => (
        <circle
          key={p.id}
          cx={p.x}
          cy={p.y}
          r={3 * p.life}
          fill={p.color}
          opacity={p.life}
        />
      ))}
    </svg>
  ) : null;

  return { spawn, canvas };
}
