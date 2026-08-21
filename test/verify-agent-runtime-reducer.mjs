import { strict as assert } from "node:assert";
import { reduceAgentRun, revealAgentRun } from "../src/atlas/agentRuntime/runReducer.ts";
import { emptyAgentTurn, mergeRuntimeTextPartsIntoSteps } from "../src/atlas/agentRuntime/types.ts";

let record = emptyAgentTurn("run-1", "chat-1", "msg-1");
record = reduceAgentRun(record, {
  kind: "text-delta",
  runId: "run-1",
  chatId: "chat-1",
  messageId: "msg-1",
  delta: "Hello ",
});
record = reduceAgentRun(record, {
  kind: "text-delta",
  runId: "run-1",
  chatId: "chat-1",
  messageId: "msg-1",
  delta: "world",
});
assert.equal(record.parts[0].receivedText, "Hello world");
assert.equal(record.parts[0].visibleText, "");

record = reduceAgentRun(record, {
  kind: "run-finish",
  runId: "run-1",
  chatId: "chat-1",
  messageId: "msg-1",
  content: "Hello world!",
});
assert.equal(record.status, "draining");
assert.equal(record.parts[0].receivedText, "Hello world!");
assert.equal(record.parts[0].visibleText, "");

record = revealAgentRun(record, 5);
assert.equal(record.parts[0].visibleText, "Hello");
assert.equal(record.status, "draining");
record = revealAgentRun(record, 100);
assert.equal(record.parts[0].visibleText, "Hello world!");
assert.equal(record.status, "completed");

// A text-delta arriving after the run drained to "completed" is the trailing
// `chat:chunk` that lost the Tauri event-name race with `chat:done`. It must
// re-open the drain and append, not be dropped — dropping it was the freeze
// that only a reload fixed.
let reopened = reduceAgentRun(record, {
  kind: "text-delta",
  runId: "run-1",
  chatId: "chat-1",
  messageId: "msg-1",
  delta: " and more",
});
assert.equal(reopened.status, "draining", "late text-delta must re-open the drain");
assert.equal(reopened.parts[0].receivedText, "Hello world! and more");
reopened = revealAgentRun(reopened, 100);
assert.equal(reopened.parts[0].visibleText, "Hello world! and more", "re-opened tail must reveal");
assert.equal(reopened.status, "completed");

// A failed/cancelled run stays terminal — no late delta re-opens it.
let sealed = reduceAgentRun(emptyAgentTurn("run-seal", "chat-1", "m"), { kind: "run-error", runId: "run-seal", chatId: "chat-1", messageId: "m", error: "boom" });
sealed = reduceAgentRun(sealed, { kind: "text-delta", runId: "run-seal", chatId: "chat-1", messageId: "m", delta: "late" });
assert.equal(sealed.status, "failed", "run-error stays terminal");
assert.equal(sealed.parts.length, 0, "no late part appended to a failed run");

// run-finish must never shrink text already accumulated from deltas. A partial
// or empty canonical `content` (deep_research handoff, cancelled path) would
// otherwise truncate the streamed answer to a fragment.
let grown = emptyAgentTurn("run-grow", "chat-1", "msg-grow");
grown = reduceAgentRun(grown, { kind: "text-delta", runId: "run-grow", chatId: "chat-1", messageId: "msg-grow", delta: "Full streamed answer" });
grown = reduceAgentRun(grown, { kind: "run-finish", runId: "run-grow", chatId: "chat-1", messageId: "msg-grow", content: "Full" });
assert.equal(grown.parts[0].receivedText, "Full streamed answer", "shorter run-finish content must not truncate streamed text");

// A run-error terminal must surface every received character immediately. The
// scheduler's reveal loop stops on terminal status, so the pending tail would
// otherwise stay hidden until a reload rehydrated the row from the DB.
let errored = emptyAgentTurn("run-err", "chat-1", "msg-err");
errored = reduceAgentRun(errored, {
  kind: "text-delta",
  runId: "run-err",
  chatId: "chat-1",
  messageId: "msg-err",
  delta: "Partial tail before failure",
});
assert.equal(errored.parts[0].visibleText, "", "text stays hidden until a reveal frame");
errored = reduceAgentRun(errored, {
  kind: "run-error",
  runId: "run-err",
  chatId: "chat-1",
  messageId: "msg-err",
  error: "stream stopped",
});
assert.equal(errored.status, "failed");
assert.equal(errored.error, "stream stopped");
assert.equal(errored.parts[0].visibleText, "Partial tail before failure", "run-error must reveal the full received tail");
assert.equal(errored.parts[0].state, "done");

