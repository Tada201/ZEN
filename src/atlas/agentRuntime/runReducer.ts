import {
  emptyAgentTurn,
  isTerminalRunStatus,
  partIdentity,
  type AgentPart,
  type AgentRunEvent,
  type AgentTurnRecord,
} from "./types.ts";

function getOrCreatePart(
  record: AgentTurnRecord,
  event: Extract<AgentRunEvent, { kind: "text-delta" | "reasoning-delta" }>,
): AgentPart {
  const type = event.kind === "text-delta" ? "text" : "reasoning";
  const id = partIdentity(record.runId, record.chatId, event.messageId, event.partId, type);
  const existing = record.parts.find((part) => part.partId === id);
  if (existing) return existing;

  const part: AgentPart = {
    type,
    partId: id,
    runId: record.runId,
    messageId: event.messageId,
    sequence: event.sequence ?? record.nextSequence,
    receivedText: "",
    visibleText: "",
    state: "streaming",
  };
  record.parts.push(part);
  return part;
}

export function reduceAgentRun(record: AgentTurnRecord | undefined, event: AgentRunEvent): AgentTurnRecord {
  const next = record
    ? {
        ...record,
        parts: record.parts.map((part) => ({ ...part })),
      }
    : emptyAgentTurn(event.runId, event.chatId, event.messageId);

  if (next.runId !== event.runId || next.chatId !== event.chatId || isTerminalRunStatus(next.status)) {
    return next;
  }

  const sequence = event.sequence ?? next.nextSequence;
  next.nextSequence = Math.max(next.nextSequence, sequence + 1);
  if (next.messageId === undefined && event.messageId) next.messageId = event.messageId;

  switch (event.kind) {
    case "text-delta":
    case "reasoning-delta": {
      const part = getOrCreatePart(next, event);
      part.receivedText += event.delta;
      next.status = "running";
      return next;
    }
    case "run-finish": {
      next.status = "draining";
      next.finishReason = event.finishReason;
      if (event.content !== undefined) {
        const textPart = next.parts.find((part) => part.type === "text");
        if (textPart) textPart.receivedText = event.content;
        else {
          next.parts.push({
            type: "text",
            partId: partIdentity(next.runId, next.chatId, next.messageId, undefined, "text"),
            runId: next.runId,
            messageId: next.messageId,
            sequence: next.nextSequence++,
            receivedText: event.content,
            visibleText: "",
            state: "draining",
          });
        }
      }
      return next;
    }
    case "run-error":
      next.status = "failed";
      next.error = event.error;
      next.parts.forEach((part) => { part.state = "done"; });
      return next;
    case "run-cancel":
      next.status = "cancelled";
      next.parts.forEach((part) => { part.state = "done"; });
      return next;
  }
}

export function revealAgentRun(record: AgentTurnRecord, maxCharacters = 180): AgentTurnRecord {
  const next = {
    ...record,
    parts: record.parts.map((part) => ({ ...part })),
  };
  let budget = Math.max(1, maxCharacters);

  for (const part of next.parts.sort((left, right) => left.sequence - right.sequence)) {
    if (budget <= 0) break;
    const remaining = part.receivedText.length - part.visibleText.length;
    if (remaining <= 0) {
      if (next.status === "draining") part.state = "done";
      continue;
    }
    const amount = Math.min(remaining, budget);
    part.visibleText = part.receivedText.slice(0, part.visibleText.length + amount);
    budget -= amount;
    if (part.visibleText.length === part.receivedText.length && next.status === "draining") {
      part.state = "done";
    }
  }

  const drained = next.status === "draining" && next.parts.every((part) => part.visibleText === part.receivedText);
  if (drained) next.status = "completed";
  return next;
}
