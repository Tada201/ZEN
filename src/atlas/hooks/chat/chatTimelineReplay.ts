import type { Message, Step, ToolCall } from "../../components/chat/types";
import { toolResultMetaToOutput } from "../../components/chat/assistantMessageParts";

const ACTION_MESSAGE_KINDS = new Set([
  "tool_call",
  "tool_result",
  "agent_handoff",
  "agent_spawn",
  "agent_complete",
  "agent_chunk",
  "approval_request",
  "clarification_request",
  "deep_research",
  "error",
  "system",
  "chat_status",
  "orchestrator_progress",
  "workflow_started",
  "workflow_completed",
  "workflow_failed",
  "task_created",
  "task_started",
  "task_updated",
  "task_list_updated",
  "task_complexity_analyzed",
  "task_completed",
  "task_failed",
]);

function normalizeActionMetadata(metadata: any) {
  if (!metadata || typeof metadata !== "object") return metadata;
  return {
    ...metadata,
    runId: metadata.runId || metadata.run_id,
    messageId: metadata.messageId || metadata.message_id,
    parentAgentId: metadata.parentAgentId || metadata.parent_agent_id || metadata.parentAgent || metadata.parent_agent,
    executionId: metadata.executionId || metadata.execution_id,
    batchId: metadata.batchId || metadata.batch_id,
    toolBatchId: metadata.toolBatchId || metadata.tool_batch_id,
    approvalRequest: metadata.approvalRequest || metadata.approval_request,
    toolResult: metadata.toolResult || metadata.tool_result,
    toolCall: metadata.toolCall || metadata.tool_call,
    toolCallPreview: metadata.toolCallPreview || metadata.tool_call_preview,
    agentStream: metadata.agentStream || metadata.agent_stream,
  };
}

function getActionEventId(message: Message): string {
  const meta: any = normalizeActionMetadata(message.metadata) || {};
  const toolName =
    meta.toolCall?.toolName ||
    meta.toolCall?.tool_name ||
    meta.toolResult?.toolName ||
    meta.toolResult?.tool_name;

  const toolCallId =
    meta.toolCall?.toolCallId ||
    meta.toolCall?.tool_call_id ||
    meta.toolResult?.toolCallId ||
    meta.toolResult?.tool_call_id;

  if ((message.kind === "tool_call" || message.kind === "tool_result") && toolName) {
    if (toolCallId) {
      return `tool:${toolCallId}`;
    }
    return `tool:${meta.iteration ?? "unknown"}:${toolName}`;
  }
  if (message.kind === "orchestrator_progress") {
    return `orchestrator:${message.sessionId || "history"}`;
  }
  if (message.kind === "agent_chunk") {
    const agentId = meta.agentId || meta.agentName || meta.spawn?.childAgent;
    return `agent-chunk:${message.sessionId || "history"}:${agentId || "agent"}`;
  }
  const stable =
    toolCallId ||
    meta.approvalRequest?.tool_call_id ||
    meta.approvalRequest?.toolCallId ||
    meta.spawn?.spawnId ||
    meta.spawn?.spawn_id;
  return `${message.kind || "action"}:${stable || message.id}`;
}

function isTimelineActionMessage(message: Message): boolean {
  return !!message.kind && ACTION_MESSAGE_KINDS.has(message.kind);
}

function actionMessageToStep(message: Message): Step {
  const metadata = normalizeActionMetadata(message.metadata);
  const status = metadata?.status === "error" || metadata?.spawn?.status === "failed" || metadata?.toolResult?.status === "error"
    ? "error"
    : metadata?.status === "completed" || metadata?.spawn?.status === "completed" || metadata?.toolResult?.status === "ok" || message.kind === "agent_complete" || message.kind === "tool_result"
      ? "completed"
      : "running";

  return {
    type: "action",
    kind: message.kind,
    content: message.content,
    metadata,
    status,
    timestamp: message.createdAt,
    eventId: getActionEventId({ ...message, metadata }),
  };
}

function isEmptyToolInput(input: ToolCall["input"] | undefined) {
  return input === undefined ||
    input === null ||
    input === "" ||
    (typeof input === "object" && !Array.isArray(input) && Object.keys(input).length === 0);
}

