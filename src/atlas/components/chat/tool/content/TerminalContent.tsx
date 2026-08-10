import { useMemo, useState } from "react";
import { Copy, Check, CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ToolCall } from "../../types";
import type { ToolOutputPreview } from "../toolOutputPreview";
import { Panel } from "./primitives";
import { TruncatedOutput } from "./TruncatedOutput";
import { toToolInputRecord } from "../toToolInputRecord";

interface TerminalContentProps {
  toolCall: ToolCall;
  outputPreview: ToolOutputPreview;
}

export function TerminalContent({ toolCall, outputPreview }: TerminalContentProps) {
  const input = useMemo(() => toToolInputRecord(toolCall.input), [toolCall.input]);
  const [copied, setCopied] = useState(false);
  const nestedInput = input.arguments && typeof input.arguments === "object" && !Array.isArray(input.arguments)
    ? input.arguments as Record<string, unknown>
    : {};
  const commandValue = input.command || input.cmd || input.shell_command || input.script
    || nestedInput.command || nestedInput.cmd || nestedInput.shell_command || nestedInput.script;
  const command = typeof commandValue === "string" ? commandValue : undefined;
  // Some shell adapters return plain text instead of `{ stdout, stderr }`.
  // For a terminal card that plain text is still the command output; do not
  // fall through to a generic technical-details block.
  const fallbackOutput = outputPreview.content || outputPreview.raw || "";
  const stdout = outputPreview.stdout || (!outputPreview.stderr && toolCall.status !== "running" ? fallbackOutput : "");
  const stderr = outputPreview.stderr || "";
  const hasStderr = Boolean(stderr.trim());
  const output = [stdout, hasStderr ? stderr : ""].filter(Boolean).join("\n");
  const isRunning = toolCall.status === "running" && toolCall.recoveryState !== "stale";
  const isStale = toolCall.recoveryState === "stale";
  const isFailed = toolCall.status === "error" || (outputPreview.exitCode !== undefined && outputPreview.exitCode !== "0");
  const statusLabel = isStale ? "Interrupted" : isRunning ? "Running" : isFailed ? "Failed" : "Complete";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {command && (
        <Panel label="Command">
          <div className="flex items-start gap-2 font-mono text-[11px] text-foreground">
            <span className="select-none text-muted-foreground">$ </span>
            <span className="min-w-0 flex-1 break-words">{command}</span>
            <span className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 font-sans text-[10px] font-medium",
              isStale ? "border-warning text-warning" : isRunning ? "border-primary text-primary" : isFailed ? "border-destructive text-destructive" : "border-success text-success",
            )}>
              {isStale ? <CircleAlert className="h-3 w-3" /> : isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : isFailed ? <CircleAlert className="h-3 w-3" /> : <CircleCheck className="h-3 w-3" />}
              {statusLabel}
            </span>
          </div>
        </Panel>
      )}

      <Panel label="Terminal">
        <div className="group relative">
          {stdout && (
            <TruncatedOutput
              content={stdout}
              headLines={6}
              tailLines={6}
              className="text-muted-foreground"
            />
          )}
          {hasStderr && (
            <TruncatedOutput
              content={stderr}
              headLines={4}
              tailLines={4}
              className="mt-2 border-l-2 border-l-destructive bg-muted p-2 font-mono text-[11px] leading-relaxed text-destructive"
            />
          )}
          {!stdout && !hasStderr && (
            <div className="text-[11px] text-muted-foreground">{isRunning ? "Waiting for output..." : "No output"}</div>
          )}

          {output && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute right-1 top-1 h-6 w-6 text-muted-foreground hover:text-foreground transition-colors duration-200"
              aria-label="Copy output"
              onClick={handleCopy}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {outputPreview.exitCode !== undefined && (
            <span
              className={cn(
                "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
                outputPreview.exitCode === "0"
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive",
              )}
            >
              exit {outputPreview.exitCode}
            </span>
          )}
        </div>
      </Panel>
    </div>
  );
}
