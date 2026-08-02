import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const policySource = readFileSync(
  new URL("../src/atlas/components/chat/executionDisclosure.ts", import.meta.url),
  "utf8",
);
const transpiled = ts.transpileModule(policySource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "executionDisclosure.ts",
});
const policy = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`,
);

const {
  createDisclosureState,
  isDisclosureAttentionState,
  isDisclosureTerminalState,
  toggleDisclosure,
  transitionDisclosure,
} = policy;

function transition(status, initialOpen) {
  return transitionDisclosure(createDisclosureState(status, initialOpen), status);
}

// Live surfaces open for attention and remain open when the live run completes.
const liveRunning = createDisclosureState("running");
assert.equal(liveRunning.open, true, "running surfaces should open by default");
const liveCompleted = transitionDisclosure(liveRunning, "completed");
assert.equal(liveCompleted.open, true, "a live-open surface should stay open on completion");
assert.equal(liveCompleted.previousStatus, "completed", "completion should update the lifecycle status");
assert.equal(isDisclosureTerminalState("completed"), true, "completed should be terminal");
assert.equal(isDisclosureTerminalState("cancelled"), true, "cancelled should be terminal");

// Newly loaded completed history remains summary-first.
assert.equal(transition("completed", false).open, false, "completed history should remain collapsed by default");
assert.equal(transition("cancelled", false).open, false, "cancelled history should remain collapsed by default");

// Approval, error, and failed states are attention states and must be visible.
for (const status of ["awaiting_approval", "error", "failed"]) {
  assert.equal(isDisclosureAttentionState(status), true, `${status} should be an attention state`);
  assert.equal(transition(status, false).open, true, `${status} should open for user attention`);
}
assert.equal(isDisclosureAttentionState("completed"), false, "completed should not be an attention state");

// A deliberate user collapse wins over later lifecycle events, including a
// running -> completed transition. A deliberate expand also remains expanded.
const userCollapsed = toggleDisclosure(liveRunning, false);
assert.equal(userCollapsed.userToggled, true, "a manual toggle should claim disclosure ownership");
assert.equal(transitionDisclosure(userCollapsed, "completed").open, false, "completion must not reopen a manually collapsed surface");
assert.equal(transitionDisclosure(userCollapsed, "failed").open, false, "failure must not override a manual collapse");

const terminalToAttention = transitionDisclosure(createDisclosureState("completed", false), "failed");
assert.equal(terminalToAttention.open, true, "a terminal surface must reopen when a new failure needs attention");

const userExpanded = toggleDisclosure(createDisclosureState("completed", false), true);
assert.equal(transitionDisclosure(userExpanded, "running").open, true, "manual expansion should survive a live transition");
assert.equal(transitionDisclosure(userExpanded, "cancelled").open, true, "manual expansion should survive cancellation");

// The UI owners must use the same policy and must not reintroduce shimmer on
// active labels while retaining motion-safe status icons where appropriate.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const owners = [
  read("src/atlas/components/chat/AgentExecutionTrace.tsx"),
  read("src/atlas/components/chat/AgentDelegationLane.tsx"),
  read("src/atlas/components/chat/SubagentExecutionCard.tsx"),
  read("src/atlas/components/chat/ReasoningBlock.tsx"),
];
for (const source of owners) {
  assert(source.includes("transitionDisclosure"), "execution disclosure owner must consume lifecycle transitions");
  assert(source.includes("toggleDisclosure"), "execution disclosure owner must preserve user toggles");
  assert(!source.includes("text-premium-shimmer"), "execution disclosure owners must not use premium text shimmer");
  assert(!source.includes("animate-text-shimmer"), "execution disclosure owners must not use animated text shimmer");
}
const actionTrace = read("src/atlas/components/chat/AssistantMessageTrace.tsx");
const deepResearch = read("src/atlas/components/chat/DeepResearchRunMessage.tsx");
assert(!actionTrace.includes("text-premium-shimmer"), "active action labels must not shimmer");
assert(!deepResearch.includes("animate-text-shimmer"), "active research labels must not shimmer");
assert(actionTrace.includes("motion-safe:animate-spin"), "active action feedback should remain motion-safe");

console.log("execution disclosure lifecycle verified");
