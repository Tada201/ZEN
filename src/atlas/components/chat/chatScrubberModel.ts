import type { Message, Step } from "./types";

export type ChatScrubberAccent = "approval" | "edit" | "agent";

export type ChatScrubberTick = {
  id: string;
  label: string;
  reply: string | null;
  accent: ChatScrubberAccent | null;
  weight: number;
};

const accentRank: Record<ChatScrubberAccent, number> = {
  approval: 3,
  edit: 2,
  agent: 1,
};

function firstLine(value: string | undefined, limit = 150): string | null {
  const line = value?.replace(/\s+/g, " ").trim().slice(0, limit);
  return line || null;
}

export function tickWeight(size = 0): number {
  return Math.min(3, 1 + Math.log10(1 + Math.max(0, size) / 60));
}

function stepAccent(step: Step): ChatScrubberAccent | null {
  const toolCall = step.toolCall;
  const toolMeta = step.metadata?.toolCall;
  const actionName = (toolCall?.name || toolMeta?.toolName || "").toLowerCase();
  const actionInput = toolCall?.input ?? toolMeta?.args ?? step.metadata?.approvalRequest?.arguments;
  const stepText = `${step.content || ""} ${typeof actionInput === "string" ? actionInput : JSON.stringify(actionInput || {})}`.toLowerCase();

  if (toolCall?.status === "awaiting_approval" || step.metadata?.approvalRequest) return "approval";
  if (actionName.includes("write_file") || actionName.includes("edit_file") || /edited?\s+file|file\s+change/.test(stepText)) return "edit";
  if (step.type === "subagent" || Boolean(step.subagent) || actionName.includes("spawn_agent") || actionName.includes("subagent")) return "agent";
  return null;
}

function strongerAccent(current: ChatScrubberAccent | null, next: ChatScrubberAccent | null) {
  if (!next) return current;
  return !current || accentRank[next] > accentRank[current] ? next : current;
}

function turnAccent(messages: Message[], startIndex: number): ChatScrubberAccent | null {
  let accent: ChatScrubberAccent | null = null;
  for (let index = startIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role === "user") break;
    for (const step of message.steps || []) accent = strongerAccent(accent, stepAccent(step));
    for (const call of message.toolCalls || []) {
      const name = call.name?.toLowerCase() || "";
      accent = strongerAccent(accent, name.includes("spawn_agent") || name.includes("subagent") ? "agent" : null);
      accent = strongerAccent(accent, name.includes("write_file") || name.includes("edit_file") ? "edit" : null);
      accent = strongerAccent(accent, call.status === "awaiting_approval" ? "approval" : null);
    }
  }
  return accent;
}

/** One navigation tick per user turn, matching the mockup's conversation spine. */
export function scrubberTicks(messages: Message[]): ChatScrubberTick[] {
  const ticks: ChatScrubberTick[] = [];

  messages.forEach((message, index) => {
    if (message.role !== "user") return;
    const label = firstLine(message.content);
    if (!label) return;

    let nextAssistant: Message | undefined;
    for (let nextIndex = index + 1; nextIndex < messages.length; nextIndex += 1) {
      const candidate = messages[nextIndex];
      if (candidate.role === "user") break;
      if (candidate.role === "assistant") {
        nextAssistant = candidate;
        break;
      }
    }
    ticks.push({
      id: message.id,
      label,
      reply: firstLine(nextAssistant?.content),
      accent: turnAccent(messages, index),
      weight: tickWeight(message.content.length),
    });
  });

  return ticks;
}

export function tickIndexAt(ticks: ChatScrubberTick[], ratio: number): number {
  if (ticks.length === 0) return -1;
  const total = ticks.reduce((sum, tick) => sum + tick.weight, 0);
  const target = Math.min(1, Math.max(0, ratio)) * total;
  let walked = 0;
  for (let index = 0; index < ticks.length; index += 1) {
    walked += ticks[index].weight;
    if (walked >= target) return index;
  }
  return ticks.length - 1;
}
