import type { Message, Step, ToolCall } from "../../components/chat/types";

function stepKey(step: Step) {
  if (step.type === "tool-call" && step.toolCall?.id) return `tool:${step.toolCall.id}`;
  if (step.type === "action" && step.eventId) return `action:${step.eventId}`;
  if (step.type === "action") return `action:${step.kind || ""}:${step.content || ""}:${step.timestamp || ""}`;
  return `${step.type}:${step.content || ""}`;
}

export function mergeLiveToolState(fetched: Message, existing?: Message): Message {
  if (!existing?.toolCalls?.length && !existing?.steps?.length) {
    return fetched;
  }

  const liveTools = new Map<string, ToolCall>();
  existing.toolCalls?.forEach((tool) => liveTools.set(tool.id, tool));
  existing.steps?.forEach((step) => {
    if (step.type === "tool-call" && step.toolCall) {
      liveTools.set(step.toolCall.id, step.toolCall);
    }
  });

  const mergeTool = (tool: ToolCall): ToolCall => {
    const live = liveTools.get(tool.id);
    if (!live) return { ...tool, output: tool.output || "" };
    return {
      ...tool,
      status: live.status || tool.status,
      output: live.output || tool.output || "",
      durationMs: live.durationMs ?? tool.durationMs,
      attempts: live.attempts || tool.attempts,
      startTime: live.startTime ?? tool.startTime,
      completedAt: live.completedAt ?? tool.completedAt,
      lastUpdatedAt: live.lastUpdatedAt ?? tool.lastUpdatedAt,
      runId: live.runId || tool.runId,
      messageId: live.messageId || tool.messageId,
      parentAgentId: live.parentAgentId || tool.parentAgentId,
      executionId: live.executionId || tool.executionId,
      agentId: live.agentId || tool.agentId,
      agentName: live.agentName || tool.agentName,
      batchId: live.batchId || tool.batchId,
      toolBatchId: live.toolBatchId || tool.toolBatchId,
    };
  };

  const toolCallsById = new Map<string, ToolCall>();
  (fetched.toolCalls || []).forEach((tool) => toolCallsById.set(tool.id, mergeTool(tool)));
  liveTools.forEach((tool, id) => {
    if (!toolCallsById.has(id)) {
      toolCallsById.set(id, { ...tool, output: tool.output || "" });
    }
  });

  const stepIndexes = new Map<string, number>();
  const steps = (fetched.steps || []).map((step) => {
    const mergedStep = step.type === "tool-call" && step.toolCall
      ? { ...step, toolCall: mergeTool(step.toolCall) }
      : step;
    stepIndexes.set(stepKey(mergedStep), stepIndexes.size);
    return mergedStep;
  });

  existing.steps
    ?.filter((step) => step.type === "tool-call" || step.type === "action")
    .forEach((step) => {
      const key = stepKey(step);
      const existingIndex = stepIndexes.get(key);
      if (existingIndex !== undefined) {
        const current = steps[existingIndex];
        if (
          current.type === "action" &&
          step.type === "action" &&
          current.status !== "completed" &&
          (step.status === "completed" || step.status === "error")
        ) {
          steps[existingIndex] = {
            ...current,
            ...step,
            metadata: { ...(current.metadata || {}), ...(step.metadata || {}) },
          };
        }
        return;
      }
      stepIndexes.set(key, steps.length);
      if (step.type === "tool-call" && step.toolCall) {
        steps.push({ ...step, toolCall: mergeTool(step.toolCall) });
      } else {
        steps.push(step);
      }
    });

  return { ...fetched, toolCalls: Array.from(toolCallsById.values()), steps };
}

export function findLiveAssistantForFetched(
  fetched: Message,
  currentMessages: Message[],
  options?: { allowLatestFallback?: boolean }
): Message | undefined {
  const exact = currentMessages.find((message) => message.id === fetched.id);
  if (exact) return exact;
  if (fetched.role !== "assistant") return undefined;

  const liveAssistants = currentMessages.filter((message) => message.role === "assistant");
  if (liveAssistants.length === 0) return undefined;

  const fetchedContent = fetched.content?.trim();
  if (fetchedContent) {
    const contentMatch = [...liveAssistants]
      .reverse()
      .find((message) => {
        const liveContent = message.content?.trim();
        return Boolean(liveContent && (fetchedContent.includes(liveContent) || liveContent.includes(fetchedContent)));
      });
    if (contentMatch) return contentMatch;
  }

  if (!options?.allowLatestFallback) return undefined;

  const latest = liveAssistants[liveAssistants.length - 1];
  const hasLiveLedger = Boolean(latest.toolCalls?.length || latest.steps?.some((step) => step.type === "tool-call" || step.type === "action"));
  return latest.id.startsWith("temp-assistant-") && hasLiveLedger ? latest : undefined;
}