function mergeReplayToolCall(previous: ToolCall | undefined, incoming: ToolCall): ToolCall {
  if (!previous) return incoming;
  const keepTerminalStatus = (previous.status === "completed" || previous.status === "error") && incoming.status === "running";
  return {
    ...previous,
    ...incoming,
    status: keepTerminalStatus ? previous.status : incoming.status,
    input: isEmptyToolInput(incoming.input) ? previous.input : incoming.input,
    output: incoming.output || previous.output,
    durationMs: incoming.durationMs ?? previous.durationMs,
    approvalContext: incoming.approvalContext || previous.approvalContext,
    runId: incoming.runId || previous.runId,
    messageId: incoming.messageId || previous.messageId,
    parentAgentId: incoming.parentAgentId || previous.parentAgentId,
    executionId: incoming.executionId || previous.executionId,
    agentId: incoming.agentId || previous.agentId,
    agentName: incoming.agentName || previous.agentName,
    iteration: incoming.iteration ?? previous.iteration,
    batchId: incoming.batchId || previous.batchId,
    toolBatchId: incoming.toolBatchId || previous.toolBatchId,
    startTime: previous.startTime || incoming.startTime,
    completedAt: incoming.completedAt ?? previous.completedAt,
    lastUpdatedAt: incoming.lastUpdatedAt ?? previous.lastUpdatedAt,
  };
}

function mergeReplayActionStep(previous: Step, incoming: Step): Step {
  const metadata: any = {
    ...(previous.metadata || {}),
    ...(incoming.metadata || {}),
  };
  if (previous.metadata?.spawn || incoming.metadata?.spawn) {
    metadata.spawn = {
      ...(previous.metadata?.spawn || {}),
      ...(incoming.metadata?.spawn || {}),
      task: incoming.metadata?.spawn?.task || previous.metadata?.spawn?.task || incoming.content || previous.content || "",
    };
  }
  if (previous.metadata?.agentStream || incoming.metadata?.agentStream) {
    const previousContent = previous.metadata?.agentStream?.content || "";
    const incomingContent = incoming.metadata?.agentStream?.content || "";
    metadata.agentStream = {
      ...(previous.metadata?.agentStream || {}),
      ...(incoming.metadata?.agentStream || {}),
      content: incomingContent && previousContent.endsWith(incomingContent)
        ? previousContent
        : previousContent + incomingContent,
    };
  }
  if (
    (previous.status === "completed" || previous.status === "error" || previous.status === "cancelled") &&
    incoming.status === "running"
  ) {
    return { ...previous, metadata };
  }
  return {
    ...previous,
    ...incoming,
    metadata,
  };
}

function getToolCallIdFromMetadata(metadata: any): string | undefined {
  const meta = normalizeActionMetadata(metadata);
  return (
    meta?.toolCall?.toolCallId ||
    meta?.toolCall?.tool_call_id ||
    meta?.toolResult?.toolCallId ||
    meta?.toolResult?.tool_call_id
  );
}

function toolActionMessageToToolCall(message: Message): ToolCall | null {
  const metadata = normalizeActionMetadata(message.metadata);
  const toolCall = metadata?.toolCall;
  const toolResult = metadata?.toolResult;
  const id = getToolCallIdFromMetadata(metadata) || message.id;
  const name = toolResult?.toolName || toolResult?.tool_name || toolCall?.toolName || toolCall?.tool_name;

  if (!name) return null;

  const status: ToolCall["status"] =
    message.kind === "tool_result"
      ? toolResult?.status === "error" || toolResult?.status === "timeout"
        ? "error"
        : "completed"
      : toolCall?.status === "error"
        ? "error"
        : "running";

  const output = toolResult ? toolResultMetaToOutput(toolResult, message.content) : "";

  return {
    id,
    name,
    status,
    input: toolCall?.args || toolResult?.args || toolResult?.input || {},
    output,
    durationMs: toolResult?.durationMs ?? toolResult?.duration_ms,
    runId: metadata?.runId,
    messageId: metadata?.messageId,
    parentAgentId: metadata?.parentAgentId,
    executionId: metadata?.executionId,
    agentId: metadata?.agentId || metadata?.agent_id,
    agentName: metadata?.agentName || metadata?.agent_name,
    iteration: typeof metadata?.iteration === "number" ? metadata.iteration : undefined,
    batchId: toolResult?.batchId || toolResult?.batch_id || toolCall?.batchId || toolCall?.batch_id || metadata?.batchId || metadata?.toolBatchId,
    toolBatchId: toolResult?.toolBatchId || toolResult?.tool_batch_id || toolCall?.toolBatchId || toolCall?.tool_batch_id || metadata?.toolBatchId,
    startTime: message.createdAt,
    completedAt: status === "completed" || status === "error" ? message.createdAt : undefined,
    lastUpdatedAt: message.createdAt,
  };
}

