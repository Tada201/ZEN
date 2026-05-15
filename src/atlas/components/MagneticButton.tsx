import { motion, useMotionValue, useSpring } from "framer-motion";
import { useRef, type ReactNode, type MouseEvent } from "react";
import { useReducedMotion } from "../hooks/useReducedMotion";

type Props = {
  children: ReactNode;
  className?: string;
  strength?: number;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
};

export function MagneticButton({ children, className = "", strength = 0.3, onClick, disabled }: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 150, damping: 15, mass: 0.1 });
  const springY = useSpring(y, { stiffness: 150, damping: 15, mass: 0.1 });

  const handleMove = (e: MouseEvent<HTMLButtonElement>) => {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distX = (e.clientX - centerX) * strength;
    const distY = (e.clientY - centerY) * strength;
    x.set(distX);
    y.set(distY);
  };

  const handleLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.button
      ref={ref}
      className={`press inline-flex items-center justify-center ${className}`}
      style={{ x: springX, y: springY }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={onClick}
      disabled={disabled}
      whileTap={reduced ? {} : { scale: 0.95 }}
    >
      {children}
    </motion.button>
  );
}
