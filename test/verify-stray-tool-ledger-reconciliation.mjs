import { loadSourceModule, closeSourceModuleLoader } from "./test-loader.mjs";
import { strict as assert } from "node:assert";

const strayToolLedger = await loadSourceModule("../src/atlas/hooks/stream/strayToolLedger.ts");
const { reconcileStrayToolLedgers } = strayToolLedger;

const makeAssistant = (id, toolCalls = []) => ({
  id,
  sessionId: "chat-1",
  role: "assistant",
  content: "",
  status: "sending",
  toolCalls,
  steps: [],
});

const makeLedger = (toolId, messageId) => ({
  id: `tool-ledger-${toolId}`,
  sessionId: "chat-1",
  role: "system",
  content: "",
  status: "sent",
  toolCalls: [
    {
      id: toolId,
      name: "read_file",
      status: "running",
      input: { path: "README.md" },
      output: "",
      messageId,
    },
  ],
  steps: [],
});

// 1. Basic stray merge: a tool-ledger created before the assistant exists is
// merged into the real assistant once the backend message ID arrives.
const initial1 = [makeLedger("t1", "opt-1"), makeAssistant("opt-1")];
const result1 = reconcileStrayToolLedgers(initial1, "opt-1", "backend-1");
assert.equal(result1.length, 1, "orphan ledger should be removed");
assert.equal(result1[0].id, "backend-1", "assistant should take backend ID");
assert.equal(result1[0].toolCalls.length, 1, "stray tool should be merged");
assert.equal(result1[0].toolCalls[0].id, "t1", "merged tool should keep its id");
assert.equal(result1[0].steps.length, 1, "stray tool should be mirrored as a step");
assert.equal(result1[0].steps[0].type, "tool-call", "mirrored step should be a tool-call step");
assert.equal(result1[0].steps[0].toolCall.id, "t1", "mirrored step should reference the stray tool");

// 2. A ledger whose tool belongs to a different assistant should not be merged.
const initial2 = [makeLedger("t2", "other-assistant"), makeAssistant("opt-2")];
const result2 = reconcileStrayToolLedgers(initial2, "opt-2", "backend-2");
assert.equal(result2.length, 2, "non-matching ledger should remain");
assert.equal(result2[0].id, "tool-ledger-t2", "non-matching ledger id should be preserved");
assert.equal(result2[1].id, "backend-2", "assistant should still take backend ID");
assert.equal(result2[1].toolCalls.length, 0, "non-matching tool should not be merged");

// 3. If the assistant already has a tool with the same id, the stray copy is
// dropped to avoid duplicates.
const initial3 = [
  makeLedger("t3", "opt-3"),
  makeAssistant("opt-3", [
    {
      id: "t3",
      name: "read_file",
      status: "completed",
      input: { path: "README.md" },
      output: "already done",
    },
  ]),
];
const result3 = reconcileStrayToolLedgers(initial3, "opt-3", "backend-3");
assert.equal(result3.length, 1, "ledger should be removed");
assert.equal(result3[0].toolCalls.length, 1, "duplicate stray tool should be discarded");
assert.equal(result3[0].toolCalls[0].status, "completed", "existing completed tool should be kept");

// 4. Multiple stray tools for the same turn are all merged.
const initial4 = [
  makeLedger("t4a", "opt-4"),
  makeLedger("t4b", "opt-4"),
  makeAssistant("opt-4"),
];
const result4 = reconcileStrayToolLedgers(initial4, "opt-4", "backend-4");
assert.equal(result4.length, 1, "both ledgers should be removed");
assert.equal(result4[0].toolCalls.length, 2, "both stray tools should be merged");

