import { useState } from "react";
import { AlertCircle, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ToolCall } from "../../types";
import type { ToolOutputPreview } from "../toolOutputPreview";
import { Panel } from "./primitives";
import { TruncatedOutput } from "./TruncatedOutput";
import { redactToolText } from "../toolTextRedaction";
import { presentExecutionError } from "@/atlas/agentRuntime/executionError";

interface GenericContentProps {
  outputPreview: ToolOutputPreview;
  input: Record<string, unknown>;
}

function redactInput(value: Record<string, unknown>): string {
  return redactToolText(JSON.stringify(value, null, 2));
}

function OutputBlock({
  content,
  label,
}: {
  content: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);
  const safeContent = redactToolText(content);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(safeContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <Panel
      label={label}
      action={safeContent ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      ) : undefined}
    >
      <TruncatedOutput
        content={safeContent}
        headLines={8}
        tailLines={8}
        className="text-foreground"
      />
    </Panel>
  );
}

export function GenericContent({ outputPreview, input, toolCall }: GenericContentProps & { toolCall: ToolCall }) {
  const hasInput = Object.keys(input).length > 0;
  const isFailure = toolCall.status === "error"
    || outputPreview.exitCode !== undefined && outputPreview.exitCode !== "0"
    || Boolean(outputPreview.errorMessage);
  const failureSource = outputPreview.errorMessage || outputPreview.stderr || outputPreview.summary || "The tool did not complete successfully.";
  const failure = presentExecutionError(failureSource, { context: "tool" });
  const failureMessage = failure.summary;
  // On success show the humanized content; `raw` is telemetry, never the body.
  // On failure the alert below already carries the message, so the output panel
  // stays empty and we don't print the same summary twice.
  const outputText = isFailure ? "" : redactToolText(outputPreview.content || outputPreview.summary || "");

  return (
    <div className="flex flex-col gap-2">
      {isFailure && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-2.5 py-2" role="alert">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-destructive">{failure.title}</div>
            <div className="mt-0.5 break-words text-[11px] leading-relaxed text-foreground">{failureMessage}</div>
            {failure.action !== "none" && (
              <div className="mt-1 text-[10px] text-muted-foreground">Next: {failure.actionLabel}</div>
            )}
          </div>
        </div>
      )}
      {hasInput && (
        <details className="overflow-hidden rounded-md border border-border bg-card">
          <summary className="cursor-pointer select-none bg-muted px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Input parameters
          </summary>
          <pre className="max-h-40 overflow-auto border-t border-border bg-background px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {redactInput(input)}
          </pre>
        </details>
      )}

      {outputText && <OutputBlock content={outputText} label="Output" />}

      {isFailure && failure.technicalDetails && failure.technicalDetails !== failureMessage && (
        <details className="overflow-hidden rounded-md border border-border bg-card">
          <summary className="cursor-pointer select-none bg-muted px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Technical details
          </summary>
          <pre className="max-h-40 overflow-auto border-t border-border bg-background px-2.5 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
            {failure.technicalDetails}
          </pre>
        </details>
      )}

      {!hasInput && !outputText && !isFailure && (
        <Panel label="Output">
          <div className="text-[12px] leading-relaxed text-muted-foreground">No preview available.</div>
        </Panel>
      )}
    </div>
  );
}
