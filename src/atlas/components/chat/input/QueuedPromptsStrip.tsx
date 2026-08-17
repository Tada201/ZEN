import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Clock, Send, X } from "lucide-react";
import { motionDurations, motionEasings, useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils/style";
import type { QueuedPrompt } from "@/lib/stores/promptQueueStore";

interface QueuedPromptsStripProps {
  items: QueuedPrompt[];
  onRemove: (id: string) => void;
  /** Send one queued prompt immediately (idle chats only). */
  onSendNow: (item: QueuedPrompt) => void;
}

function truncate(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/**
 * Prompt queue pills above the composer. Messages submitted while a turn is
 * streaming wait here in order; each pill can be removed, and clicking it
 * sends it right away when the chat is idle (the escape hatch after a Stop).
 */
export const QueuedPromptsStrip = memo(({ items, onRemove, onSendNow }: QueuedPromptsStripProps) => {
  const reducedMotion = useReducedMotion();
  if (items.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-col gap-1" aria-label={`${items.length} queued prompt${items.length === 1 ? "" : "s"}`}>
      <AnimatePresence initial={false}>
        {items.map((item, index) => (
          <motion.div
            key={item.id}
            initial={reducedMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -4 }}
            transition={reducedMotion ? { duration: 0 } : { duration: motionDurations.fast, ease: motionEasings.standard }}
            className={cn(
              "composer-chip flex w-full items-center gap-2 py-1.5 pl-2 pr-1.5 text-left",
              index === 0 && "border-primary/40",
            )}
          >
            <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <button
              type="button"
              onClick={() => onSendNow(item)}
              className="min-w-0 flex-1 text-[12px] leading-4 text-foreground"
              title="Send this prompt now"
            >
              <span className="block truncate">{truncate(item.payload.message)}</span>
              <span className="text-[10px] text-muted-foreground">
                {index === 0 ? "Sends next when this turn finishes — click to send now" : "Queued"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="composer-control composer-control--icon shrink-0 rounded-md p-1"
              aria-label="Remove queued prompt"
              title="Remove from queue"
            >
              <X className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
      <div className="flex items-center gap-1.5 px-2 text-[10px] text-muted-foreground" aria-hidden="true">
        <Send className="h-3 w-3" />
        Queued prompts send in order as each turn finishes
      </div>
    </div>
  );
});
