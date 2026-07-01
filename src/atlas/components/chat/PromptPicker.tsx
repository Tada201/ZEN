import { useState, useCallback, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROMPT_REGISTRY, searchPrompts, type PromptDefinition } from "./promptRegistry";

interface PromptPickerProps {
  /** Currently selected prompt ID, or null if none selected. */
  selectedId: string | null;
  /** Called when user selects a prompt. Pass null to deselect. */
  onSelect: (prompt: PromptDefinition | null) => void;
  /** Whether the picker is compact (for narrow screens). */
  compact?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  code: "Code",
  review: "Review",
  explain: "Explain",
  generate: "Generate",
  fix: "Fix",
  convert: "Convert",
  voice: "Voice",
};

export function PromptPicker({ selectedId, onSelect, compact }: PromptPickerProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchOpen) {
      inputRef.current?.focus();
    }
  }, [searchOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setQuery("");
      }
    };
    if (searchOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [searchOpen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSearchOpen(false);
        setQuery("");
      }
    };
    if (searchOpen) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [searchOpen]);

  const filteredPrompts = query ? searchPrompts(query) : PROMPT_REGISTRY;

  const selected = selectedId ? PROMPT_REGISTRY.find((p) => p.id === selectedId) : null;

  const handleSelect = useCallback(
    (prompt: PromptDefinition) => {
      if (selectedId === prompt.id) {
        onSelect(null);
      } else {
        onSelect(prompt);
        setSearchOpen(false);
        setQuery("");
      }
    },
    [selectedId, onSelect]
  );

  // Show top 4 prompts as pills in compact mode, all 10 in expanded mode
  const visiblePills = compact ? PROMPT_REGISTRY.slice(0, 4) : PROMPT_REGISTRY;

  return (
    <div ref={containerRef} className="relative">
      {!searchOpen && !selected && (
        <div className="flex items-center gap-1 px-1 pb-1.5 flex-wrap">
          {visiblePills.map((prompt) => (
            <button
              key={prompt.id}
              type="button"
              onClick={() => handleSelect(prompt)}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted hover:border-border transition-all duration-150",
                selectedId === prompt.id && "border-primary/30 bg-primary/10 text-primary"
              )}
              title={prompt.description}
            >
              <span className="text-xs">{prompt.icon}</span>
              <span className={compact ? "hidden sm:inline" : ""}>{prompt.name}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-150"
            title="Search all prompts"
          >
            <Search className="w-3 h-3" />
            <span className={compact ? "hidden sm:inline" : ""}>More</span>
          </button>
        </div>
      )}

      {selected && (
        <div className="flex items-center gap-1 px-1 pb-1.5">
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border border-primary/30 bg-primary/10 text-primary">
            <span className="text-xs">{selected.icon}</span>
            <span>{selected.name}</span>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="ml-0.5 hover:text-primary/60 transition-colors"
              aria-label={`Remove ${selected.name} prompt`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="px-2 py-0.5 rounded-full text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-150"
          >
            Change
          </button>
        </div>
      )}

      {searchOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-popover backdrop-blur-lg border border-border rounded-xl shadow-2xl overflow-hidden max-h-72 flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search prompts..."
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
            />
            <button
              type="button"
              onClick={() => { setSearchOpen(false); setQuery(""); }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="overflow-y-auto p-1.5 space-y-1">
            {filteredPrompts.map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                onClick={() => handleSelect(prompt)}
                className={cn(
                  "w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors",
                  selectedId === prompt.id
                    ? "bg-primary/10"
                    : "hover:bg-muted/50"
                )}
              >
                <span className="text-base shrink-0 mt-0.5">{prompt.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">{prompt.name}</span>
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                      {CATEGORY_LABELS[prompt.category] || prompt.category}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{prompt.description}</p>
                </div>
              </button>
            ))}
            {filteredPrompts.length === 0 && (
              <div className="px-3 py-4 text-center text-[10px] text-muted-foreground">
                No prompts matching "{query}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
