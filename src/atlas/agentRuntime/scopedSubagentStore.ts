import { useSyncExternalStore } from "react";
import type { Step, ToolCall } from "../components/chat/types";
import { selectOwnedChildTools, mergeScopedSubagentRecords, type ScopedSubagentRecord } from "./subagentRuntime";

const records = new Map<string, ScopedSubagentRecord>();
const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function key(chatId: string, spawnId: string) {
  return `${chatId}:${spawnId}`;
}

function hasChanged(a: ScopedSubagentRecord | undefined, b: ScopedSubagentRecord): boolean {
  if (!a) return true;
  return a.status !== b.status
    || a.resultSummary !== b.resultSummary
    || a.error !== b.error
    || a.durationMs !== b.durationMs
    || a.timestamp !== b.timestamp
    || a.childToolCallIds.length !== b.childToolCallIds.length
    || a.task !== b.task
    || a.agentName !== b.agentName;
}

export function upsertScopedSubagent(chatId: string, record: ScopedSubagentRecord, silent = false): void {
  if (!chatId || !record.spawnId) return;
  const recordKey = key(chatId, record.spawnId);
  const previous = records.get(recordKey);
  const next = mergeScopedSubagentRecords(previous, record);
  if (!hasChanged(previous, next)) return;
  records.set(recordKey, next);
  if (!silent) notify();
}

export function upsertScopedSubagentFromStep(chatId: string, step: Step, silent = false): void {
  if (step.type !== "subagent" || !step.subagent?.spawnId) return;
  const subagent = step.subagent;
  upsertScopedSubagent(chatId, {
    spawnId: subagent.spawnId,
    parentToolCallId: subagent.parentToolCallId,
    agentId: subagent.agentId,
    agentName: subagent.agentName,
    task: subagent.task,
    status: subagent.recoveryState === "stale" ? "stale" : subagent.status,
    resultSummary: subagent.resultSummary,
    error: subagent.error,
    durationMs: subagent.durationMs,
    timestamp: subagent.timestamp,
    childToolCallIds: subagent.childToolCallIds || [],
  }, silent);
}

/** Notify all subscribers after a batch of silent upserts. */
export function flushScopedSubagentNotifications(): void {
  notify();
}

export function getScopedSubagent(chatId: string, spawnId: string): ScopedSubagentRecord | undefined {
  return records.get(key(chatId, spawnId));
}

export function getScopedSubagentChildTools(chatId: string, spawnId: string, tools: ToolCall[]): ToolCall[] {
  const record = getScopedSubagent(chatId, spawnId);
  if (!record) return [];
  return selectOwnedChildTools(record, tools);
}

export function clearScopedSubagents(chatId: string): void {
  let changed = false;
  for (const recordKey of records.keys()) {
    if (recordKey.startsWith(`${chatId}:`)) {
      records.delete(recordKey);
      changed = true;
    }
  }
  if (changed) notify();
}

export function subscribeScopedSubagents(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return version;
}

export function useScopedSubagent(chatId: string | undefined, spawnId: string | undefined) {
  useSyncExternalStore(subscribeScopedSubagents, getSnapshot, getSnapshot);
  return chatId && spawnId ? getScopedSubagent(chatId, spawnId) : undefined;
}
