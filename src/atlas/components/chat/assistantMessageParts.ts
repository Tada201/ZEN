import type { Message, SpawnMeta, Step, ToolCall } from "./types";

export interface ParsedCard {
  type: string;
  data: unknown;
}

export type GroupedAssistantStep =
  | (Step & { type: "text"; cards: ParsedCard[]; cleanText: string })
  | (Step & { type: "reasoning" | "action" })
  | { type: "tool-group"; toolCalls: ToolCall[] };

export function parseCardTags(text: string): { cards: ParsedCard[]; cleanText: string } {
  const cards: ParsedCard[] = [];

  if (!text || typeof text !== "string") {
    return { cards, cleanText: text || "" };
  }

  const regex = /<card>\s*([\s\S]*?)\s*<\/card>/gi;
  let match;
  const replacements: { start: number; end: number }[] = [];

  while ((match = regex.exec(text)) !== null) {
    const rawTag = match[0];
    const jsonContent = match[1];

    try {
      const parsed = JSON.parse(jsonContent.trim()) as Record<string, unknown>;
      if (parsed && typeof parsed === "object") {
        cards.push({
          type: typeof parsed.type === "string" ? parsed.type : typeof parsed.card === "string" ? parsed.card : "unknown",
          data: parsed.data || parsed,
        });
        replacements.push({ start: match.index, end: match.index + rawTag.length });
      }
    } catch {
      // Partial JSON during streaming is expected; keep the placeholder text.
    }
  }

  let cleanText: string;
  if (replacements.length > 0) {
    const parts: string[] = [];
    let lastEnd = 0;
    for (const { start, end } of replacements) {
      parts.push(text.slice(lastEnd, start));
      lastEnd = end;
    }
    parts.push(text.slice(lastEnd));
    cleanText = parts.join("").trim();
  } else {
    cleanText = text;
  }

  if (cleanText.includes("<card>")) {
    const idx = cleanText.indexOf("<card>");
    const afterCard = cleanText.substring(idx + 6).trimStart();
    if (afterCard.startsWith("{") || afterCard.startsWith("[")) {
      cleanText = `${cleanText.substring(0, idx).trim()}\n\n_Generating card..._`.trim();
    } else {
      cleanText = cleanText.replace("<card>", "");
    }
  }

  return { cards, cleanText };
}

function extractToolId(step: Step): string | undefined {
  if (step.toolCall?.id) return step.toolCall.id;
  if (!step.eventId?.startsWith("tool:")) return undefined;
  return step.eventId.slice("tool:".length);
}

