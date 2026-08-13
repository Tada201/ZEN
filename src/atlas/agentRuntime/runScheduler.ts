import { reduceAgentRun, revealAgentRun } from "./runReducer.ts";
import type { AgentRunEvent, AgentTurnRecord } from "./types.ts";

export interface AgentRunScheduler {
  dispatch: (event: AgentRunEvent) => void;
  get: (runId: string) => AgentTurnRecord | undefined;
  reveal: (runId: string, maxCharacters?: number) => AgentTurnRecord | undefined;
  clear: (runId: string) => void;
}

export function createAgentRunScheduler(
  onFlush?: (record: AgentTurnRecord) => void,
  requestFrame: (callback: FrameRequestCallback) => number = (callback) => requestAnimationFrame(callback),
  cancelFrame: (id: number) => void = (id) => cancelAnimationFrame(id),
): AgentRunScheduler {
  const records = new Map<string, AgentTurnRecord>();
  const pending = new Map<string, AgentRunEvent[]>();
  const frames = new Map<string, number>();

  const flush = (runId: string) => {
    frames.delete(runId);
    const events = pending.get(runId) || [];
    pending.delete(runId);
    let record = records.get(runId);
    for (const event of events) record = reduceAgentRun(record, event);
    if (!record) return;

    // The scheduler owns the visual reveal cadence. Network bursts are reduced
    // once per frame, then only a bounded amount becomes visible in that frame.
    record = revealAgentRun(record, 180);
    records.set(runId, record);
    onFlush?.(record);

    const stillDraining = record.status === "draining" && record.parts.some(
      (part) => part.visibleText.length < part.receivedText.length,
    );
    if (stillDraining && !frames.has(runId)) {
      frames.set(runId, requestFrame(() => flush(runId)));
    }
  };

  return {
    dispatch(event) {
      const events = pending.get(event.runId) || [];
      events.push(event);
      pending.set(event.runId, events);
      if (!frames.has(event.runId)) {
        frames.set(event.runId, requestFrame(() => flush(event.runId)));
      }
    },
    get(runId) {
      return records.get(runId);
    },
    reveal(runId, maxCharacters = 180) {
      const record = records.get(runId);
      if (!record) return undefined;
      const next = revealAgentRun(record, maxCharacters);
      records.set(runId, next);
      onFlush?.(next);
      return next;
    },
    clear(runId) {
      const frame = frames.get(runId);
      if (frame !== undefined) cancelFrame(frame);
      frames.delete(runId);
      pending.delete(runId);
      records.delete(runId);
    },
  };
}
