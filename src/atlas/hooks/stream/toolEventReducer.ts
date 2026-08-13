import type { Message, ToolCall } from "../../components/chat/types";
import { useChatStore } from "@/lib/stores/useChatStore";
import { rememberRecoveryTool } from "./strayToolLedger";

function messageOwnsTool(message: Message, toolCallId: string) {
  return Boolean(
    message.toolCalls?.some((tool) => tool.id === toolCallId) ||
    message.steps?.some((step) => step.type === "tool-call" && step.toolCall?.id === toolCallId)
  );
}

function messageMatchesToolMessageId(message: Message, incoming: ToolCall) {
  const messageMeta = message as Message & { messageId?: string };
  if (!incoming.messageId) return false;
  if (message.id === incoming.messageId || messageMeta.messageId === incoming.messageId) return true;
  return Boolean(
    message.toolCalls?.some((tool) => tool.messageId === incoming.messageId) ||
    message.steps?.some((step) => {
      const metadata = step.metadata as { messageId?: string } | undefined;
      return metadata?.messageId === incoming.messageId;
    })
  );
}

// A `runId` match is a WEAK signal: `execution_run_id` is the chat id, so every
// tool in the chat shares one runId across all turns. It must never outrank the
// currently-streaming assistant, or a new turn's tool grafts onto a previous
// finalized assistant that happens to hold same-runId tools. Callers apply this
// only after the active-sending assistant has been ruled out.
function messageMatchesToolRunId(message: Message, incoming: ToolCall) {
  const messageMeta = message as Message & { runId?: string };
  if (!incoming.runId) return false;
  if (messageMeta.runId === incoming.runId) return true;
  return Boolean(
    message.toolCalls?.some((tool) => tool.runId === incoming.runId) ||
    message.steps?.some((step) => {
      const metadata = step.metadata as { runId?: string } | undefined;
      return metadata?.runId === incoming.runId;
    })
  );
}

function findTargetMessageIndex(messages: Message[], incoming: ToolCall, chatId?: string): number {
  let activeAssistantIdx = -1;
  let latestAssistantIdx = -1;
  let runIdMatchIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (messageOwnsTool(message, incoming.id)) {
      return i;
    }
    // An exact backend messageId match is authoritative — it names the row.
    if (message.role === "assistant" && messageMatchesToolMessageId(message, incoming)) return i;
    if (activeAssistantIdx === -1 && message.role === "assistant" && message.status === "sending") {
      activeAssistantIdx = i;
    }
    // Weak runId match: remembered but deferred below the active assistant so a
    // chat-wide runId cannot pull a new turn's tool onto an older turn.
    if (runIdMatchIdx === -1 && message.role === "assistant" && messageMatchesToolRunId(message, incoming)) {
      runIdMatchIdx = i;
    }
    if (latestAssistantIdx === -1 && message.role === "assistant") latestAssistantIdx = i;
  }
  if (activeAssistantIdx !== -1) return activeAssistantIdx;

  if (chatId) {
    const activeAssistantId = useChatStore.getState().getActiveAssistantForChat(chatId);
    if (activeAssistantId) {
      const activeAssistantIdx = messages.findIndex(
        (message) => message.id === activeAssistantId && message.role === "assistant",
      );
      if (activeAssistantIdx !== -1) return activeAssistantIdx;
    }
  }

  // A weak runId match wins only after no assistant is actively streaming.
  if (runIdMatchIdx !== -1) return runIdMatchIdx;

  // The tool carries a backend messageId but no message currently owns it or
  // matches its identity, and nothing is streaming. Attaching to the latest
  // (already-finalized) assistant would graft a new turn's tool onto the
  // previous turn's bubble. Keep it in the non-rendered recovery buffer until
  // chat:done identifies the owning assistant row.
  if (incoming.messageId && latestAssistantIdx !== -1) {
    const latest = messages[latestAssistantIdx];
    if (latest.status === "sent" || latest.status === "failed" || latest.status === "cancelled") {
      return -1;
    }
  }

  return latestAssistantIdx;
}

function isTerminalToolStatus(status?: ToolCall["status"]) {
  return status === "completed" || status === "error";
}

