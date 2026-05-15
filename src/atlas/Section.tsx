import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { useZen } from "./atlasContext";
import type { InspectorSelection } from "./theme";

type Props = {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

export function Section({ id, title, description, children }: Props) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("in-view")),
      { threshold: 0.08 }
    );
    el.querySelectorAll(".reveal").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  return (
    <section id={id} ref={ref} className="scroll-mt-20 py-16" style={{ contentVisibility: "auto" }}>
      <header className="reveal mb-10 border-l-2 border-primary pl-5">
        <h2 className="gradient-text text-4xl font-bold tracking-tight md:text-5xl">{title}</h2>
        <p className="mt-2 text-base text-muted-foreground">{description}</p>
      </header>
      <div className="Zen-grid">{children}</div>
    </section>
  );
}

type CardProps = {
  label: string;
  selection: InspectorSelection;
  className?: string;
  children: React.ReactNode;
};

export function DemoCard({ label, selection, className, children }: CardProps) {
  const { selection: current, select, motionEnabled } = useZen();
  const isSelected = current?.id === selection.id;

  return (
    <motion.div
      className={`demo-card reveal ${className ?? ""}`}
      data-selected={isSelected}
      role="button"
      tabIndex={0}
      onClick={() => select(isSelected ? null : selection)}
      onKeyDown={(e) => {
        // Ignore when focus is on an interactive child (input, button, etc.)
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select(isSelected ? null : selection);
        }
      }}
      aria-pressed={isSelected}
      aria-label={`${selection.name}${isSelected ? ", selected" : ""}. Press Enter to ${isSelected ? "deselect" : "inspect"}.`}
      whileHover={motionEnabled ? { y: -4, scale: 1.01 } : {}}
      whileTap={motionEnabled ? { scale: 0.98 } : {}}
      transition={motionEnabled ? { type: "spring", stiffness: 300, damping: 20 } : { duration: 0 }}
    >
      <span className="demo-card-label" aria-hidden="true">{label}</span>
      <button
        type="button"
        className="demo-card-copy press"
        aria-label={`Copy JSX for ${selection.name}`}
        title="Copy JSX"
        onClick={async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(selection.jsx);
            toast.success(`Copied ${selection.name} JSX`);
          } catch {
            toast.error("Could not copy to clipboard");
          }
        }}
      >
        <Copy className="h-3 w-3" aria-hidden="true" />
      </button>
      <div className="demo-card-body">{children}</div>
    </motion.div>
  );
}


