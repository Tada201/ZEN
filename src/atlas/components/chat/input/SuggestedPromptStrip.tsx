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
  // These prompts exercise local mock flows and are prototype tooling, not
  // production product suggestions. Keep them available in web development
  // for the fixture, but never expose them in a production build.
  if (!import.meta.env.DEV) return null;

  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reducedMotion ? { duration: 0 } : { duration: motionDurations.fast, ease: motionEasings.standard }}
      className="flex flex-wrap gap-1.5 px-1 pb-0.5"
    >
      {SUGGESTED_PROMPTS.map((item) => (
        <button
          key={item.prompt}
          onClick={() => onSelect(item.prompt)}
          disabled={isLoading}
          aria-label={item.label}
          className="composer-chip px-2 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="text-[12px] font-semibold leading-none text-primary">{item.icon}</span>
          <div className="flex flex-col items-start leading-tight">
            <span className="font-semibold">{item.label}</span>
            <span className="text-[11px] text-muted-foreground font-normal">{item.description}</span>
          </div>
        </button>
      ))}
    </motion.div>
  );
}
