import type { Message, ToolCall } from "../../components/chat/types";

function messageOwnsTool(message: Message, toolCallId: string) {
  return Boolean(
    message.toolCalls?.some((tool) => tool.id === toolCallId) ||
    message.steps?.some((step) => step.type === "tool-call" && step.toolCall?.id === toolCallId)
  );
}

function messageMatchesToolMeta(message: Message, incoming: ToolCall) {
  const messageMeta = message as Message & { runId?: string; messageId?: string };
  if (incoming.messageId && (message.id === incoming.messageId || messageMeta.messageId === incoming.messageId)) {
    return true;
  }
  if (incoming.runId && messageMeta.runId === incoming.runId) return true;
  return Boolean(
    message.toolCalls?.some((tool) =>
      (incoming.messageId && tool.messageId === incoming.messageId) ||
      (incoming.runId && tool.runId === incoming.runId)
    ) ||
    message.steps?.some((step) => {
      const metadata = step.metadata as { runId?: string; messageId?: string } | undefined;
      return (
        (incoming.messageId && metadata?.messageId === incoming.messageId) ||
        (incoming.runId && metadata?.runId === incoming.runId)
      );
    })
  );
}

function findTargetMessageIndex(messages: Message[], incoming: ToolCall): number {
  let activeAssistantIdx = -1;
  let latestAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (messageOwnsTool(message, incoming.id)) {
      return i;
    }
    if (message.role === "assistant" && messageMatchesToolMeta(message, incoming)) return i;
    if (activeAssistantIdx === -1 && message.role === "assistant" && message.status === "sending") {
      activeAssistantIdx = i;
    }
    if (latestAssistantIdx === -1 && message.role === "assistant") latestAssistantIdx = i;
  }
  return activeAssistantIdx !== -1 ? activeAssistantIdx : latestAssistantIdx;
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
  const targetIdx = findTargetMessageIndex(prev, incoming);
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
  const existingSteps = target.steps || [];
  const hasToolStep = existingSteps.some((step) => step.type === "tool-call" && step.toolCall?.id === incoming.id);
  const nextToolStep = { type: "tool-call" as const, toolCall: incoming };
  const firstTextIndex = existingSteps.findIndex((step) => step.type === "text");
  const stepsWithInsertedTool = firstTextIndex === -1
    ? [...existingSteps, nextToolStep]
    : [...existingSteps.slice(0, firstTextIndex), nextToolStep, ...existingSteps.slice(firstTextIndex)];
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
