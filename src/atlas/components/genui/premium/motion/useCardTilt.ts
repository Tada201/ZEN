import { useCallback, useRef, useState, type CSSProperties } from "react";

interface TiltState {
  rotateX: number;
  rotateY: number;
}

interface UseCardTiltOptions {
  /** Maximum rotation in degrees. */
  maxRotation?: number;
  /** Perspective distance in pixels. */
  perspective?: number;
}

interface UseCardTiltReturn {
  /** Ref to attach to the card element. */
  ref: React.RefObject<HTMLDivElement | null>;
  /** CSS transform style for the 3D tilt effect. */
  style: CSSProperties;
  /** Mouse event handlers to attach to the card element. */
  handlers: {
    onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
    onMouseLeave: () => void;
  };
  /** Current tilt values in degrees. */
  tilt: TiltState;
}

/**
 * Calculates 3D tilt transform values based on the cursor position over a card.
 *
 * The card appears to tilt toward the cursor. The effect is disabled when the
 * user prefers reduced motion (the caller is responsible for checking
 * `useReducedMotion` and skipping these handlers if desired).
 */
export function useCardTilt(options: UseCardTiltOptions = {}): UseCardTiltReturn {
  const { maxRotation = 8, perspective = 1000 } = options;
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState<TiltState>({ rotateX: 0, rotateY: 0 });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;

      setTilt({
        rotateX: (y - 0.5) * -maxRotation,
        rotateY: (x - 0.5) * maxRotation,
      });
    },
    [maxRotation]
  );

  const handleMouseLeave = useCallback(() => {
    setTilt({ rotateX: 0, rotateY: 0 });
  }, []);

  const style: CSSProperties = {
    transform: `perspective(${perspective}px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
    transformStyle: "preserve-3d",
    willChange: "transform",
  };

  return {
    ref,
    style,
    handlers: { onMouseMove: handleMouseMove, onMouseLeave: handleMouseLeave },
    tilt,
  };
}