export function mergeToolCall(existing: ToolCall | undefined, incoming: ToolCall): ToolCall {
  if (!existing) return incoming;
  const incomingInputIsEmptyObject =
    typeof incoming.input === "object" && incoming.input !== null && !Array.isArray(incoming.input) && Object.keys(incoming.input).length === 0;
  const shouldKeepTerminalStatus = isTerminalToolStatus(existing.status) && incoming.status === "running";
  return {
    ...existing,
    ...incoming,
    status: shouldKeepTerminalStatus ? existing.status : incoming.status,
    name: incoming.name === incoming.id ? existing.name : incoming.name,
    input: incomingInputIsEmptyObject ? existing.input : incoming.input ?? existing.input,
    output: incoming.output || existing.output,
    outputPreview: incoming.outputPreview || existing.outputPreview,
    startTime: existing.startTime || incoming.startTime,
    approvalContext: incoming.approvalContext || existing.approvalContext,
    runId: incoming.runId || existing.runId,
    messageId: incoming.messageId || existing.messageId,
    parentAgentId: incoming.parentAgentId || existing.parentAgentId,
    parentToolCallId: incoming.parentToolCallId || existing.parentToolCallId,
    executionId: incoming.executionId || existing.executionId,
    traceId: incoming.traceId || existing.traceId,
    agentId: incoming.agentId || existing.agentId,
    agentName: incoming.agentName || existing.agentName,
    iteration: incoming.iteration ?? existing.iteration,
    sequence: incoming.sequence ?? existing.sequence,
    phase: incoming.phase || existing.phase,
    batchId: incoming.batchId || existing.batchId,
    toolBatchId: incoming.toolBatchId || existing.toolBatchId,
    completedAt: incoming.completedAt ?? existing.completedAt,
    lastUpdatedAt: incoming.lastUpdatedAt ?? existing.lastUpdatedAt,
    attempts: [...(existing.attempts || []), ...(incoming.attempts || [])],
  };
}

export function upsertTool(prev: Message[], chatId: string, incoming: ToolCall, _now = Date.now()): Message[] {
  const targetIdx = findTargetMessageIndex(prev, incoming, chatId);
  if (targetIdx === -1) {
    rememberRecoveryTool(incoming.messageId, incoming);
    return prev;
  }
  const next = [...prev];
  const target = next[targetIdx];
  const hasTool = target.toolCalls?.some((tool) => tool.id === incoming.id) || false;
  const existingSteps = target.steps || [];
  const hasToolStep = existingSteps.some((step) => step.type === "tool-call" && step.toolCall?.id === incoming.id);
  const nextToolStep = { type: "tool-call" as const, toolCall: incoming };
  // Append the tool step in arrival order — never hoist it above earlier
  // answer text. An agentic run interleaves iterations
  // (tool → text → tool → text); splicing every new tool ahead of the FIRST
  // text step clumped all tool cards above the prose and reversed the
  // chronological trace. Codex renders each tool as a block at the point it
  // fired, so arrival order is the correct order.
  const stepsWithInsertedTool = [...existingSteps, nextToolStep];
  next[targetIdx] = {
    ...target,
    toolCalls: hasTool
      ? (target.toolCalls || []).map((tool) => tool.id === incoming.id ? mergeToolCall(tool, incoming) : tool)
      : [...(target.toolCalls || []), incoming],
    steps: hasToolStep
      ? existingSteps.map((step) =>
          step.type === "tool-call" && step.toolCall?.id === incoming.id
            ? { ...step, toolCall: mergeToolCall(step.toolCall, incoming) }
            : step
        )
      : stepsWithInsertedTool,
  };
  return next;
}

export function makeToolCall(
  id: string,
  name: string,
  status: ToolCall["status"],
  input: ToolCall["input"],
  output = "",
  durationMs?: number,
  now = Date.now(),
  meta: Pick<
    ToolCall,
    | "approvalContext"
    | "outputPreview"
    | "runId"
    | "messageId"
    | "parentAgentId"
    | "parentToolCallId"
    | "executionId"
    | "sequence"
    | "phase"
    | "agentId"
    | "agentName"
    | "iteration"
    | "batchId"
    | "toolBatchId"
    | "traceId"
    | "startTime"
    | "completedAt"
    | "lastUpdatedAt"
  > = {},
): ToolCall {
  return {
    id,
    name,
    status,
    input,
    output,
    durationMs,
    ...meta,
    startTime: meta.startTime ?? now,
    completedAt: meta.completedAt ?? (isTerminalToolStatus(status) ? now : undefined),
    lastUpdatedAt: meta.lastUpdatedAt ?? now,
    attempts: [{ status, durationMs, timestamp: now }],
  };
}
