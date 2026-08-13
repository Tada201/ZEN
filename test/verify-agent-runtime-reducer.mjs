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

const stale = reduceAgentRun(record, {
  kind: "text-delta",
  runId: "run-1",
  chatId: "chat-1",
  delta: " stale",
});
assert.equal(stale.parts[0].receivedText, "Hello world!");

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

console.log("agent runtime reducer verified");
