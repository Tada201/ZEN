
import { useRef } from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { useZen } from "../atlasContext";

interface KineticTextProps {
  text: string;
  className?: string;
  scrollContainerRef?: React.RefObject<HTMLElement>;
}

export function KineticText({ text, className = "", scrollContainerRef }: KineticTextProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { motionEnabled } = useZen();

  const { scrollYProgress } = useScroll({
    target: ref,
    container: scrollContainerRef ?? undefined,
    offset: ["start end", "end start"],
  });

  const progress = useSpring(
    useTransform(scrollYProgress, [0, 0.5, 1], [0, 1, 0]),
    { stiffness: 100, damping: 30, restDelta: 0.001 }
  );

  if (!motionEnabled) {
    return <div className={className}>{text}</div>;
  }

  const chars = text.split("");

  return (
    <div ref={ref} className={`flex flex-wrap justify-center gap-0.5 ${className}`}>
      {chars.map((char, i) => (
        <CharacterSpan key={i} char={char} index={i} progress={progress} />
      ))}
    </div>
  );
}

function CharacterSpan({
  char,
  index,
  progress,
}: {
  char: string;
  index: number;
  progress: ReturnType<typeof useSpring>;
}) {
  const y = useTransform(progress, [0, 0.5, 1], [40, 0, -40]);
  const opacity = useTransform(
    progress,
    [0, 0.25 + index * 0.02, 0.5 + index * 0.02, 1],
    [0, 1, 1, 0]
  );
  const scale = useTransform(progress, [0, 0.5, 1], [0.85, 1, 0.85]);

  return (
    <motion.span
      style={{ y, opacity, scale, display: "inline-block" }}
      className="text-4xl font-bold tracking-tight md:text-6xl"
    >
      {char === " " ? "\u00A0" : char}
    </motion.span>
  );
}


