import type { Message, ToolCall } from "../../components/chat/types";

/**
 * Reconciles orphaned tool-ledger messages created before the assistant existed
 * into the real assistant message when the backend message ID arrives.
 * Returns a new message array with the assistant id updated and stray tools
 * merged; unmatched ledgers are left in place.
 *
 * The assistant may already be finalized (`"sent"` / `"cancelled"`) by the
 * time this runs in the `chat:done` handler — the finalize callback runs
 * before the reconcile call. Failed assistants stay on their dedicated error
 * path; only a live or successfully finalized assistant is remapped.
 */
const RECONCILABLE_ASSISTANT_STATUSES = new Set(["sending", "sent", "cancelled"]);
const pendingRecoveryTools = new Map<string, ToolCall[]>();
const MAX_PENDING_RECOVERY_TOOLS = 256;

/**
 * Keep late tool events out of the message list until the backend assistant
 * owner is available. This replaces new-run system `tool-ledger-*` messages;
 * legacy ledger rows are still accepted by the reconciliation adapter below.
 */
export function rememberRecoveryTool(messageId: string | undefined, tool: ToolCall) {
  if (!messageId || !tool.id) return;
  const existing = pendingRecoveryTools.get(messageId) || [];
  const index = existing.findIndex((candidate) => candidate.id === tool.id);
  if (index === -1) existing.push(tool);
  else existing[index] = { ...existing[index], ...tool, input: tool.input || existing[index].input, output: tool.output || existing[index].output };
  pendingRecoveryTools.set(messageId, existing);

  let total = 0;
  for (const [key, tools] of pendingRecoveryTools) {
    total += tools.length;
    if (total <= MAX_PENDING_RECOVERY_TOOLS) break;
    pendingRecoveryTools.delete(key);
  }
}

export function takeRecoveryTools(messageIds: string[]) {
  const tools: ToolCall[] = [];
  for (const messageId of new Set(messageIds.filter(Boolean))) {
    tools.push(...(pendingRecoveryTools.get(messageId) || []));
    pendingRecoveryTools.delete(messageId);
  }
  return tools;
}

export function clearRecoveryTools() {
  pendingRecoveryTools.clear();
}

export function reconcileStrayToolLedgers(
  prev: Message[],
  assistantIdBeforeFinalize: string,
  backendAssistantId: string,
): Message[] {
  const candidateAssistantIds = new Set([assistantIdBeforeFinalize, backendAssistantId]);
  const idx = prev.findIndex(
    (m) => candidateAssistantIds.has(m.id)
      && m.role === "assistant"
      && typeof m.status === "string"
      && RECONCILABLE_ASSISTANT_STATUSES.has(m.status),
  );
  if (idx === -1) return prev;

  const strayTools: ToolCall[] = takeRecoveryTools([...candidateAssistantIds]);
  const remaining = prev.filter((m) => {
    if (m.role === "system" && m.id.startsWith("tool-ledger-") && m.status === "sent") {
      // Stray tools carry the backend assistant message id (allocated in the
      // runner before the optimistic placeholder is remapped), so match both
      // the pre-finalize optimistic id AND the real backend id. Matching only
      // the optimistic id silently dropped every backend-id-bearing tool,
      // leaving orphan ledgers that never persisted and vanished on reload.
      const belongsToThisAssistant = (m.toolCalls || []).some(
        (t) => !t.messageId || candidateAssistantIds.has(t.messageId),
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
    (m) => candidateAssistantIds.has(m.id)
      && m.role === "assistant"
      && typeof m.status === "string"
      && RECONCILABLE_ASSISTANT_STATUSES.has(m.status),
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