function stringifyOutput(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstDefined<T = unknown>(...values: T[]): T | undefined {
  return values.find((value) => value !== undefined && value !== null && value !== "") as T | undefined;
}

function stringField(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  const value = firstDefined(...keys.map((key) => record[key]));
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberField(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  const value = firstDefined(...keys.map((key) => record[key]));
  return typeof value === "number" ? value : undefined;
}

export function toolResultMetaToOutput(toolResult: unknown, fallback?: unknown): string {
  const result = asRecord(toolResult);
  const rawResult = result.rawResult ?? result.raw_result;
  const contentSummary = result.contentSummary ?? result.content_summary;
  const files = result.files ?? result.changedFiles ?? result.changed_files;
  const outputRecord = asRecord(rawResult);

  if (Object.keys(outputRecord).length > 0) {
    return stringifyOutput({
      ...outputRecord,
      summary: outputRecord.summary ?? contentSummary,
      files: outputRecord.files ?? outputRecord.changedFiles ?? outputRecord.changed_files ?? files,
    });
  }

  if (rawResult !== undefined && rawResult !== null && rawResult !== "") {
    if (files || contentSummary) {
      return stringifyOutput({
        output: rawResult,
        summary: contentSummary,
        files,
      });
    }
    return stringifyOutput(rawResult);
  }

  if (files) {
    return stringifyOutput({
      summary: contentSummary ?? fallback,
      files,
    });
  }

  return stringifyOutput(contentSummary ?? fallback);
}

function toolActionToCall(step: Step): ToolCall | undefined {
  if (step.type !== "action" || (step.kind !== "tool_call" && step.kind !== "tool_result")) return undefined;

  const toolCall = asRecord(step.metadata?.toolCall);
  const toolResult = asRecord(step.metadata?.toolResult);
  const name =
    stringField(toolResult, "toolName", "tool_name", "name") ||
    stringField(toolCall, "toolName", "tool_name", "name");
  if (!name) return undefined;

  const resultStatus = stringField(toolResult, "status");
  const status =
    step.status === "error" || resultStatus === "error" || resultStatus === "timeout"
      ? "error"
      : step.status === "completed" || resultStatus === "ok"
        ? "completed"
        : "running";

  const output = Object.keys(toolResult).length > 0 ? toolResultMetaToOutput(toolResult, step.content) : "";
  const input = firstDefined(toolResult.args, toolResult.arguments, toolCall.args, toolCall.arguments, {});

  return {
    id: extractToolId(step) || step.eventId || `${name}-${step.timestamp || 0}`,
    name,
    status,
    input: input as ToolCall["input"],
    output,
    durationMs: numberField(toolResult, "durationMs", "duration_ms") || numberField(toolCall, "durationMs", "duration_ms"),
    runId: step.metadata?.runId,
    messageId: step.metadata?.messageId,
    parentAgentId: step.metadata?.parentAgentId,
    executionId: step.metadata?.executionId,
    agentId: step.metadata?.agentId,
    agentName: step.metadata?.agentName,
    iteration: typeof step.metadata?.iteration === "number" ? step.metadata.iteration : undefined,
    batchId: stringField(toolResult, "batchId", "batch_id", "toolBatchId", "tool_batch_id") ||
      stringField(toolCall, "batchId", "batch_id", "toolBatchId", "tool_batch_id") ||
      step.metadata?.batchId ||
      step.metadata?.toolBatchId,
    toolBatchId: stringField(toolResult, "toolBatchId", "tool_batch_id") ||
      stringField(toolCall, "toolBatchId", "tool_batch_id") ||
      step.metadata?.toolBatchId,
    startTime: step.timestamp,
    completedAt: status === "completed" || status === "error" ? step.timestamp : undefined,
    lastUpdatedAt: step.timestamp,
  };
}

function shouldHideToolActionStep(step: Step, visibleToolIds: Set<string>) {
  if (step.type !== "action" || (step.kind !== "tool_call" && step.kind !== "tool_result")) return false;
  if (step.kind === "tool_result") return false;
  const id = extractToolId(step);
  return Boolean(id && visibleToolIds.has(id));
}

type MutableGroupedStep = Step | { type: "tool-group"; toolCalls: ToolCall[] };

function isTerminalToolStatus(status?: ToolCall["status"]) {
  return status === "completed" || status === "error";
}

function inputIsEmptyObject(input: ToolCall["input"]) {
  return typeof input === "object" && input !== null && !Array.isArray(input) && Object.keys(input).length === 0;
}

function explicitToolBatchId(tool: ToolCall) {
  return tool.toolBatchId || tool.batchId;
}

function mergeGroupedToolCall(existing: ToolCall, incoming: ToolCall): ToolCall {
  const shouldKeepTerminalStatus = isTerminalToolStatus(existing.status) && incoming.status === "running";
  return {
    ...existing,
    ...incoming,
    status: shouldKeepTerminalStatus ? existing.status : incoming.status,
    input: inputIsEmptyObject(incoming.input) ? existing.input : incoming.input ?? existing.input,
    output: incoming.output || existing.output,
    durationMs: incoming.durationMs ?? existing.durationMs,
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
    startTime: existing.startTime || incoming.startTime,
    completedAt: incoming.completedAt ?? existing.completedAt,
    lastUpdatedAt: incoming.lastUpdatedAt ?? existing.lastUpdatedAt,
  };
}

function shouldKeepToolBatchOpen(step: MutableGroupedStep) {
  if (step.type === "tool-group") return true;
  if (step.type !== "action") return false;
  return (
    step.kind === "chat_status" ||
    step.kind === "orchestrator_progress" ||
    step.kind === "tool_call" ||
    step.kind === "tool_result"
  );
}

function agentLifecycleKey(step: Step) {
  if (step.type !== "action" || (step.kind !== "agent_spawn" && step.kind !== "agent_complete")) return "";
  const spawn = step.metadata?.spawn;
  const parent = spawn?.parentAgent || "main";
  const child = spawn?.childAgent || step.metadata?.agentName || step.metadata?.agentId;
  const task = spawn?.task || step.content || "";
  const iteration = step.metadata?.iteration;
  if (!child) return "";
  return [parent, child, task, iteration ?? ""].join("::");
}

function mergeAgentLifecycleStep(existing: Step, incoming: Step): Step {
  const existingSpawn = existing.metadata?.spawn;
  const incomingSpawn = incoming.metadata?.spawn;
  const mergedSpawn: SpawnMeta | undefined =
    existingSpawn || incomingSpawn
      ? {
          parentAgent: incomingSpawn?.parentAgent || existingSpawn?.parentAgent || "main",
          childAgent: incomingSpawn?.childAgent || existingSpawn?.childAgent || incoming.metadata?.agentName || existing.metadata?.agentName || "agent",
          task: incomingSpawn?.task || existingSpawn?.task || incoming.content || existing.content || "",
          status: incomingSpawn?.status || existingSpawn?.status || "spawned",
          durationMs: incomingSpawn?.durationMs ?? existingSpawn?.durationMs,
        }
      : undefined;

  return {
    ...existing,
    ...incoming,
    kind: incoming.kind,
    status: incoming.status || existing.status,
    content: incoming.content || existing.content,
    timestamp: incoming.timestamp ?? existing.timestamp,
    eventId: incoming.eventId || existing.eventId,
    metadata: {
      ...existing.metadata,
      ...incoming.metadata,
      spawn: mergedSpawn,
      resultSummary: incoming.metadata?.resultSummary || existing.metadata?.resultSummary,
    },
  };
}

function mergeOpenAgentLifecycle(grouped: MutableGroupedStep[], incoming: Step) {
  const incomingKey = agentLifecycleKey(incoming);
  if (!incomingKey) return false;

  for (let i = grouped.length - 1; i >= 0; i -= 1) {
    const item = grouped[i];
    if (item.type === "tool-group") continue;
    const existingKey = agentLifecycleKey(item);
    if (existingKey && existingKey === incomingKey) {
      grouped[i] = mergeAgentLifecycleStep(item, incoming);
      return true;
    }
  }

  return false;
}

function findOpenToolGroup(grouped: MutableGroupedStep[], incoming: ToolCall): { type: "tool-group"; toolCalls: ToolCall[] } | undefined {
  for (let i = grouped.length - 1; i >= 0; i -= 1) {
    const item = grouped[i];
    if (item.type === "tool-group") {
      const incomingBatchId = explicitToolBatchId(incoming);
      const groupBatchIds = new Set(item.toolCalls.map(explicitToolBatchId).filter(Boolean));
      if (incomingBatchId && groupBatchIds.has(incomingBatchId)) return item;
      if (incomingBatchId && groupBatchIds.size > 0 && !groupBatchIds.has(incomingBatchId)) return undefined;
      const startTimes = item.toolCalls
        .map((tool) => tool.startTime)
        .filter((time): time is number => typeof time === "number");
      if (typeof incoming.startTime !== "number" || startTimes.length === 0) return item;
      const minStart = Math.min(...startTimes);
      const maxStart = Math.max(...startTimes);
      if (Math.max(maxStart, incoming.startTime) - Math.min(minStart, incoming.startTime) < 750) return item;
      return undefined;
    }
    if (!shouldKeepToolBatchOpen(item)) return undefined;
  }
  return undefined;
}

function pushGroupedStep(grouped: MutableGroupedStep[], step: Step) {
  const last = grouped[grouped.length - 1];
  if (last && last.type === "text" && step.type === "text") {
    last.content = (last.content || "") + (step.content || "");
  } else if (last && last.type === "reasoning" && step.type === "reasoning") {
    last.content = `${(last.content || "").trim()}\n${(step.content || "").trim()}`;
  } else if (step.type === "tool-call" && step.toolCall) {
    const openGroup = findOpenToolGroup(grouped, step.toolCall);
    if (openGroup) {
      const existingIndex = openGroup.toolCalls.findIndex((tool) => tool.id === step.toolCall?.id);
      if (existingIndex === -1) {
        openGroup.toolCalls.push(step.toolCall);
      } else {
        openGroup.toolCalls[existingIndex] = mergeGroupedToolCall(openGroup.toolCalls[existingIndex], step.toolCall);
      }
    } else {
      grouped.push({ type: "tool-group", toolCalls: [step.toolCall] });
    }
  } else if (mergeOpenAgentLifecycle(grouped, step)) {
    return;
  } else {
    grouped.push({ ...step });
  }
}

export function groupAssistantSteps(steps: Step[] | undefined): GroupedAssistantStep[] {
  if (!steps || steps.length === 0) return [];

  const grouped: MutableGroupedStep[] = [];
  const visibleToolIds = new Set(
    steps
      .filter((step) => step?.type === "tool-call")
      .map(extractToolId)
      .filter((id): id is string => Boolean(id)),
  );

  steps.filter(Boolean).forEach((step) => {
    if (shouldHideToolActionStep(step, visibleToolIds)) return;

    const syntheticTool = toolActionToCall(step);
    if (syntheticTool) {
      pushGroupedStep(grouped, { type: "tool-call", toolCall: syntheticTool });
      return;
    }
    if (step.type === "action" && (step.kind === "tool_call" || step.kind === "tool_result")) return;

    pushGroupedStep(grouped, step);
  });

  return grouped.map((step) => {
    if (step.type === "text") {
      const { cards, cleanText } = parseCardTags(step.content || "");
      return { ...step, cards, cleanText };
    }
    return step;
  }) as GroupedAssistantStep[];
}

export function legacyMessageToActionStep(message: Message): Step | undefined {
  if (!message.kind) return undefined;
  if (
    message.kind !== "agent_handoff" &&
    message.kind !== "agent_spawn" &&
    message.kind !== "agent_complete" &&
    message.kind !== "approval_request" &&
    message.kind !== "clarification_request"
  ) {
    return undefined;
  }

  return {
    type: "action",
    kind: message.kind,
    content: message.content,
    status: message.metadata?.status || (message.kind === "agent_complete" ? "completed" : "running"),
    metadata: message.metadata,
    timestamp: message.createdAt,
    eventId: `legacy:${message.id}`,
  };
}

export function groupToolCalls(toolCalls: ToolCall[] | undefined): ToolCall[] {
  if (!toolCalls || toolCalls.length === 0) return [];

  const grouped: ToolCall[] = [];
  toolCalls.forEach((tc) => {
    const prev = grouped[grouped.length - 1];
    if (prev && prev.name === tc.name && prev.status === "error" && tc.status !== "error") {
      prev.retries = (prev.retries || 0) + 1;
      prev.status = tc.status;
      prev.output = tc.output;
      prev.id = tc.id;
      prev.agentId = tc.agentId || prev.agentId;
      prev.agentName = tc.agentName || prev.agentName;
      prev.iteration = tc.iteration ?? prev.iteration;
    } else {
      grouped.push({ ...tc, retries: 0 });
    }
  });
  return grouped;
}
