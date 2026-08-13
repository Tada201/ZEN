import { forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Book, Terminal } from "lucide-react";
import { cn } from "@/lib/utils/style";
import { motionDurations, motionEasings, useReducedMotion } from "@/lib/motion";
import type { SlashSuggestion } from "./useSlashCommand";

interface SlashCommandPopoverProps {
  isOpen: boolean;
  suggestions: SlashSuggestion[];
  selectedIndex: number;
  listboxId: string;
  onSelect: (suggestion: SlashSuggestion) => void;
  onHover: (index: number) => void;
}

export const SlashCommandPopover = forwardRef<HTMLDivElement, SlashCommandPopoverProps>(
  ({ isOpen, suggestions, selectedIndex, listboxId, onSelect, onHover }, ref) => {
    const reducedMotion = useReducedMotion();
    if (!isOpen || suggestions.length === 0) return null;

    return (
      <AnimatePresence>
        <motion.div
          ref={ref}
          initial={reducedMotion ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? undefined : { opacity: 0, y: 4 }}
          transition={reducedMotion ? { duration: 0 } : {
            duration: motionDurations.fast,
            ease: motionEasings.standard,
          }}
          className="absolute left-0 right-0 bottom-full mb-1 z-40 mx-2"
        >
          <div className="composer-popover overflow-hidden">
            <div className="composer-popover-header border-b px-2 py-1 uppercase">
              Commands
            </div>
            <div
              id={listboxId}
              role="listbox"
              aria-label="Slash commands"
              aria-activedescendant={`${listboxId}-option-${selectedIndex}`}
              className="max-h-72 overflow-y-auto py-1"
            >
              {suggestions.map((suggestion, index) => {
                const Icon = suggestion.kind === "skill" ? Book : Terminal;
                const isSelected = index === selectedIndex;
                return (
                  <button
                    key={`${suggestion.kind}-${suggestion.name}`}
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={isSelected}
                    onClick={() => onSelect(suggestion)}
                    onMouseEnter={() => onHover(index)}
                    className={cn(
                      "composer-menu-item items-start text-left",
                      isSelected ? "bg-primary/10 text-foreground" : "text-foreground",
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 flex-shrink-0",
                        isSelected ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold">
                          {suggestion.invocationSyntax}
                        </span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                            suggestion.kind === "skill"
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {suggestion.kind}
                        </span>
                      </span>
                      <span className="mt-0.5 truncate text-[11px] leading-snug text-muted-foreground">
                        {suggestion.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  },
);

SlashCommandPopover.displayName = "SlashCommandPopover";
