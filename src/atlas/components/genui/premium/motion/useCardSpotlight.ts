import { useCallback, useRef, useState, type CSSProperties } from "react";

interface SpotlightState {
  x: number;
  y: number;
  opacity: number;
}

interface UseCardSpotlightReturn {
  /** Ref to attach to the card element. */
  ref: React.RefObject<HTMLDivElement | null>;
  /** CSS variables that drive the spotlight gradient. */
  style: CSSProperties;
  /** Mouse event handlers to attach to the card element. */
  handlers: {
    onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
    onMouseLeave: () => void;
  };
  /** Current spotlight position as percentage values. */
  position: SpotlightState;
}

/**
 * Tracks the mouse position over a card and exposes CSS custom properties
 * that can drive a radial-gradient spotlight effect.
 *
 * The spotlight fades in on hover and fades out when the cursor leaves.
 * Combine with `useReducedMotion` to disable updates when the user prefers
 * reduced motion.
 */
export function useCardSpotlight(): UseCardSpotlightReturn {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<SpotlightState>({
    x: 50,
    y: 50,
    opacity: 0,
  });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPosition({ x, y, opacity: 1 });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setPosition((prev) => ({ ...prev, opacity: 0 }));
  }, []);

  const style: CSSProperties = {
    "--card-spotlight-x": `${position.x}%`,
    "--card-spotlight-y": `${position.y}%`,
    "--card-spotlight-opacity": position.opacity,
  } as CSSProperties;

  return {
    ref,
    style,
    handlers: { onMouseMove: handleMouseMove, onMouseLeave: handleMouseLeave },
    position,
  };
}
