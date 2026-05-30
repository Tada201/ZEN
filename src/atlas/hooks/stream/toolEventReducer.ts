import type { Message, ToolCall } from "../../components/chat/types";

function findTargetMessageIndex(messages: Message[], toolCallId: string): number {
  let activeAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (
      message.toolCalls?.some((tool) => tool.id === toolCallId) ||
      message.steps?.some((step) => step.type === "tool-call" && step.toolCall?.id === toolCallId)
    ) {
      return i;
    }
    if (activeAssistantIdx === -1 && message.role === "assistant" && message.status === "sending") {
      activeAssistantIdx = i;
    }
  }
  return activeAssistantIdx;
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
    startTime: existing.startTime || incoming.startTime,
    approvalContext: incoming.approvalContext || existing.approvalContext,
    runId: incoming.runId || existing.runId,
    messageId: incoming.messageId || existing.messageId,
    parentAgentId: incoming.parentAgentId || existing.parentAgentId,
    executionId: incoming.executionId || existing.executionId,
    agentId: incoming.agentId || existing.agentId,
    agentName: incoming.agentName || existing.agentName,
    iteration: incoming.iteration ?? existing.iteration,
    batchId: incoming.batchId || existing.batchId,
    toolBatchId: incoming.toolBatchId || existing.toolBatchId,
    completedAt: incoming.completedAt ?? existing.completedAt,
    lastUpdatedAt: incoming.lastUpdatedAt ?? existing.lastUpdatedAt,
    attempts: [...(existing.attempts || []), ...(incoming.attempts || [])],
  };
}

export function upsertTool(prev: Message[], chatId: string, incoming: ToolCall, now = Date.now()): Message[] {
  const targetIdx = findTargetMessageIndex(prev, incoming.id);
  if (targetIdx === -1) {
    return [
      ...prev,
      {
        id: `tool-ledger-${incoming.id}`,
        sessionId: chatId,
        role: "system",
        content: "",
        status: "sent",
        kind: "system",
        createdAt: now,
        toolCalls: [incoming],
        steps: [{ type: "tool-call", toolCall: incoming }],
      } as Message,
    ];
  }
  const next = [...prev];
  const target = next[targetIdx];
  const hasTool = target.toolCalls?.some((tool) => tool.id === incoming.id) || false;
  next[targetIdx] = {
    ...target,
    toolCalls: hasTool
      ? (target.toolCalls || []).map((tool) => tool.id === incoming.id ? mergeToolCall(tool, incoming) : tool)
      : [...(target.toolCalls || []), incoming],
    steps: target.steps?.some((step) => step.type === "tool-call" && step.toolCall?.id === incoming.id)
      ? target.steps.map((step) =>
          step.type === "tool-call" && step.toolCall?.id === incoming.id
            ? { ...step, toolCall: mergeToolCall(step.toolCall, incoming) }
            : step
        )
      : [...(target.steps || []), { type: "tool-call", toolCall: incoming }],
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
    | "runId"
    | "messageId"
    | "parentAgentId"
    | "executionId"
    | "agentId"
    | "agentName"
    | "iteration"
    | "batchId"
    | "toolBatchId"
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
    startTime: now,
    completedAt: isTerminalToolStatus(status) ? now : undefined,
    lastUpdatedAt: now,
    attempts: [{ status, durationMs, timestamp: now }],
  };
}
