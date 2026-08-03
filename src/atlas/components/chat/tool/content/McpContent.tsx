import { useState } from "react";
import { Check, Copy, Plug, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ToolCall } from "../../types";
import type { ToolOutputPreview } from "../toolOutputPreview";
import { Panel } from "./primitives";
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
  const server = firstString(input, ["server", "server_name", "mcp_server"]) || firstString(output, ["server", "server_name"]) || "External server";
  const tool = firstString(input, ["tool", "tool_name", "name"]) || firstString(output, ["tool", "tool_name"]) || toolCall.name;
  const argumentsValue = input.arguments ?? input.args ?? input.parameters ?? input;
  const resultValue = output.result ?? output.data ?? output.content ?? parsedOutput;
  const errorValue = output.error ?? (toolCall.status === "error" ? output.message ?? outputPreview.summary : undefined);
  const resultText = formatStructuredValue(errorValue ?? resultValue);
  const argsText = redactStructuredValue(argumentsValue);
  return <div className="flex flex-col gap-2">
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2">
      {errorValue ? <TriangleAlert className="h-3.5 w-3.5 text-destructive" aria-hidden="true" /> : <Plug className="h-3.5 w-3.5 text-primary" aria-hidden="true" />}
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">MCP</span><span className="min-w-0 truncate text-[12px] text-foreground">{server}</span><span className="text-muted-foreground">·</span><span className="min-w-0 truncate font-mono text-[11px] text-foreground">{tool}</span>
    </div>
    <Panel label="Invocation"><div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground"><span className="font-medium text-foreground">{server}</span><span>·</span><span className="font-mono">{tool}</span></div><div className="group relative"><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-background p-2 pr-8 font-mono text-[11px] leading-relaxed text-foreground">{argsText}</pre><CopyValue value={argsText} /></div></Panel>
    <Panel label={errorValue ? "Error" : "Result"}><div className="group relative"><pre className={`max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-background p-2 pr-8 font-mono text-[11px] leading-relaxed ${errorValue ? "text-destructive" : "text-foreground"}`}>{resultText || "No result payload"}</pre><CopyValue value={resultText} /></div></Panel>
  </div>;
}
