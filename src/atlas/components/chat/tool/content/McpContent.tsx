import { useState } from "react";
import { Check, Copy, Plug, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ToolCall } from "../../types";
import type { ToolOutputPreview } from "../toolOutputPreview";
import { Panel, CollapsiblePanel } from "./primitives";
import { asRecord, firstString, formatStructuredValue, parseStructuredValue, redactStructuredValue } from "./structuredToolData";

interface McpContentProps { toolCall: ToolCall; outputPreview: ToolOutputPreview; input: Record<string, unknown>; }

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const copy = async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* optional clipboard */ } };
  return <Button type="button" size="icon" variant="ghost" className="absolute right-1 top-1 h-6 w-6 text-muted-foreground hover:text-foreground" aria-label="Copy MCP details" onClick={copy}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</Button>;
}

export function McpContent({ toolCall, outputPreview, input }: McpContentProps) {
  const parsedOutput = parseStructuredValue(toolCall.output || outputPreview.content || outputPreview.raw);
  const output = asRecord(parsedOutput);
  const tool = firstString(input, ["tool", "tool_name", "name"]) || firstString(output, ["tool", "tool_name"]) || toolCall.name;
  const argumentsValue = input.arguments ?? input.args ?? input.parameters ?? input;
  // Canonical status wins. A raw `error` field only counts as failure when it
  // carries a value AND the call didn't also return a result — `{error: null}`
  // or a non-fatal warning alongside a result is a success, not a red panel.
  const hasResult = output.result !== undefined || output.data !== undefined || output.content !== undefined;
  const errorFieldSet = output.error !== undefined && output.error !== null;
  const isError = toolCall.status === "error" || (errorFieldSet && !hasResult);
  const resultValue = output.result ?? output.data ?? output.content ?? parsedOutput;
  // On error prefer the extracted message over the raw tool-exec envelope
  // (completed_at/id/input) so the panel shows the failure, not plumbing.
  const resultText = isError
    ? formatStructuredValue(output.error ?? output.message ?? outputPreview.errorMessage ?? outputPreview.summary ?? resultValue)
    : formatStructuredValue(resultValue);
  const argsText = redactStructuredValue(argumentsValue);
  // Identity (icon + raw tool id) lives in the panel header, not a separate
  // strip — the card title already carries the humanized action.
  const identity = <span className="flex min-w-0 items-center gap-1.5">{isError ? <TriangleAlert className="h-3 w-3 shrink-0 text-destructive" aria-hidden="true" /> : <Plug className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />}<span className="min-w-0 truncate font-mono text-[10px] tracking-normal text-muted-foreground">{tool}</span></span>;
  return <div className="flex flex-col gap-2">
    <Panel label={isError ? "Error" : "Result"} action={identity}><div className="group relative"><pre className={`max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-background p-2 pr-8 font-mono text-[11px] leading-relaxed ${isError ? "text-destructive" : "text-foreground"}`}>{resultText || "No result payload"}</pre><CopyValue value={resultText} /></div></Panel>
    <CollapsiblePanel label="Invocation"><div className="group relative"><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-background p-2 pr-8 font-mono text-[11px] leading-relaxed text-foreground">{argsText}</pre><CopyValue value={argsText} /></div></CollapsiblePanel>
  </div>;
}