export function coalesceTimelineMessages(messages: Message[]): Message[] {
  const output: Message[] = [];
  let pendingSteps: Step[] = [];
  let pendingTools = new Map<string, ToolCall>();

  const mergePendingStep = (step: Step) => {
    const existingIdx = pendingSteps.findIndex((pending) => pending.eventId && pending.eventId === step.eventId);
    if (existingIdx === -1) {
      pendingSteps.push(step);
    } else {
      pendingSteps[existingIdx] = mergeReplayActionStep(pendingSteps[existingIdx], step);
    }
  };

  const mergePendingTool = (toolCall: ToolCall) => {
    const previous = pendingTools.get(toolCall.id);
    const merged = mergeReplayToolCall(previous, toolCall);
    pendingTools.set(toolCall.id, merged);

    const existingStepIdx = pendingSteps.findIndex(
      (pending) => pending.type === "tool-call" && pending.toolCall?.id === toolCall.id
    );
    const toolStep: Step = { type: "tool-call", toolCall: merged };
    if (existingStepIdx === -1) {
      pendingSteps.push(toolStep);
    } else {
      pendingSteps[existingStepIdx] = toolStep;
    }
  };

  const flushPendingIntoMessage = (message: Message): Message => {
    const toolCalls = Array.from(pendingTools.values());
    const next = {
      ...message,
      toolCalls: [...toolCalls, ...(message.toolCalls || [])],
      steps: [...pendingSteps, ...(message.steps || [])],
      metadata: {
        ...(message.metadata || {}),
        ...(pendingSteps.length > 0 ? { timelineActionCount: pendingSteps.length } : {}),
      } as any,
    };
    pendingSteps = [];
    pendingTools = new Map();
    return next;
  };

  for (const message of messages) {
    if (isTimelineActionMessage(message)) {
      if (message.kind === "tool_call" || message.kind === "tool_result") {
        const toolCall = toolActionMessageToToolCall(message);
        if (toolCall) {
          mergePendingTool(toolCall);
        }
        continue;
      }
      mergePendingStep(actionMessageToStep(message));
      continue;
    }

    if (message.role === "assistant" && (pendingSteps.length > 0 || pendingTools.size > 0)) {
      output.push(flushPendingIntoMessage(message));
      continue;
    }

    if (message.role === "user" && (pendingSteps.length > 0 || pendingTools.size > 0)) {
      const toolCalls = Array.from(pendingTools.values());
      output.push({
        id: `timeline-${pendingSteps[0]?.eventId || toolCalls[0]?.id || Date.now()}`,
        sessionId: message.sessionId,
        role: "system",
        content: "",
        kind: "system",
        status: "sent",
        createdAt: pendingSteps[0]?.timestamp || message.createdAt || Date.now(),
        toolCalls,
        steps: pendingSteps,
      });
      pendingSteps = [];
      pendingTools = new Map();
    }

    output.push(message);
  }

  if (pendingSteps.length > 0 || pendingTools.size > 0) {
    const last = output[output.length - 1];
    if (last?.role === "assistant") {
      output[output.length - 1] = flushPendingIntoMessage(last);
    } else {
      const toolCalls = Array.from(pendingTools.values());
      output.push({
        id: `timeline-${pendingSteps[0]?.eventId || toolCalls[0]?.id || Date.now()}`,
        sessionId: last?.sessionId,
        role: "system",
        content: "",
        kind: "system",
        status: "sent",
        createdAt: pendingSteps[0]?.timestamp || Date.now(),
        toolCalls,
        steps: pendingSteps,
      });
    }
  }

  return output;
}