// 5. Stray tool steps are inserted before any existing text step.
const initial5 = [
  makeLedger("t5", "opt-5"),
  {
    ...makeAssistant("opt-5"),
    steps: [{ type: "text", content: "Final answer." }],
  },
];
const result5 = reconcileStrayToolLedgers(initial5, "opt-5", "backend-5");
assert.equal(result5[0].steps.length, 2, "tool step and text step should both be present");
assert.equal(result5[0].steps[0].type, "tool-call", "tool-call step should precede text step");
assert.equal(result5[0].steps[0].toolCall.id, "t5", "first step should reference the merged tool");
assert.equal(result5[0].steps[1].type, "text", "text step should remain after the tool step");

// 6. Regression: the assistant may already be finalized ("sent") by the time
// reconcile runs in chat:done (the finalize callback runs first). The
// optimistic → backend ID remapping must still work for finalized messages.
const initial6 = [
  makeLedger("t6", "opt-6"),
  { ...makeAssistant("opt-6"), status: "sent", content: "Done." },
];
const result6 = reconcileStrayToolLedgers(initial6, "opt-6", "backend-6");
assert.equal(result6.length, 1, "orphan ledger should be removed even when assistant is finalized");
assert.equal(result6[0].id, "backend-6", "finalized assistant should take backend ID");
assert.equal(result6[0].toolCalls.length, 1, "stray tool should be merged into finalized assistant");
assert.equal(result6[0].toolCalls[0].id, "t6", "merged tool should keep its id");
assert.equal(result6[0].status, "sent", "finalized status should be preserved after remap");

// 7. A cancelled assistant should also be remappable (e.g. abort mid-stream
// where the backend still assigns a real row ID).
const initial7 = [
  makeLedger("t7", "opt-7"),
  { ...makeAssistant("opt-7"), status: "cancelled" },
];
const result7 = reconcileStrayToolLedgers(initial7, "opt-7", "backend-7");
assert.equal(result7.length, 1, "orphan ledger should be removed for cancelled assistant");
assert.equal(result7[0].id, "backend-7", "cancelled assistant should take backend ID");
assert.equal(result7[0].toolCalls.length, 1, "stray tool should be merged into cancelled assistant");

// 8. A failed assistant must NOT be remapped — failed state is terminal and
// belongs to a different error path, not the optimistic→backend remap.
const initial8 = [
  makeLedger("t8", "opt-8"),
  { ...makeAssistant("opt-8"), status: "failed", error: "boom" },
];
const result8 = reconcileStrayToolLedgers(initial8, "opt-8", "backend-8");
assert.equal(result8.length, 2, "failed assistant should not be reconciled (ledger stays)");
assert.equal(result8[1].id, "opt-8", "failed assistant should keep its optimistic id");

// 9. Backend-id strays: tools created before the assistant existed carry the
// real backend message id (not the optimistic id). The reconcile must still
// merge them, and must still merge after the assistant was already remapped to
// that backend id by an earlier chat:message event.
const initial9 = [makeLedger("t9", "backend-9"), makeAssistant("opt-9")];
const result9 = reconcileStrayToolLedgers(initial9, "opt-9", "backend-9");
assert.equal(result9.length, 1, "backend-id orphan ledger should be removed");
assert.equal(result9[0].id, "backend-9", "assistant should take backend ID");
assert.equal(result9[0].toolCalls.length, 1, "backend-id stray tool should be merged");
assert.equal(result9[0].toolCalls[0].id, "t9", "merged backend-id tool should keep its id");

// 10. Assistant already remapped to the backend id (chat:message ran first),
// with an orphan ledger whose tool carries that backend id. reconcile must
// find the assistant by backend id and absorb the stray.
const initial10 = [makeLedger("t10", "backend-10"), makeAssistant("backend-10")];
const result10 = reconcileStrayToolLedgers(initial10, "backend-10", "backend-10");
assert.equal(result10.length, 1, "orphan ledger should merge even when opt id already equals backend id");
assert.equal(result10[0].toolCalls.length, 1, "backend-id stray should merge into already-remapped assistant");

await closeSourceModuleLoader();
console.log("stray tool ledger reconciliation ok");
