import { useMemo } from "react";
import { Search, ChevronDown, CheckCircle2, CircleDashed, Loader2 } from "lucide-react";
import { Message } from "./types";
import { MarkdownContent } from "./MarkdownContent";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ResearchStep {
  text: string;
  status: "pending" | "running" | "completed" | "error";
}

export function DeepResearchMessage({
  message,
  compact,
}: {
  message: Message;
  compact?: boolean;
}) {
  const steps: ResearchStep[] = useMemo(() => {
    if (message.metadata?.researchSteps) {
      return message.metadata.researchSteps as ResearchStep[];
    }
    return [];
  }, [message.metadata]);

  const isComplete = message.status === "sent" || message.metadata?.status === "completed";

  return (
    <div
      className={cn(
        "group flex w-full flex-col px-4 transition-all duration-200",
        compact ? "bg-transparent py-2" : "bg-transparent py-4",
        "hover:bg-white/[0.015]"
      )}
    >
      <div className={cn(
        "mx-auto flex w-full flex-col gap-4 items-start",
        compact ? "max-w-full" : "max-w-[800px]"
      )}>
        
        {/* Deep Research Specialized Card */}
        <div className="w-full rounded-xl border border-indigo-500/20 bg-gradient-to-b from-indigo-500/10 to-transparent p-4 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20">
              <Search className="h-4 w-4 text-indigo-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-indigo-300">Deep Research</span>
              <span className="text-xs text-indigo-400/60">
                {isComplete ? "Research complete" : "Agent is actively researching..."}
              </span>
            </div>
          </div>

          <Collapsible defaultOpen={!isComplete} className="w-full">
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md p-2 hover:bg-white/5 text-xs text-muted-foreground transition-colors">
              <span>View process ({steps.length} steps)</span>
              <ChevronDown className="h-3 w-3" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 flex flex-col gap-2">
              {steps.length === 0 && !isComplete && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-1 px-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Initializing research plan...</span>
                </div>
              )}
              {steps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs py-1 px-2 rounded-sm bg-black/20">
                  {step.status === "completed" && <CheckCircle2 className="h-3.5 w-3.5 text-green-400 mt-0.5 shrink-0" />}
                  {step.status === "running" && <Loader2 className="h-3.5 w-3.5 text-indigo-400 animate-spin mt-0.5 shrink-0" />}
                  {step.status === "pending" && <CircleDashed className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />}
                  <span className={cn(
                    "text-muted-foreground",
                    step.status === "running" && "text-indigo-200",
                    step.status === "completed" && "text-green-100"
                  )}>
                    {step.text}
                  </span>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Final Report Synthesis */}
        {message.content && (
          <div className="w-full min-w-0 prose prose-invert prose-p:leading-relaxed prose-pre:p-0 max-w-none">
            <MarkdownContent content={message.content} />
          </div>
        )}
      </div>
    </div>
  );
}
