import { stripToolProtocolText } from "@/atlas/lib/toolProtocolText";

type RecordValue = Record<string, unknown>;

export interface CanonicalMessagePartProjection {
  content: string;
  reasoning?: string;
  steps: Array<RecordValue>;
  toolCalls: Array<RecordValue>;
}

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function extractInlineThoughtBlocks(content: string): { content: string; reasoning: string } {
  if (!content || !/<\/?(?:think|thought)>/i.test(content)) return { content, reasoning: "" };
  const reasoningParts: string[] = [];
  const regex = /<(?:thought|think)>([\s\S]*?)<\/(?:thought|think)>/ig;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match[1]?.trim()) reasoningParts.push(match[1].trim());
  }
  if (reasoningParts.length > 0) {
    return {
      content: content.replace(/<(?:thought|think)>[\s\S]*?<\/(?:thought|think)>/ig, "").trim(),
      reasoning: reasoningParts.join("\n\n"),
    };
  }
  const open = /<(?:thought|think)>/i.exec(content);
  return open
    ? { content: content.slice(0, open.index).trim(), reasoning: content.slice(open.index + open[0].length).trim() }
    : { content, reasoning: "" };
}

function isTerminalToolStatus(status: unknown): boolean {
  return status === "completed" || status === "error";
}

function mergeProjectedTool(existing: RecordValue, incoming: RecordValue): RecordValue {
  const existingIsTerminal = isTerminalToolStatus(existing.status);
  const incomingIsTerminal = isTerminalToolStatus(incoming.status);
  // `tool_calls` is a legacy summary column and can still contain the running
  // version while `steps_json` contains the final tool event. The ordered step
  // is authoritative for lifecycle state, but keep richer fields from either
  // source so reload does not lose the compact output or target.
  const useIncoming = incomingIsTerminal || !existingIsTerminal;
  const source = useIncoming ? incoming : existing;
  return {
    ...existing,
    ...source,
    status: source.status || existing.status,
    input: source.input || existing.input,
    output: source.output || (useIncoming ? "" : existing.output),
    outputPreview: source.outputPreview || (useIncoming ? undefined : existing.outputPreview),
    completedAt: source.completedAt ?? existing.completedAt,
    durationMs: source.durationMs ?? existing.durationMs,
  };
}

function mergeToolCalls(existing: Array<RecordValue>, steps: Array<RecordValue>): Array<RecordValue> {
  const result: Array<RecordValue> = [];
  const indexes = new Map<string, number>();
  for (const tool of existing) {
    const id = typeof tool.id === "string" ? tool.id : "";
    if (id && indexes.has(id)) continue;
    if (id) indexes.set(id, result.length);
    result.push(tool);
  }
  for (const step of steps) {
    if (step.type !== "tool-call" || !isRecord(step.toolCall)) continue;
    const id = typeof step.toolCall.id === "string" ? step.toolCall.id : "";
    const existingIndex = id ? indexes.get(id) : undefined;
    if (existingIndex !== undefined) {
      result[existingIndex] = mergeProjectedTool(result[existingIndex], step.toolCall);
      continue;
    }
    if (id) indexes.set(id, result.length);
    result.push(step.toolCall);
  }
  return result;
}

export function projectCanonicalMessageParts(input: {
  content?: string;
  reasoning?: string;
  steps?: unknown;
  toolCalls?: unknown;
  toolInvocations?: unknown;
}): CanonicalMessagePartProjection {
  const raw = typeof input.content === "string" ? input.content : "";
  const extracted = input.reasoning ? { content: raw, reasoning: input.reasoning } : extractInlineThoughtBlocks(raw);
  const content = stripToolProtocolText(extracted.content);
  const reasoning = extracted.reasoning || undefined;
  const steps = Array.isArray(input.steps)
    ? input.steps.filter(isRecord).map((step) => step.type === "text" ? { ...step, content: stripToolProtocolText(String(step.content || "")) } : step)
    : [];
  let toolCalls = mergeToolCalls(
    Array.isArray(input.toolCalls) ? input.toolCalls.filter(isRecord) : [],
    steps,
  );

  if (Array.isArray(input.toolInvocations)) {
    const legacy = input.toolInvocations.filter(isRecord).map((tool) => ({
      id: String(tool.toolCallId || ""),
      name: String(tool.toolName || "Tool"),
      status: tool.state === "result" ? "completed" : "running",
      input: tool.args,
      output: tool.state === "result" ? (typeof tool.result === "string" ? tool.result : JSON.stringify(tool.result ?? "")) : "",
    }));
    const existingIds = new Set(toolCalls.map((tool) => typeof tool.id === "string" ? tool.id : "").filter(Boolean));
    for (const tool of legacy) {
      if (tool.id && existingIds.has(tool.id)) continue;
      toolCalls.push(tool);
      if (tool.id) existingIds.add(tool.id);
    }
  }
  const canonicalSteps = steps.length > 0 ? steps : [
    ...(reasoning ? [{ type: "reasoning", content: reasoning }] : []),
    ...toolCalls.map((toolCall) => ({ type: "tool-call", toolCall })),
    ...(content ? [{ type: "text", content }] : []),
  ];

  return { content, reasoning, steps: canonicalSteps, toolCalls };
}
