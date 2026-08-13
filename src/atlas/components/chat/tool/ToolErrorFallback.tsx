import { useState } from "react";
import { XCircle, Copy, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { presentExecutionError } from "@/atlas/agentRuntime/executionError";

interface ToolErrorFallbackProps {
  error: Error;
  reset: () => void;
  toolName?: string;
}

/**
 * Error fallback shown when a tool-card renderer crashes.
 * Keeps the failure isolated to a single card so the rest of the chat
 * timeline survives, while keeping stack details behind an explicit disclosure.
 */
export function ToolErrorFallback({ error, reset, toolName }: ToolErrorFallbackProps) {
  const [copied, setCopied] = useState(false);
  const presentation = presentExecutionError(error, { context: "renderer", recoverable: true });
  const title = toolName ? `${presentation.title}: ${toolName}` : presentation.title;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${title}\n${presentation.summary}\n${presentation.technicalDetails}`.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access is optional; the diagnostic disclosure remains available.
    }
  };

  return (
    <div className="rounded-md border border-destructive bg-card p-3" role="alert">
      <div className="flex items-start gap-2">
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium leading-5 text-foreground">{title}</div>
          <div className="text-[11px] leading-relaxed text-muted-foreground">{presentation.summary}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2.5 text-[11px]" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" />
          Retry display
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2.5 text-[11px]"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          Copy safe details
        </Button>
      </div>

      <details className="mt-3 rounded bg-muted">
        <summary className="cursor-pointer select-none px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          Technical details
        </summary>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words px-2 pb-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
          {presentation.technicalDetails}
        </pre>
      </details>
    </div>
  );
}
