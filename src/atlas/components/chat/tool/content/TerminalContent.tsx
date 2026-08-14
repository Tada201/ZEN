import { useMemo, useState } from "react";
import { Copy, Check, CircleAlert, CircleCheck, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ToolCall } from "../../types";
import type { ToolOutputPreview } from "../toolOutputPreview";
import { Panel } from "./primitives";
import { TruncatedOutput } from "./TruncatedOutput";
import { toToolInputRecord } from "../toToolInputRecord";
import { redactToolText } from "../toolTextRedaction";
import { presentExecutionError } from "@/atlas/agentRuntime/executionError";

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
  const workingDirectoryValue = input.cwd || input.working_directory || input.workingDirectory
    || nestedInput.cwd || nestedInput.working_directory || nestedInput.workingDirectory;
  const workingDirectory = typeof workingDirectoryValue === "string" ? workingDirectoryValue : undefined;
  // Some shell adapters return plain text instead of `{ stdout, stderr }`.
  // For a terminal card that plain text is still the command output; do not
  // fall through to a generic technical-details block.
  const fallbackOutput = outputPreview.content || outputPreview.raw || "";
  const stdout = redactToolText(outputPreview.stdout || (!outputPreview.stderr && toolCall.status !== "running" ? fallbackOutput : ""));
  const stderr = redactToolText(outputPreview.stderr || "");
  const hasStderr = Boolean(stderr.trim());
  const output = [stdout, hasStderr ? stderr : ""].filter(Boolean).join("\n");
  const isRunning = toolCall.status === "running" && toolCall.recoveryState !== "stale";
  const isStale = toolCall.recoveryState === "stale";
  const isFailed = toolCall.status === "error" || (outputPreview.exitCode !== undefined && outputPreview.exitCode !== "0");
  const statusLabel = isStale ? "Interrupted" : isRunning ? "Running" : isFailed ? "Failed" : "Complete";
  // Compact classification of the failure so a broken command leads with one
  // readable line + next action, not a wall of stderr. Full stderr moves into a
  // collapsed disclosure below.
  const failure = useMemo(
    () => (isFailed ? presentExecutionError(stderr || outputPreview.summary || fallbackOutput, { context: "tool" }) : null),
    [isFailed, stderr, outputPreview.summary, fallbackOutput],
  );

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
          <div className="flex flex-col gap-1 font-mono text-[11px] text-foreground">
            <div className="flex items-start gap-2">
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
            {workingDirectory && (
              <div className="break-all pl-3.5 text-[10px] text-muted-foreground">
                cwd {workingDirectory}
              </div>
            )}
          </div>
        </Panel>
      )}

      <Panel label="Terminal">
        <div className="group relative">
          {failure && (
            <div className="mb-2 flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-2.5 py-2" role="alert">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-destructive">{failure.title}</div>
                <div className="mt-0.5 break-words text-[11px] leading-relaxed text-foreground">{failure.summary}</div>
                {failure.action !== "none" && (
                  <div className="mt-1 text-[10px] text-muted-foreground">Next: {failure.actionLabel}</div>
                )}
              </div>
            </div>
          )}
          {stdout && (
            <TruncatedOutput
              content={stdout}
              headLines={6}
              tailLines={6}
              className="text-muted-foreground"
            />
          )}
          {hasStderr && failure && (
            <details className="mt-2 overflow-hidden rounded-md border border-destructive/40 bg-card">
              <summary className="cursor-pointer select-none bg-destructive/10 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-destructive">
                Terminal output
              </summary>
              <div className="border-t border-destructive/40 p-2">
                <TruncatedOutput
                  content={stderr}
                  headLines={6}
                  tailLines={6}
                  className="border-l-2 border-l-destructive bg-muted p-2 font-mono text-[11px] leading-relaxed text-destructive"
                />
              </div>
            </details>
          )}
          {hasStderr && !failure && (
            <TruncatedOutput
              content={stderr}
              headLines={4}
              tailLines={4}
              className="mt-2 border-l-2 border-l-destructive bg-muted p-2 font-mono text-[11px] leading-relaxed text-destructive"
            />
          )}
          {!stdout && !hasStderr && !failure && (
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
