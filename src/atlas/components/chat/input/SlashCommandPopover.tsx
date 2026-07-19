import { forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Book, Terminal } from "lucide-react";
import { cn } from "@/lib/utils/style";
import type { SlashSuggestion } from "./useSlashCommand";

interface SlashCommandPopoverProps {
  isOpen: boolean;
  suggestions: SlashSuggestion[];
  selectedIndex: number;
  onSelect: (suggestion: SlashSuggestion) => void;
  onHover: (index: number) => void;
}

export const SlashCommandPopover = forwardRef<HTMLDivElement, SlashCommandPopoverProps>(
  ({ isOpen, suggestions, selectedIndex, onSelect, onHover }, _ref) => {
    if (!isOpen || suggestions.length === 0) return null;

    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={{ duration: 0.1 }}
          className="absolute left-0 right-0 bottom-full mb-2 z-40 mx-3"
        >
          <div className="bg-card/95 backdrop-blur-sm border border-border/80 rounded-xl shadow-2xl overflow-hidden">
            <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border/50">
              Commands
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {suggestions.map((s, i) => {
                const Icon = s.kind === "skill" ? Book : Terminal;
                const isSelected = i === selectedIndex;
                return (
                  <button
                    key={`${s.kind}-${s.name}`}
                    type="button"
                    onClick={() => onSelect(s)}
                    onMouseEnter={() => onHover(i)}
                    className={cn(
                      "w-full text-left px-3 py-2 flex items-start gap-2.5 transition-colors",
                      isSelected
                        ? "bg-primary/10 text-foreground"
                        : "hover:bg-muted/50 text-foreground/90",
                    )}
                  >
                    <Icon
                      className={cn(
                        "w-3.5 h-3.5 mt-0.5 flex-shrink-0",
                        isSelected ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-semibold">
                          {s.invocationSyntax}
                        </span>
                        <span
                          className={cn(
                            "text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider",
                            s.kind === "skill"
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {s.kind}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 truncate">
                        {s.description}
                      </p>
                    </div>
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
