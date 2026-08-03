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

  const fetchedTools = new Map((fetched.toolCalls || []).map((tool) => [tool.id, tool]));
  const seenToolIds = new Set<string>();
  const toolCalls: ToolCall[] = [];

  (existing.toolCalls || []).forEach((tool) => {
    const fetchedT = fetchedTools.get(tool.id);
    toolCalls.push(fetchedT ? mergeTool(fetchedT) : tool);
    seenToolIds.add(tool.id);
  });

  (existing.steps || []).forEach((step) => {
    if (step.type !== "tool-call" || !step.toolCall || seenToolIds.has(step.toolCall.id)) return;
    const fetchedT = fetchedTools.get(step.toolCall.id);
    toolCalls.push(fetchedT ? mergeTool(fetchedT) : step.toolCall);
    seenToolIds.add(step.toolCall.id);
  });

  (fetched.toolCalls || []).forEach((tool) => {
    if (!seenToolIds.has(tool.id)) {
      toolCalls.push(tool);
      seenToolIds.add(tool.id);
    }
  });

  const fetchedSteps = fetched.steps || [];
  const consumedFetchedSteps = new Set<number>();
  const findFetchedStep = (liveStep: Step) => {
    if (liveStep.type === "tool-call" || liveStep.type === "action") {
      const key = stepKey(liveStep);
      return fetchedSteps.findIndex((step, index) => !consumedFetchedSteps.has(index) && stepKey(step) === key);
    }
    return fetchedSteps.findIndex((step, index) => !consumedFetchedSteps.has(index) && step.type === liveStep.type);
  };

  // The live sequence is the chronology authority. DB refreshes enrich these
  // slots instead of rebuilding the sequence with persisted text first.
  const steps = (existing.steps || [])
    .filter((step) => step.kind !== "chat_status")
    .map((liveStep) => {
      const fetchedIndex = findFetchedStep(liveStep);
      const persistedStep = fetchedIndex >= 0 ? fetchedSteps[fetchedIndex] : undefined;
      if (fetchedIndex >= 0) consumedFetchedSteps.add(fetchedIndex);

      if (liveStep.type === "tool-call" && liveStep.toolCall) {
        const persistedTool = persistedStep?.type === "tool-call" ? persistedStep.toolCall : undefined;
        return { ...persistedStep, ...liveStep, toolCall: mergeTool(persistedTool || liveStep.toolCall) };
      }
      if (liveStep.type === "action") {
        if (persistedStep?.type !== "action") return liveStep;
        const terminalLive = liveStep.status === "completed" || liveStep.status === "error" || liveStep.status === "cancelled";
        return {
          ...liveStep,
          ...persistedStep,
          status: terminalLive ? liveStep.status : persistedStep.status || liveStep.status,
          metadata: { ...(liveStep.metadata || {}), ...(persistedStep.metadata || {}) },
        };
      }
      if (persistedStep?.type === liveStep.type) {
        return { ...liveStep, ...persistedStep, content: persistedStep.content || liveStep.content };
      }
      return liveStep;
    });

  fetchedSteps.forEach((step, index) => {
    if (!consumedFetchedSteps.has(index)) {
      steps.push(step.type === "tool-call" && step.toolCall
        ? { ...step, toolCall: mergeTool(step.toolCall) }
        : step);
    }
  });

  // `chat:done` stops the local stream before the invalidated message query
  // necessarily observes the backend transaction. The live assistant is the
  // chronology/content authority for that handoff: never replace a richer
  // final answer with an older or empty fetched payload. This applies to all
  // assistant messages, not only deep-research messages.
  const liveContent = existing?.content || "";
  const fetchedContent = fetched.content || "";
  const preserveLiveContent = liveContent.trim().length > fetchedContent.trim().length;
  const liveReasoning = existing?.reasoning || "";
  const fetchedReasoning = fetched.reasoning || "";
  const preserveLiveReasoning = liveReasoning.trim().length > fetchedReasoning.trim().length;
  const preserveLiveTerminalStatus = preserveLiveContent && existing?.status === "sent" && fetched.status !== "sent";

  return {
    ...fetched,
    ...(preserveLiveContent ? { content: liveContent } : {}),
    ...(preserveLiveReasoning ? { reasoning: liveReasoning } : {}),
    ...(preserveLiveTerminalStatus ? { status: "sent" as const, error: undefined } : {}),
    toolCalls,
    steps,
  };
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