// run-cancel behaves the same for the interrupted (recoverable) case.
let cancelled = emptyAgentTurn("run-cancel", "chat-1", "msg-cancel");
cancelled = reduceAgentRun(cancelled, {
  kind: "reasoning-delta",
  runId: "run-cancel",
  chatId: "chat-1",
  messageId: "msg-cancel",
  delta: "thinking tail",
});
cancelled = reduceAgentRun(cancelled, {
  kind: "run-cancel",
  runId: "run-cancel",
  chatId: "chat-1",
  messageId: "msg-cancel",
});
assert.equal(cancelled.status, "cancelled");
assert.equal(cancelled.parts[0].visibleText, "thinking tail", "run-cancel must reveal the full received tail");


const orderedRuntimeSteps = mergeRuntimeTextPartsIntoSteps([
  {
    type: "reasoning",
    partId: "reasoning-1",
    runId: "run-2",
    sequence: 1,
    receivedText: "Plan",
    visibleText: "Plan",
    state: "streaming",
  },
  {
    type: "text",
    partId: "text-1",
    runId: "run-2",
    sequence: 3,
    receivedText: "Answer",
    visibleText: "Answer",
    state: "streaming",
  },
], [
  { type: "tool-call", sequence: 2, toolCall: { id: "tool-1", name: "read_file", status: "completed", input: {}, output: "ok" } },
  { type: "action", kind: "checkpoint", status: "completed", metadata: { sequence: 4 } },
]);
assert.deepEqual(
  orderedRuntimeSteps.map((step) => step.type),
  ["reasoning", "tool-call", "text", "action"],
  "runtime prose must share one source-ordered timeline with execution steps",
);
const refreshedRuntimeSteps = mergeRuntimeTextPartsIntoSteps([
  {
    type: "reasoning",
    partId: "reasoning-1",
    runId: "run-2",
    sequence: 1,
    receivedText: "Plan updated",
    visibleText: "Plan updated",
    state: "streaming",
  },
  {
    type: "text",
    partId: "text-1",
    runId: "run-2",
    sequence: 3,
    receivedText: "Answer updated",
    visibleText: "Answer updated",
    state: "streaming",
  },
], orderedRuntimeSteps);
assert.equal(refreshedRuntimeSteps.filter((step) => step.type === "reasoning").length, 1, "runtime reveal frames must replace rather than duplicate reasoning");
assert.equal(refreshedRuntimeSteps.filter((step) => step.type === "text").length, 1, "runtime reveal frames must replace rather than duplicate text");
assert.equal(refreshedRuntimeSteps.find((step) => step.type === "text").content, "Answer updated", "runtime reveal should update the existing text block");

// Post-tool text split (T4): prose that resumes after a tool carries a higher
// event sequence, so it must open a NEW text part instead of folding back into
// the pre-tool block. Two text-deltas with different sequences => two parts.
let split = emptyAgentTurn("run-split", "chat-1", "msg-split");
split = reduceAgentRun(split, { kind: "text-delta", runId: "run-split", chatId: "chat-1", messageId: "msg-split", sequence: 0, delta: "Before tool." });
split = reduceAgentRun(split, { kind: "text-delta", runId: "run-split", chatId: "chat-1", messageId: "msg-split", sequence: 2, delta: "After tool." });
assert.equal(split.parts.length, 2, "text resuming at a higher sequence must open a new part, not merge backward");
assert.equal(split.parts[0].receivedText, "Before tool.", "pre-tool text stays in its own part");
assert.equal(split.parts[1].receivedText, "After tool.", "post-tool text lands in a fresh part");
// Consecutive deltas of ONE segment share a sequence and stay one part.
let contiguous = emptyAgentTurn("run-contig", "chat-1", "msg-contig");
contiguous = reduceAgentRun(contiguous, { kind: "text-delta", runId: "run-contig", chatId: "chat-1", messageId: "msg-contig", sequence: 5, delta: "Hello " });
contiguous = reduceAgentRun(contiguous, { kind: "text-delta", runId: "run-contig", chatId: "chat-1", messageId: "msg-contig", sequence: 5, delta: "world" });
assert.equal(contiguous.parts.length, 1, "same-sequence deltas stay in one part");
assert.equal(contiguous.parts[0].receivedText, "Hello world");
// A multi-part turn must not have run-finish overwrite the first part with the
// whole concatenated answer (which would duplicate the tail).
split = reduceAgentRun(split, { kind: "run-finish", runId: "run-split", chatId: "chat-1", messageId: "msg-split", content: "Before tool.After tool." });
assert.equal(split.parts[0].receivedText, "Before tool.", "run-finish must not clobber a split turn's first part");
assert.equal(split.parts.length, 2, "run-finish must not collapse a split turn back to one part");

console.log("agent runtime reducer verified");
