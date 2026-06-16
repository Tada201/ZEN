import { Check, Copy, FileText, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Message } from "./types";
import { useCopy } from "./CodeBlock";

export function UserMessage({ message, compact }: { message: Message; compact?: boolean }) {
  const { copied, copy } = useCopy();

  return (
    <div
      className={cn(
        "group flex w-full flex-col px-4 transition-all duration-200",
        compact ? "bg-transparent py-1" : "bg-transparent py-2",
        "hover:bg-white/[0.015]"
      )}
    >
      <div className={cn(
        "mx-auto flex w-full items-start gap-0 justify-end",
        compact ? "max-w-full" : "max-w-[800px]"
      )}>
        <div className="flex min-w-0 flex-col gap-2 max-w-[85%]">
          <div className="relative">
            <div className="flex items-end gap-3 group/user">
              <Button
                size="sm"
                variant="ghost"
                type="button"
                className="h-8 w-8 p-0 text-muted-foreground/40 hover:text-foreground hover:bg-muted/40 opacity-0 group-hover/user:opacity-100 transition-opacity mb-1 shrink-0"
                onClick={() => copy(message.content)}
                title="Copy message"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
              <div className="rounded-2xl border border-white/20 dark:border-white/10 bg-primary/10 dark:bg-primary/20 backdrop-blur-xl backdrop-saturate-150 px-5 py-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.08)] text-[14px] leading-relaxed text-foreground/90 font-medium ring-1 ring-black/5 dark:ring-white/10">
                {message.content}
              </div>
            </div>
          </div>
          
          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 justify-end pr-11">
              {message.attachments.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-1.5 text-xs shadow-sm"
                >
                  {a.type === "image" ? (
                    <div className="h-10 w-10 overflow-hidden rounded border border-border">
                      <img src={a.data} alt={a.name} className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-muted/50">
                      {a.type === "pdf" ? <FileText className="h-4 w-4 text-red-500" /> : <Paperclip className="h-4 w-4" />}
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="font-medium truncate max-w-[120px]">{a.name}</span>
                    <span className="text-[10px] opacity-40 uppercase tracking-tighter">{a.type}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
