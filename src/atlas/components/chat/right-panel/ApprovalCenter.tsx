import { useMemo, useState } from "react";
import { Check, ChevronDown, ExternalLink, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/lib/stores/useChatStore";
import { useUIStore } from "@/lib/stores/useUIStore";
import type { ToolCall } from "../types";
import { resolveToolApproval } from "../approvalActions";
import { collectPendingApprovals, type PendingApproval } from "./approvalCenterModel";

function redactPreview(toolCall: ToolCall): string {
  const preview = toolCall.approvalContext?.argumentsPreview;
  if (!preview) return "No safe argument preview is available.";
  if (/(api[_-]?key|authorization|bearer|credential|password|secret|token)/i.test(preview)) {
    return "[redacted sensitive tool arguments]";
  }
  return preview.length > 2000 ? `${preview.slice(0, 2000)}...` : preview;
}

function riskClass(risk?: string): string {
  if (risk === "critical" || risk === "high") return "border-destructive bg-destructive/10 text-destructive";
  if (risk === "medium") return "border-warning bg-warning/10 text-warning";
  return "border-success bg-success/10 text-success";
}

function ApprovalCard({ approval, onResolved }: { approval: PendingApproval; onResolved: (toolCallId: string) => void }) {
  const [processing, setProcessing] = useState<"approve" | "deny" | "remember" | null>(null);
  const { toolCall } = approval;
  const risk = toolCall.approvalContext?.riskLevel;

  const resolve = async (action: "approve" | "deny" | "remember") => {
    if (processing) return;
    setProcessing(action);
    try {
      const resolved = await resolveToolApproval(toolCall.id, action !== "deny", action === "remember");
      if (resolved) onResolved(toolCall.id);
    } finally {
      setProcessing(null);
    }
  };

  return (
    <article className="rounded-lg border border-border bg-card p-3" aria-label={`Approval needed for ${toolCall.name}`}>
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{toolCall.name}</h3>
            {risk && <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase ${riskClass(risk)}`}>{risk} risk</span>}
          </div>
          {toolCall.approvalContext?.description && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{toolCall.approvalContext.description}</p>
          )}
          <details className="mt-2 rounded border border-border bg-muted">
            <summary className="flex cursor-pointer list-none items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
              <ChevronDown className="h-3 w-3" aria-hidden="true" /> Technical details
            </summary>
            <pre className="max-h-32 overflow-auto border-t border-border px-2 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
              {redactPreview(toolCall)}
            </pre>
          </details>
          <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground" title={approval.chatId}>
            Chat {approval.chatId}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" disabled={Boolean(processing)} onClick={() => void resolve("deny")}>
          <X className="h-3 w-3" aria-hidden="true" /> Deny
        </Button>
        <Button type="button" size="sm" className="h-7 gap-1.5 bg-warning text-warning-foreground hover:bg-warning/90" disabled={Boolean(processing)} onClick={() => void resolve("approve")}>
          <Check className="h-3 w-3" aria-hidden="true" /> Approve once
        </Button>
        <Button type="button" size="sm" variant="secondary" className="h-7 text-[11px]" disabled={Boolean(processing)} onClick={() => void resolve("remember")}>
          Remember exact
        </Button>
      </div>
    </article>
  );
}

export function ApprovalCenter() {
  // collectPendingApprovals returns a stable reference while the pending set
  // is unchanged, so this narrow selector avoids re-rendering on every
  // streaming frame (unlike subscribing to the whole sessionMessages map).
  const allPending = useChatStore((state) => collectPendingApprovals(state.sessionMessages));
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const setRightPanelOpen = useUIStore((state) => state.setRightPanelOpen);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(() => new Set());
  const pending = useMemo(
    () => allPending.filter((approval) => !resolvedIds.has(approval.toolCall.id)),
    [allPending, resolvedIds],
  );

  const openChat = (chatId: string) => {
    setActiveSession(chatId);
    setRightPanelOpen(false);
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-background" aria-labelledby="approval-center-title">
      <div className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-warning" aria-hidden="true" />
          <h2 id="approval-center-title" className="text-sm font-semibold text-foreground">Pending actions</h2>
          <span className="rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning">{pending.length}</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Review tool actions from any active chat. Permission decisions remain backend-owned.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3" aria-live="polite">
        {pending.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <ShieldCheck className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-foreground">No pending approvals</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">New tool requests will appear here while they wait for your decision.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((approval) => (
              <div key={approval.toolCall.id}>
                <ApprovalCard
                  approval={approval}
                  onResolved={(toolCallId) => setResolvedIds((current) => new Set(current).add(toolCallId))}
                />
                <button type="button" onClick={() => openChat(approval.chatId)} className="mt-1 inline-flex items-center gap-1 px-1 text-[10px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  <ExternalLink className="h-3 w-3" aria-hidden="true" /> Open chat
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-border bg-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        Terminal approvals are one-time synchronous grants and do not currently enter this list. MCP, network, and agent-spawn actions appear here only when they use the canonical tool approval event.
      </div>
    </section>
  );
}
