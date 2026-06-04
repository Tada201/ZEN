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
  return (
    <div className="flex flex-wrap gap-2 px-1 pb-1 animate-fade-in">
      {SUGGESTED_PROMPTS.map((item) => (
        <button
          key={item.prompt}
          onClick={() => onSelect(item.prompt)}
          disabled={isLoading}
          aria-label={item.label}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-50/80 dark:bg-zinc-900/60 border border-zinc-200/40 dark:border-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-indigo-950/20 hover:border-zinc-300 dark:hover:border-indigo-500/30 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-95 shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
        >
          <span className="text-[12px] font-semibold leading-none">{item.icon}</span>
          <div className="flex flex-col items-start leading-tight">
            <span className="font-semibold">{item.label}</span>
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-normal">{item.description}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
