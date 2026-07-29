import type { Message, ToolCall } from "../../components/chat/types";

/**
 * Reconciles orphaned tool-ledger messages created before the assistant existed
 * into the real assistant message when the backend message ID arrives.
 * Returns a new message array with the assistant id updated and stray tools
 * merged; unmatched ledgers are left in place.
 *
 * The assistant may already be finalized (`"sent"` / `"cancelled"`) by the
 * time this runs in the `chat:done` handler — the finalize callback runs
 * before the reconcile call. The status filter therefore accepts any
 * non-failed assistant state so the optimistic → backend ID remapping still
 * works after finalization.
 */
const RECONCILABLE_ASSISTANT_STATUSES = new Set(["sending", "sent", "cancelled"]);

export function reconcileStrayToolLedgers(
  prev: Message[],
  assistantIdBeforeFinalize: string,
  backendAssistantId: string,
): Message[] {
  const idx = prev.findIndex(
    (m) => m.id === assistantIdBeforeFinalize && m.role === "assistant" && typeof m.status === "string" && RECONCILABLE_ASSISTANT_STATUSES.has(m.status),
  );
  if (idx === -1) return prev;

  const strayTools: ToolCall[] = [];
  const remaining = prev.filter((m) => {
    if (m.role === "system" && m.id.startsWith("tool-ledger-") && m.status === "sent") {
      const belongsToThisAssistant = (m.toolCalls || []).some(
        (t) => !t.messageId || t.messageId === assistantIdBeforeFinalize,
      );
      if (belongsToThisAssistant) {
        strayTools.push(...(m.toolCalls || []));
        return false;
      }
    }
    return true;
  });

  const next = [...remaining];
  const newIdx = next.findIndex(
    (m) => m.id === assistantIdBeforeFinalize && m.role === "assistant" && typeof m.status === "string" && RECONCILABLE_ASSISTANT_STATUSES.has(m.status),
  );
  if (newIdx === -1) return prev;

  const existingIds = new Set((next[newIdx].toolCalls || []).map((t) => t.id));
  const uniqueStrayTools = strayTools.filter((t) => !existingIds.has(t.id));

  let updatedToolCalls = next[newIdx].toolCalls;
  let updatedSteps = next[newIdx].steps;

  if (uniqueStrayTools.length > 0) {
    updatedToolCalls = [...(updatedToolCalls || []), ...uniqueStrayTools];
    // Mirror the merged tools into the assistant's execution steps so the
    // timeline stays consistent when the UI renders from steps rather than
    // toolCalls alone. Insert before the first text step to keep chronological
    // order (tools precede the final answer text).
    const existingSteps = updatedSteps || [];
    const existingStepIds = new Set(
      existingSteps.filter((s) => s.type === "tool-call").map((s) => s.toolCall?.id).filter(Boolean),
    );
    const newSteps = uniqueStrayTools
      .filter((t) => !existingStepIds.has(t.id))
      .map((t) => ({ type: "tool-call" as const, toolCall: t }));
    if (newSteps.length > 0) {
      const firstTextIndex = existingSteps.findIndex((s) => s.type === "text");
      updatedSteps =
        firstTextIndex === -1
          ? [...existingSteps, ...newSteps]
          : [
              ...existingSteps.slice(0, firstTextIndex),
              ...newSteps,
              ...existingSteps.slice(firstTextIndex),
            ];
    }
  }

  next[newIdx] = {
    ...next[newIdx],
    id: backendAssistantId,
    toolCalls: updatedToolCalls,
    steps: updatedSteps,
  };

  return next;
}
