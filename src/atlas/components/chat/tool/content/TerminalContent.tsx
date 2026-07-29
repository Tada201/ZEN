import { useMemo, useState } from "react";
import { Copy, Check } from "lucide-react";
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
  const command = typeof input.command === "string" ? input.command : undefined;
  const stdout = outputPreview.stdout || "";
  const stderr = outputPreview.stderr || "";
  const hasStderr = Boolean(stderr.trim());
  const output = [stdout, hasStderr ? stderr : ""].filter(Boolean).join("\n");

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
          <div className="font-mono text-[11px] text-foreground">
            <span className="select-none text-muted-foreground">$ </span>
            {command}
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
            <div className="text-[11px] text-muted-foreground">No output</div>
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
