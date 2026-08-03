import { useMemo } from "react";
import { CheckCircle2, Globe, MousePointer2, TerminalSquare } from "lucide-react";
import type { ToolCall } from "../../types";
import type { ToolOutputPreview } from "../toolOutputPreview";
import { isSafeGeneratedHref } from "@/lib/security/generatedLinks";
import { toAssetUrl } from "@/lib/utils/assetUrl";
import { Panel } from "./primitives";
import { asRecord, firstString, formatStructuredValue, parseStructuredValue } from "./structuredToolData";

interface BrowserContentProps { toolCall: ToolCall; outputPreview: ToolOutputPreview; input: Record<string, unknown>; }
function actionLabel(value: unknown): string { const record = asRecord(value); return firstString(record, ["label", "description", "action", "type", "name"]) || (typeof value === "string" ? value : "Browser action"); }

export function BrowserContent({ toolCall, outputPreview, input }: BrowserContentProps) {
  const parsedOutput = parseStructuredValue(toolCall.output || outputPreview.content || outputPreview.raw);
  const output = asRecord(parsedOutput);
  const url = firstString(input, ["url", "uri", "href"]) || firstString(output, ["url", "uri", "href"]);
  const rawActions = output.actions ?? output.action_log ?? output.steps ?? input.actions ?? input.steps;
  const actions = Array.isArray(rawActions) ? rawActions.slice(0, 12) : rawActions ? [rawActions] : [];
  const screenshot = output.screenshot ?? output.screenshot_url ?? input.screenshot ?? outputPreview.imageUri;
  const screenshotUrl = typeof screenshot === "string" && isSafeGeneratedHref(screenshot) ? toAssetUrl(screenshot) : undefined;
  const outputText = formatStructuredValue(output.result ?? output.message ?? output.text ?? (typeof parsedOutput === "string" ? parsedOutput : ""));
  const actionItems = useMemo(() => actions.map((action, index) => ({ id: `${index}-${actionLabel(action)}`, label: actionLabel(action) })), [actions]);
  return <div className="flex flex-col gap-2">
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2"><Globe className="h-3.5 w-3.5 text-primary" aria-hidden="true" /><span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Browser</span><span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">{url || "Interactive browser session"}</span>{actionItems.length > 0 && <span className="shrink-0 text-[10px] text-muted-foreground">{actionItems.length} action{actionItems.length === 1 ? "" : "s"}</span>}</div>
    {url && <Panel label="Page"><div className="truncate font-mono text-[11px] text-foreground">{url}</div></Panel>}
    {screenshotUrl && <Panel label="Screenshot"><img src={screenshotUrl} alt="Browser screenshot" loading="lazy" className="max-h-72 w-auto rounded border border-border" /></Panel>}
    {actionItems.length > 0 && <Panel label="Action log"><div className="flex flex-col divide-y divide-border">{actionItems.map((action, index) => <div key={action.id} className="flex items-center gap-2 py-1.5 text-[11px] text-foreground">{index === actionItems.length - 1 ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" /> : <MousePointer2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}<span className="min-w-0 truncate">{action.label}</span></div>)}</div></Panel>}
    {outputText && <Panel label="Result"><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground">{outputText}</pre></Panel>}
    {!url && !screenshotUrl && actionItems.length === 0 && !outputText && <Panel label="Browser"><div className="text-[12px] text-muted-foreground"><TerminalSquare className="mr-1 inline h-3.5 w-3.5" />No browser details available.</div></Panel>}
  </div>;
}
