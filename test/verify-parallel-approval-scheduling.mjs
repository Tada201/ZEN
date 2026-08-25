import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const dispatchSource = ["mod.rs", "router.rs", "executors.rs", "completion.rs"]
  .map((f) => readFileSync(new URL(`../src-tauri/crates/zen-agent/src/runner/dispatch/${f}`, import.meta.url), "utf8")).join("");

const confirmIndex = dispatchSource.indexOf("PermissionDecision::Confirm");
const approvalIndex = dispatchSource.indexOf(".request_approval", confirmIndex);
const spawnBeforeApproval = dispatchSource.lastIndexOf("tokio::spawn(async move", approvalIndex);
const continueAfterHandle = dispatchSource.indexOf("continue;", approvalIndex);
const toolStartAfterApproval = dispatchSource.indexOf("AgentEvent::ToolStart", approvalIndex);
const executeAfterApproval = dispatchSource.indexOf(".execute_agent_tool", approvalIndex);

assert(confirmIndex !== -1, "tool dispatch should still handle approval-required tools");
assert(approvalIndex !== -1, "approval-required tools should request interactive approval");
assert(
  spawnBeforeApproval !== -1 && spawnBeforeApproval > confirmIndex,
  "approval wait should be scheduled inside a per-tool task instead of blocking the dispatch loop",
);
assert(
  continueAfterHandle !== -1 && continueAfterHandle > approvalIndex,
  "approval-required tool task should be pushed and the dispatch loop should continue scheduling the batch",
);
assert(
  toolStartAfterApproval !== -1 && toolStartAfterApproval > approvalIndex,
  "tool:start should be emitted only after approval succeeds",
);
assert(
  executeAfterApproval !== -1 && executeAfterApproval > toolStartAfterApproval,
  "approved tool execution should still route through ToolService after emitting tool:start",
);
assert(
  !dispatchSource.includes("async fn request_user_confirmation"),
  "old blocking approval helper should not remain as dead code",
);

console.log("parallel approval scheduling verifier passed");
