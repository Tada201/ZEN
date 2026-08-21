import type { Message, Step } from "../components/chat/types";
import { normalizeExecutionStatus, type CanonicalExecutionStatus } from "./executionTrace.ts";

/** Runtime status is the canonical trace status, not a second vocabulary. */
export type AgentRunStatus = CanonicalExecutionStatus;

export function normalizeAgentRunStatus(
  phase: string | undefined,
  status: string | undefined,
): AgentRunStatus {
  return normalizeExecutionStatus(phase, status);
}

export type AgentTextState = "streaming" | "draining" | "done";

export interface AgentTextPart {
  type: "text";
  partId: string;
  runId: string;
  messageId?: string;
  sequence: number;
  receivedText: string;
  visibleText: string;
  state: AgentTextState;
}

export interface AgentReasoningPart {
  type: "reasoning";
  partId: string;
  runId: string;
  messageId?: string;
  sequence: number;
  receivedText: string;
  visibleText: string;
  state: AgentTextState;
}

export type AgentPart = AgentTextPart | AgentReasoningPart;

export interface AgentTurnRecord {
  runId: string;
  chatId: string;
  messageId?: string;
  status: AgentRunStatus;
  parts: AgentPart[];
  nextSequence: number;
  error?: string;
  finishReason?: string;
}

export type AgentRunEvent =
  | {
      kind: "text-delta" | "reasoning-delta";
      runId: string;
      chatId: string;
      messageId?: string;
      partId?: string;
      sequence?: number;
      delta: string;
    }
  | {
      kind: "run-finish";
      runId: string;
      chatId: string;
      messageId?: string;
      content?: string;
      finishReason?: string;
      sequence?: number;
    }
  | {
      kind: "run-error";
      runId: string;
      chatId: string;
      messageId?: string;
      error: string;
      sequence?: number;
    }
  | {
      kind: "run-cancel";
      runId: string;
      chatId: string;
      messageId?: string;
      sequence?: number;
    };

export function streamIdentity(runId: string, chatId: string, messageId?: string): string {
  return `${runId || chatId}:${messageId || "chat"}`;
}

export function partIdentity(
  runId: string,
  chatId: string,
  messageId: string | undefined,
  partId: string | undefined,
  kind: "text" | "reasoning",
): string {
  return `${streamIdentity(runId, chatId, messageId)}:${partId || kind}`;
}

export function isTerminalRunStatus(status: AgentRunStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function emptyAgentTurn(runId: string, chatId: string, messageId?: string): AgentTurnRecord {
  return {
    runId,
    chatId,
    messageId,
    status: "queued",
    parts: [],
    nextSequence: 0,
  };
}

export function projectTextPartToSteps(parts: AgentPart[]): Step[] {
  return parts
    .filter((part) => part.visibleText.length > 0)
    .sort((left, right) => left.sequence - right.sequence)
    .map((part) => ({
      type: part.type,
      content: part.visibleText,
      sequence: part.sequence,
      eventId: `runtime:${part.partId}`,
    }));
}

function stepSequence(step: Step, fallback: number): number {
  const sequence = step.sequence
    ?? (step.type === "tool-call" ? step.toolCall?.sequence : undefined)
    ?? step.metadata?.sequence;
  return typeof sequence === "number" && Number.isFinite(sequence)
    ? sequence
    : Number.MAX_SAFE_INTEGER + fallback;
}

/**
 * The single canonical ordering for an assistant timeline. Sorts by the
 * backend `sequence` (tool/action/subagent/runtime-text all carry it after the
 * Phase-1/2 wiring), falling back to arrival order for any step that still
 * lacks one. The sort is stable — equal keys keep their original index — so an
 * id-less legacy step never jumps a neighbour it truly arrived beside.
 *
 * This is the SSOT consumed by three places that previously ordered
 * independently: the live runtime/step merge, the render path
 * (AssistantMessage), and the persistence projection. Sharing one comparator
 * is what makes the live timeline and the reloaded timeline identical.
 */
export function orderSteps(steps: Step[]): Step[] {
  return steps
    .map((step, index) => ({ step, index }))
    .sort((left, right) =>
      stepSequence(left.step, left.index) - stepSequence(right.step, right.index) || left.index - right.index)
    .map(({ step }) => step);
}

/**
 * Merge canonical streamed prose with the execution steps owned by the chat
 * event reducers. Runtime text/reasoning steps are replaced on every flush so
 * a reveal frame cannot duplicate text; tool/action/subagent steps remain in
 * place and are ordered by their explicit backend sequence when available.
 */
export function mergeRuntimeTextPartsIntoSteps(parts: AgentPart[], existingSteps: Step[] = []): Step[] {
  const runtimeSteps = projectTextPartToSteps(parts);
  const retainedSteps = existingSteps.filter((step) =>
    !(step.type === "text" || step.type === "reasoning") || !step.eventId?.startsWith("runtime:"),
  );
  return orderSteps([...retainedSteps, ...runtimeSteps]);
}

export function projectAgentTurnToMessage(
  record: AgentTurnRecord,
  base: Message,
): Message {
  const text = record.parts
    .filter((part): part is AgentTextPart => part.type === "text")
    .sort((left, right) => left.sequence - right.sequence)
    .map((part) => part.visibleText)
    .join("");
  const reasoning = record.parts
    .filter((part): part is AgentReasoningPart => part.type === "reasoning")
    .map((part) => part.visibleText)
    .join("");
  const steps = projectTextPartToSteps(record.parts);
  const status: Message["status"] = record.status === "failed"
    ? "failed"
    : record.status === "cancelled"
      ? "cancelled"
      : record.status === "completed"
        ? "sent"
        : "sending";

  return {
    ...base,
    content: text || "",
    reasoning: reasoning || undefined,
    steps: steps.length > 0 ? steps : base.steps,
    status,
    error: record.error,
    isThinking: record.parts.some((part) => part.type === "reasoning" && part.state !== "done"),
  };
}
