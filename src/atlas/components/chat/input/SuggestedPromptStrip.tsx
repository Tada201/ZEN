import { motion } from "framer-motion";
import { motionDurations, motionEasings, useReducedMotion } from "@/lib/motion";

interface SuggestedPrompt {
  label: string;
  prompt: string;
  description: string;
  icon: string;
}

const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  { label: "Test Markdown", prompt: "test markdown", description: "Rich formatting check", icon: "MD" },
  { label: "Test GenUI", prompt: "test genui", description: "Interactive widget check", icon: "UI" },
  { label: "Test ToolCall", prompt: "test toolcall", description: "Mock tool call execution", icon: "TC" },
];

export function SuggestedPromptStrip({
  isLoading,
  onSelect,
}: {
  isLoading?: boolean;
  onSelect: (prompt: string) => void;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reducedMotion ? { duration: 0 } : { duration: motionDurations.fast, ease: motionEasings.standard }}
      className="flex flex-wrap gap-2 px-1 pb-1"
    >
      {SUGGESTED_PROMPTS.map((item) => (
        <button
          key={item.prompt}
          onClick={() => onSelect(item.prompt)}
          disabled={isLoading}
          aria-label={item.label}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-muted/80 dark:bg-muted/60 border border-border/40 dark:border-border/60 hover:bg-muted dark:hover:bg-indigo-950/20 hover:border-border dark:hover:border-primary/30 text-muted-foreground/70 dark:text-muted-foreground hover:text-foreground dark:hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-95 shadow-[0_1px_2px_hsl(var(--background) / 0.01)]"
        >
          <span className="text-[12px] font-semibold leading-none">{item.icon}</span>
          <div className="flex flex-col items-start leading-tight">
            <span className="font-semibold">{item.label}</span>
            <span className="text-[11px] text-muted-foreground dark:text-muted-foreground font-normal">{item.description}</span>
          </div>
        </button>
      ))}
    </motion.div>
  );
}
